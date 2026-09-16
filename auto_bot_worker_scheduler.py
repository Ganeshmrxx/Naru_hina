import asyncio
asyncio.set_event_loop(asyncio.new_event_loop())

import sys
sys.stdout.reconfigure(encoding='utf-8')

import os
import json
import re
import datetime
import subprocess
import urllib.request
import urllib.error
from pyrogram import Client
from pyrogram.errors import FloodWait
from config import Config

TOKEN_REGEX = re.compile(r"(\d{8,11}:[a-zA-Z0-9_-]{35})")
COOLDOWN_REGEX = re.compile(r"try again in (\d+) seconds", re.IGNORECASE)

WORK_DIR = r"e:\Ganesh\ANIGRAVITY\allforward"
JSON_PATH = os.path.join(WORK_DIR, "worker_bots.json")
CONFIG_PATH = os.path.join(WORK_DIR, "config.py")
LOG_PATH = os.path.join(WORK_DIR, "bot_scheduler.log")

TARGET_BOTS = 20
BATCH_SIZE = 5
GAP_BETWEEN_BOTS_SECONDS = 10 * 60  # 10 minutes gap as requested

def log(msg):
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{now_str}] {msg}"
    print(formatted, flush=True)
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(formatted + "\n")
    except Exception:
        pass

def load_bots():
    if os.path.exists(JSON_PATH):
        try:
            with open(JSON_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return {b["index"]: b for b in data if "index" in b}
        except Exception as e:
            log(f"Error loading {JSON_PATH}: {e}")
    return {}

def save_and_sync(bots_dict):
    sorted_bots = [bots_dict[k] for k in sorted(bots_dict.keys())]
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(sorted_bots, f, indent=2)
        
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        config_text = f.read()
        
    worker_tokens = [b["token"] for b in sorted_bots if "token" in b]
    lines = [f'    # AllForward Worker Bots Pool ({len(worker_tokens)} Verified Active Bots)', '    BOT_WORKERS = [']
    for idx, t in enumerate(worker_tokens):
        comma = "," if idx < len(worker_tokens) - 1 else ""
        lines.append(f'        "{t}"{comma}')
    lines.append('    ]')
    replacement = "\n".join(lines)
    
    pattern = r" {4}# AllForward Worker Bots Pool.*?\n {4}BOT_WORKERS\s*=\s*\[.*?\]"
    if re.search(pattern, config_text, flags=re.DOTALL):
        config_text = re.sub(pattern, replacement, config_text, flags=re.DOTALL)
    elif re.search(r"BOT_WORKERS\s*=\s*\[.*?\]", config_text, flags=re.DOTALL):
        config_text = re.sub(r"BOT_WORKERS\s*=\s*\[.*?\]", replacement, config_text, flags=re.DOTALL)
        
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        f.write(config_text)
        
    log(f"Saved {len(sorted_bots)} bots to {JSON_PATH} and updated config.py")
    
    # Push to git
    try:
        subprocess.run(
            ["git", "add", "config.py", "worker_bots.json"],
            cwd=WORK_DIR, check=True, capture_output=True
        )
        subprocess.run(
            ["git", "commit", "-m", f"Auto-sync: {len(worker_tokens)} bots configured in BOT_WORKERS"],
            cwd=WORK_DIR, capture_output=True
        )
        subprocess.run(
            ["git", "push", "playtera", "main"],
            cwd=WORK_DIR, capture_output=True, timeout=30
        )
        log("Git commit and push to playtera:main completed successfully!")
    except Exception as ge:
        log(f"Git auto-push note: {ge}")

def verify_token_api(token):
    url = f"https://api.telegram.org/bot{token}/getMe"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=8) as response:
            data = json.loads(response.read().decode('utf-8'))
            if data.get("ok"):
                return data["result"]
    except Exception:
        pass
    return None

async def safe_send(app, text):
    while True:
        try:
            return await app.send_message("BotFather", text)
        except FloodWait as e:
            log(f"Telegram FloodWait: sleeping {e.value + 3}s...")
            await asyncio.sleep(e.value + 3)

async def get_latest_reply(app, wait=2.0):
    await asyncio.sleep(wait)
    async for msg in app.get_chat_history("BotFather", limit=1):
        return msg
    return None

async def check_botfather_cooldown(app):
    await safe_send(app, "/cancel")
    await asyncio.sleep(1.5)
    await safe_send(app, "/newbot")
    prompt = await get_latest_reply(app, 2.0)
    
    if not prompt or not prompt.text:
        return 0, "No reply"
        
    m = COOLDOWN_REGEX.search(prompt.text)
    if m:
        secs = int(m.group(1))
        return secs, prompt.text
        
    if "Alright" in prompt.text or "name" in prompt.text:
        return 0, "Ready"
        
    return 60, prompt.text

async def create_one_bot(app, index):
    bot_name = f"Xforward {index}"
    candidate_usernames = [
        f"Xforward{index}_bot",
        f"Xforward_{index}_bot",
        f"X_forward{index}_bot",
        f"Xforward0{index}_bot" if index < 10 else f"Xfwd_{index}_bot",
        f"Xfwd{index}_bot",
    ]
    
    log(f"Starting creation of Bot #{index} ({bot_name})...")
    await safe_send(app, "/cancel")
    await asyncio.sleep(1.5)
    
    await safe_send(app, "/newbot")
    prompt1 = await get_latest_reply(app, 2.0)
    
    if not prompt1 or not ("Alright" in (prompt1.text or "") or "name" in (prompt1.text or "")):
        log(f"Unexpected response to /newbot: {prompt1.text if prompt1 else 'None'}")
        await safe_send(app, "/cancel")
        return None
        
    await safe_send(app, bot_name)
    prompt2 = await get_latest_reply(app, 2.0)
    
    if not prompt2 or not ("username" in (prompt2.text or "") or "must end in" in (prompt2.text or "")):
        log(f"Unexpected response to bot name: {prompt2.text if prompt2 else 'None'}")
        await safe_send(app, "/cancel")
        return None
        
    for cand in candidate_usernames:
        log(f"   Trying username: @{cand}")
        await safe_send(app, cand)
        reply = await get_latest_reply(app, 2.5)
        
        if not reply or not reply.text:
            continue
            
        m = TOKEN_REGEX.search(reply.text)
        if m:
            token = m.group(1)
            log(f"   SUCCESS! Bot #{index} created: @{cand}")
            log(f"   Token: {token}")
            return {"index": index, "name": bot_name, "username": cand, "token": token}
        elif "already taken" in reply.text.lower() or "occupied" in reply.text.lower():
            log(f"   Username @{cand} is taken, trying alternate...")
            await asyncio.sleep(1.5)
        elif "invalid" in reply.text.lower():
            log(f"   Username @{cand} is invalid, trying alternate...")
            await asyncio.sleep(1.5)
        elif "limit" in reply.text.lower():
            log(f"   Daily bot creation limit reached: {reply.text}")
            return None
        else:
            log(f"   BotFather reply: {reply.text[:80]}")
            
    await safe_send(app, "/cancel")
    return None

async def scheduler_loop():
    log("=" * 60)
    log("ALLFORWARD 24-HOUR AUTO BOT CREATION SCHEDULER STARTED")
    log("=" * 60)
    
    app = Client(
        "auto_bot_scheduler",
        api_id=Config.API_ID2,
        api_hash=Config.API_HASH2,
        session_string=Config.Session4,
        in_memory=True
    )
    await app.start()
    me = await app.get_me()
    log(f"Session authenticated: {me.first_name} (ID: {me.id})")
    
    while True:
        bots_dict = load_bots()
        current_count = len(bots_dict)
        log(f"Current bot count: {current_count}/{TARGET_BOTS}")
        
        if current_count >= TARGET_BOTS:
            log(f"Target of {TARGET_BOTS} bots achieved! Scheduler task complete.")
            break
            
        # Check cooldown on BotFather
        cooldown_secs, status_msg = await check_botfather_cooldown(app)
        
        if cooldown_secs > 0:
            hrs = round(cooldown_secs / 3600, 2)
            mins = round(cooldown_secs / 60, 1)
            target_time = datetime.datetime.now() + datetime.timedelta(seconds=cooldown_secs)
            log(f"BotFather 24h limit active. Remaining: {cooldown_secs}s (~{hrs} hours / {mins} mins).")
            log(f"Auto-resume scheduled for: {target_time.strftime('%Y-%m-%d %H:%M:%S')}")
            
            # Sleep in intervals with periodic heartbeat log every hour
            remaining = cooldown_secs + 10
            while remaining > 0:
                sleep_chunk = min(remaining, 3600)  # Log every hour
                await asyncio.sleep(sleep_chunk)
                remaining -= sleep_chunk
                if remaining > 0:
                    r_hrs = round(remaining / 3600, 2)
                    log(f"Heartbeat: {r_hrs} hours remaining until next bot creation window.")
            continue
            
        # If ready, create up to BATCH_SIZE bots
        log(f"Creation window is OPEN! Creating next batch of up to {BATCH_SIZE} bots...")
        created_in_batch = 0
        
        for idx in range(1, TARGET_BOTS + 1):
            if idx in bots_dict and bots_dict[idx].get("token"):
                continue
                
            bot_res = await create_one_bot(app, idx)
            if bot_res:
                bots_dict[idx] = bot_res
                created_in_batch += 1
                save_and_sync(bots_dict)
                log(f"Progress: Bot #{idx} created ({created_in_batch}/{BATCH_SIZE} in this batch). Total: {len(bots_dict)}/{TARGET_BOTS}.")
            else:
                log(f"Could not create Bot #{idx}. Cooldown may have triggered.")
                break
                
            if len(bots_dict) >= TARGET_BOTS:
                log("All 20 bots successfully created!")
                break
                
            if created_in_batch >= BATCH_SIZE:
                log(f"Completed batch of {BATCH_SIZE} bots. Pausing until next cycle.")
                break
                
            # 5-minute gap between bots as requested by user
            log(f"Waiting {GAP_BETWEEN_BOTS_SECONDS // 60} minutes before creating next bot...")
            await asyncio.sleep(GAP_BETWEEN_BOTS_SECONDS)
            
        log("Batch cycle ended. Checking state for next run...")
        await asyncio.sleep(10)
        
    await app.stop()
    log("Scheduler finished gracefully.")

if __name__ == "__main__":
    asyncio.run(scheduler_loop())
