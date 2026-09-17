import asyncio
asyncio.set_event_loop(asyncio.new_event_loop())

import sys
sys.stdout.reconfigure(encoding='utf-8')

import json
import os
import pyrogram.utils
pyrogram.utils.MIN_CHANNEL_ID = -1009999999999
pyrogram.utils.MAX_CHANNEL_ID = -1000000000000

from pyrogram import Client
from pyrogram.types import ChatPrivileges
from pyrogram.errors import FloodWait, UserAlreadyParticipant
from config import Config

TARGET_CHANNELS = [
    {"id": -1004401442087, "title": "DBXVideos"},
    {"id": -1004337870091, "title": "DBXTera"}
]

WORKER_BOTS_JSON = r"e:\Ganesh\ANIGRAVITY\allforward\worker_bots.json"

async def main():
    print("=" * 60)
    print("ADDING ALL 12 WORKER BOTS TO TARGET CHANNELS")
    print("=" * 60)
    
    with open(WORKER_BOTS_JSON, "r", encoding="utf-8") as f:
        bots = json.load(f)
        
    print(f"Loaded {len(bots)} worker bots from {WORKER_BOTS_JSON}")
    
    app = Client(
        "worker_adder",
        api_id=Config.API_ID2,
        api_hash=Config.API_HASH2,
        session_string=Config.SESSION2,
        in_memory=True
    )
    await app.start()
    me = await app.get_me()
    print(f"Authenticated as: {me.first_name} (ID: {me.id})")
    
    privileges = ChatPrivileges(
        can_manage_chat=False,
        can_post_messages=True,
        can_edit_messages=True,
        can_delete_messages=True,
        can_invite_users=True
    )
    
    results = {}
    
    for channel in TARGET_CHANNELS:
        cid = channel["id"]
        c_title = channel["title"]
        print(f"\n--- Processing Channel: {c_title} ({cid}) ---")
        results[c_title] = {"success": [], "failed": []}
        
        for bot in bots:
            uname = bot["username"]
            b_name = bot.get("name", uname)
            
            try:
                # Promote automatically adds the bot to the channel as admin
                await app.promote_chat_member(
                    chat_id=cid,
                    user_id=uname,
                    privileges=privileges
                )
                print(f"  [OK] {b_name} (@{uname}) -> Added & Promoted as Admin in {c_title}")
                results[c_title]["success"].append(uname)
            except FloodWait as fw:
                print(f"  [WAIT] Telegram FloodWait: sleeping {fw.value + 2}s...")
                await asyncio.sleep(fw.value + 2)
                try:
                    await app.promote_chat_member(
                        chat_id=cid,
                        user_id=uname,
                        privileges=privileges
                    )
                    print(f"  [OK] {b_name} (@{uname}) -> Added & Promoted after wait")
                    results[c_title]["success"].append(uname)
                except Exception as e2:
                    print(f"  [FAIL] {b_name} (@{uname}) after wait: {e2}")
                    results[c_title]["failed"].append((uname, str(e2)))
            except Exception as e:
                print(f"  [FAIL] {b_name} (@{uname}): {e}")
                results[c_title]["failed"].append((uname, str(e)))
                
            await asyncio.sleep(1.5)  # Safe gap between promotions
            
    print("\n" + "=" * 60)
    print("VERIFYING CHANNEL ADMIN STATUS FOR ALL BOTS")
    print("=" * 60)
    
    for channel in TARGET_CHANNELS:
        cid = channel["id"]
        c_title = channel["title"]
        print(f"\nVerifying in {c_title} ({cid}):")
        
        for bot in bots:
            uname = bot["username"]
            try:
                member = await app.get_chat_member(cid, uname)
                is_admin = member.status.name in ["ADMINISTRATOR", "OWNER"]
                print(f"  @{uname:18} -> Status: {member.status.name} | CanPost: {getattr(member.privileges, 'can_post_messages', False)}")
            except Exception as e:
                print(f"  @{uname:18} -> Error: {e}")
                
    await app.stop()
    print("\nFINISHED! All worker bots processed.")

if __name__ == "__main__":
    asyncio.run(main())
