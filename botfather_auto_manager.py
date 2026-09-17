import asyncio
asyncio.set_event_loop(asyncio.new_event_loop())

import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.path.append(r"e:\Ganesh\ANIGRAVITY\allforward")

import json
import re
from pyrogram import Client
from config import Config

TOKEN_REGEX = re.compile(r"(\d{8,11}:[a-zA-Z0-9_-]{35})")

async def get_latest_botfather_msg(app, wait=2.0):
    await asyncio.sleep(wait)
    async for msg in app.get_chat_history("BotFather", limit=1):
        return msg
    return None

async def delete_all_existing_bots(app):
    print("\n--- Step 1: Checking and Deleting Existing Bots in @BotFather ---")
    deleted = 0
    while True:
        await app.send_message("BotFather", "/cancel")
        await asyncio.sleep(1.5)
        await app.send_message("BotFather", "/deletebot")
        msg = await get_latest_botfather_msg(app, 2.0)
        
        if not msg or not msg.text:
            break
            
        if "You don't have any bots yet" in msg.text or "no bots" in msg.text.lower():
            print("No existing bots found in @BotFather.")
            break
            
        # Check keyboard buttons
        bot_to_delete = None
        if msg.reply_markup and hasattr(msg.reply_markup, 'keyboard') and msg.reply_markup.keyboard:
            for row in msg.reply_markup.keyboard:
                for btn in row:
                    text = getattr(btn, 'text', str(btn))
                    if text.startswith("@"):
                        bot_to_delete = text
                        break
                if bot_to_delete:
                    break
                    
        if not bot_to_delete:
            print("No more bot buttons found to delete.")
            break
            
        print(f"Deleting bot: {bot_to_delete}...")
        await app.send_message("BotFather", bot_to_delete)
        confirm_msg = await get_latest_botfather_msg(app, 2.0)
        
        if confirm_msg and "Yes, I am totally sure." in confirm_msg.text:
            await app.send_message("BotFather", "Yes, I am totally sure.")
            res = await get_latest_botfather_msg(app, 2.0)
            print(f"BotFather result: {res.text if res else 'Done'}")
            deleted += 1
            await asyncio.sleep(1.5)
        else:
            print(f"Could not confirm deletion for {bot_to_delete}")
            await app.send_message("BotFather", "/cancel")
            break

    print(f"Total old bots deleted: {deleted}\n")
    return deleted

async def create_worker_bots(app, target_count=20):
    print(f"\n--- Step 2: Creating {target_count} Worker Bots ---")
    created_bots = []
    
    for i in range(1, target_count + 1):
        print(f"\nCreating Worker Bot #{i} of {target_count}...")
        
        # Reset any state
        await app.send_message("BotFather", "/cancel")
        await asyncio.sleep(1.5)
        
        # Start /newbot
        await app.send_message("BotFather", "/newbot")
        msg1 = await get_latest_botfather_msg(app, 2.0)
        
        bot_name = f"Fast Forward {i:02d}"
        print(f"   Setting Name: '{bot_name}'")
        await app.send_message("BotFather", bot_name)
        msg2 = await get_latest_botfather_msg(app, 2.0)
        
        # Username variations to test if taken
        candidates = [
            f"FastForward_{i:02d}_bot",
            f"Gmrxx_FastForward_{i:02d}_bot",
            f"FastForward_Gmrxx_{i:02d}_bot",
            f"FF_Gmrxx_{i:02d}_bot",
            f"GmrxxFF_{i:02d}_bot",
            f"FastFwd_{i:02d}_bot",
            f"FastFwd_Gmrxx_{i:02d}_bot",
        ]
        
        token = None
        chosen_username = None
        
        for cand in candidates:
            print(f"   Trying username: @{cand}...")
            await app.send_message("BotFather", cand)
            reply = await get_latest_botfather_msg(app, 2.5)
            
            if not reply or not reply.text:
                continue
                
            match = TOKEN_REGEX.search(reply.text)
            if match:
                token = match.group(1)
                chosen_username = cand
                print(f"   SUCCESS! Bot created: @{cand}")
                print(f"   Token: {token[:12]}...{token[-6:]}")
                break
            elif "already taken" in reply.text.lower() or "occupied" in reply.text.lower():
                print(f"   ⚠️ Username @{cand} is already taken, trying next candidate...")
                await asyncio.sleep(1.0)
            elif "invalid" in reply.text.lower():
                print(f"   ⚠️ Username @{cand} is invalid, trying next candidate...")
                await asyncio.sleep(1.0)
            elif "limit" in reply.text.lower() or "exceeded" in reply.text.lower():
                print(f"   🛑 Telegram Bot creation limit reached: {reply.text}")
                break
            else:
                print(f"   BotFather response: {reply.text[:100]}...")
                
        if token and chosen_username:
            created_bots.append({
                "index": i,
                "name": bot_name,
                "username": chosen_username,
                "token": token
            })
        else:
            print(f"   ❌ Failed to create bot #{i}")
            
        await asyncio.sleep(2.0)
        
    return created_bots

async def main():
    print("Connecting via Pyrogram SESSION2 (@ganeshmrxx)...")
    app = Client(
        "botfather_manager",
        api_id=Config.API_ID2,
        api_hash=Config.API_HASH2,
        session_string=Config.SESSION2,
        in_memory=True
    )
    await app.start()
    me = await app.get_me()
    print(f"Connected as: {me.first_name} (@{me.username}) ID: {me.id}")
    
    # 1. Delete existing bots
    await delete_all_existing_bots(app)
    
    # 2. Create up to 20 new worker bots
    bots = await create_worker_bots(app, target_count=20)
    
    # 3. Save to worker_bots.json
    output_file = r"e:\Ganesh\ANIGRAVITY\allforward\worker_bots.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(bots, f, indent=2)
    print(f"\nSaved {len(bots)} worker bots to {output_file}!")
    
    # 4. Update config.py with BOT_WORKERS list
    config_path = r"e:\Ganesh\ANIGRAVITY\allforward\config.py"
    with open(config_path, "r", encoding="utf-8") as f:
        config_content = f.read()
        
    worker_tokens = [b["token"] for b in bots]
    worker_str = f"BOT_WORKERS = {json.dumps(worker_tokens, indent=4)}\n"
    
    if "BOT_WORKERS =" in config_content:
        config_content = re.sub(r'BOT_WORKERS\s*=\s*\[.*?\]', f'BOT_WORKERS = {json.dumps(worker_tokens)}', config_content, flags=re.DOTALL)
    else:
        config_content += f"\n    # 20 Parallel FastForward Worker Bots\n    BOT_WORKERS = {json.dumps(worker_tokens, indent=4)}\n"
        
    with open(config_path, "w", encoding="utf-8") as f:
        f.write(config_content)
    print(f"Updated config.py with {len(worker_tokens)} BOT_WORKERS tokens!")
    
    await app.stop()
    print("\nALL OPERATIONS COMPLETED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(main())
