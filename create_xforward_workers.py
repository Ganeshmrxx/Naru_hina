import asyncio
asyncio.set_event_loop(asyncio.new_event_loop())

import sys
sys.stdout.reconfigure(encoding='utf-8')

import os
import json
import re
import urllib.request
import urllib.error
from pyrogram import Client
from pyrogram.errors import FloodWait
from config import Config

TOKEN_REGEX = re.compile(r"(\d{8,11}:[a-zA-Z0-9_-]{35})")
COOLDOWN_REGEX = re.compile(r"try again in (\d+) seconds", re.IGNORECASE)

JSON_PATH = r"e:\Ganesh\ANIGRAVITY\allforward\worker_bots.json"
CONFIG_PATH = r"e:\Ganesh\ANIGRAVITY\allforward\config.py"

def load_existing_bots():
    if os.path.exists(JSON_PATH):
        try:
            with open(JSON_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return {b["index"]: b for b in data if "index" in b}
        except Exception as e:
            print(f"Warning loading {JSON_PATH}: {e}")
    return {}

def save_bots(bots_dict):
    sorted_bots = [bots_dict[k] for k in sorted(bots_dict.keys())]
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(sorted_bots, f, indent=2)
        
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        config_text = f.read()
        
    worker_tokens = [b["token"] for b in sorted_bots if "token" in b]
    lines = ['    BOT_WORKERS = [']
    for idx, t in enumerate(worker_tokens):
        comma = "," if idx < len(worker_tokens) - 1 else ""
        lines.append(f'        "{t}"{comma}')
    lines.append('    ]')
    replacement = "\n".join(lines)
    
    pattern = r" {4}BOT_WORKERS\s*=\s*\[.*?\]"
    if re.search(pattern, config_text, flags=re.DOTALL):
        config_text = re.sub(pattern, replacement, config_text, flags=re.DOTALL)
    elif re.search(r"BOT_WORKERS\s*=\s*\[.*?\]", config_text, flags=re.DOTALL):
        config_text = re.sub(r"BOT_WORKERS\s*=\s*\[.*?\]", replacement, config_text, flags=re.DOTALL)
        
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        f.write(config_text)
    print(f"   [SYNC] Saved {len(sorted_bots)} bots to JSON & config.py")

def verify_token(token):
    url = f"https://api.telegram.org/bot{token}/getMe"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode('utf-8'))
            if data.get("ok"):
                return data["result"]
    except Exception as e:
        pass
    return None

async def safe_send(app, text):
    while True:
        try:
            return await app.send_message("BotFather", text)
        except FloodWait as e:
            print(f"   [RateLimit] Sleeping {e.value + 3}s due to Telegram FloodWait...")
            await asyncio.sleep(e.value + 3)

async def get_latest_reply(app, wait=2.0):
    await asyncio.sleep(wait)
    async for msg in app.get_chat_history("BotFather", limit=1):
        return msg
    return None

async def create_single_bot(app, index):
    bot_name = f"Xforward {index}"
    candidate_usernames = [
        f"Xforward{index}_bot",
        f"Xforward_{index}_bot",
        f"X_forward{index}_bot",
        f"Xforward0{index}_bot" if index < 10 else f"Xfwd_{index}_bot",
        f"Xfwd{index}_bot",
    ]
    
    print(f"\n--- Creating Bot #{index} ({bot_name}) ---")
    
    while True:
        await safe_send(app, "/cancel")
        await asyncio.sleep(1.5)
        
        await safe_send(app, "/newbot")
        prompt1 = await get_latest_reply(app, 2.0)
        
        if not prompt1 or not prompt1.text:
            await asyncio.sleep(2)
            continue
            
        cd_match = COOLDOWN_REGEX.search(prompt1.text)
        if cd_match:
            cooldown_secs = int(cd_match.group(1)) + 5
            print(f"   ⏳ BotFather rate limit: waiting {cooldown_secs} seconds before retrying Bot #{index}...")
            await asyncio.sleep(cooldown_secs)
            continue
            
        if "Alright" in prompt1.text or "name" in prompt1.text:
            break
            
        print(f"   Unexpected reply to /newbot: {prompt1.text[:80]}... Retrying in 5s")
        await asyncio.sleep(5)
        
    await safe_send(app, bot_name)
    prompt2 = await get_latest_reply(app, 2.0)
    
    if not prompt2 or not ("username" in prompt2.text or "must end in" in prompt2.text):
        print(f"   Unexpected reply to name: {prompt2.text if prompt2 else 'None'}")
        await safe_send(app, "/cancel")
        return None

    for cand in candidate_usernames:
        print(f"   Attempting username: @{cand}...")
        await safe_send(app, cand)
        reply = await get_latest_reply(app, 2.5)
        
        if not reply or not reply.text:
            continue
            
        m = TOKEN_REGEX.search(reply.text)
        if m:
            token = m.group(1)
            print(f"   ✅ SUCCESS! Created @{cand}")
            print(f"   Token: {token}")
            return {"index": index, "name": bot_name, "username": cand, "token": token}
        elif "already taken" in reply.text.lower() or "occupied" in reply.text.lower():
            print(f"   ⚠️ @{cand} is taken, trying next candidate...")
            await asyncio.sleep(1.5)
        elif "invalid" in reply.text.lower():
            print(f"   ⚠️ @{cand} is invalid format, trying next...")
            await asyncio.sleep(1.5)
        elif "limit" in reply.text.lower():
            print(f"   🛑 Telegram Bot limit reached: {reply.text}")
            return None
        else:
            print(f"   BotFather response: {reply.text[:100]}...")
            
    await safe_send(app, "/cancel")
    return None

async def main():
    print("=" * 60)
    print("ALLFORWARD WORKER BOTS CREATION & REGISTRATION (Target: 20 Bots)")
    print("=" * 60)
    
    bots_dict = load_existing_bots()
    print(f"Loaded {len(bots_dict)} previously created bots from cache.")
    for idx, b in sorted(bots_dict.items()):
        print(f"  Bot #{idx}: @{b['username']} - Token: {b['token'][:10]}...{b['token'][-6:]}")
        
    app = Client(
        "bot_creator",
        api_id=Config.API_ID2,
        api_hash=Config.API_HASH2,
        session_string=Config.Session4,
        in_memory=True
    )
    await app.start()
    me = await app.get_me()
    print(f"\nLogged in as: {me.first_name} (ID: {me.id})")
    
    for idx in range(1, 21):
        if idx in bots_dict and bots_dict[idx].get("token"):
            continue
            
        bot_info = await create_single_bot(app, idx)
        if bot_info:
            bots_dict[idx] = bot_info
            save_bots(bots_dict)
        else:
            print(f"❌ Failed to create bot #{idx}.")
            
        await asyncio.sleep(3.5)
        
    await app.stop()
    
    print("\n" + "=" * 60)
    print("VERIFYING ALL 20 BOTS VIA TELEGRAM BOT API")
    print("=" * 60)
    
    for idx, b in sorted(bots_dict.items()):
        api_res = verify_token(b["token"])
        if api_res:
            b["bot_id"] = api_res["id"]
            b["first_name"] = api_res.get("first_name", b["name"])
            b["verified"] = True
            print(f"✅ Bot #{idx} Verified: @{b['username']} (ID: {b['bot_id']})")
        else:
            print(f"ℹ️ Bot #{idx}: @{b['username']} token saved.")
            
    save_bots(bots_dict)
    print(f"\nCOMPLETED! Total bots active: {len(bots_dict)}/20.")

if __name__ == "__main__":
    asyncio.run(main())
