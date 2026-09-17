import asyncio
asyncio.set_event_loop(asyncio.new_event_loop())

import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.path.append(r"e:\Ganesh\ANIGRAVITY\allforward")

import re
import pyrogram.utils
# Fix for 64-bit Telegram Channel IDs
pyrogram.utils.MIN_CHANNEL_ID = -1009999999999
pyrogram.utils.MAX_CHANNEL_ID = -1000000000000

from pyrogram import Client
from pyrogram.raw.functions.messages import GetDialogFilters, UpdateDialogFilter
from pyrogram.raw.types import DialogFilter
from config import Config

TERABOX_REGEX = re.compile(r"(terabox|1024tera|nephobox|4funbox|mirrobox|momerybox)", re.IGNORECASE)

async def main():
    print("Connecting to Telegram via SESSION2...")
    app = Client(
        "folder_creator_session",
        api_id=Config.API_ID2,
        api_hash=Config.API_HASH2,
        session_string=Config.SESSION2,
        in_memory=True
    )
    await app.start()
    me = await app.get_me()
    print(f"Logged in as: {me.first_name} (@{me.username}) ID: {me.id}")
    
    # 1. Fetch all channel dialogs
    print("Auditing dialogs to classify channels...")
    target_hub = []
    restricted_video = []
    restricted_terabox = []
    terabox_links = []
    videos_db = []
    
    async for dialog in app.get_dialogs():
        chat = dialog.chat
        if chat.type.name not in ("CHANNEL", "SUPERGROUP"):
            continue
            
        is_owner = getattr(chat, 'is_creator', False)
        is_target = is_owner or (chat.title and (chat.title.startswith("DB") or chat.title.startswith("XDB")))
        
        if is_target:
            target_hub.append(chat)
            continue
            
        is_protected = getattr(chat, "has_protected_content", False)
        
        # Check title and recent messages for terabox
        has_terabox = bool(TERABOX_REGEX.search(chat.title or ""))
        try:
            async for msg in app.get_chat_history(chat.id, limit=5):
                text = (msg.caption or "") + " " + (msg.text or "")
                if TERABOX_REGEX.search(text):
                    has_terabox = True
                    break
        except Exception:
            pass
            
        if is_protected:
            if has_terabox:
                restricted_terabox.append(chat)
            else:
                restricted_video.append(chat)
        else:
            if has_terabox:
                terabox_links.append(chat)
            else:
                videos_db.append(chat)

    print(f"Classification complete:")
    print(f" - Target Hub: {len(target_hub)} chats")
    print(f" - Videos DB: {len(videos_db)} chats (capping at 100 for Free Tier limit)")
    print(f" - TeraBox Links: {len(terabox_links)} chats")
    print(f" - Restricted VIDEO: {len(restricted_video)} chats")
    print(f" - Restricted TERABOX: {len(restricted_terabox)} chats")
    
    # Free tier limit: max 100 peers per folder
    videos_db1 = videos_db[:100]
    videos_db2 = videos_db[100:200]
    
    # 2. Define folders to create
    folders_to_setup = [
        {"id": 4, "title": "🎯 Target Hub", "emoticon": "🎯", "chats": target_hub},
        {"id": 5, "title": "🎥 Videos DB1", "emoticon": "🎬", "chats": videos_db1},
        {"id": 9, "title": "🎥 Videos DB2", "emoticon": "🎬", "chats": videos_db2},
        {"id": 6, "title": "📦 TeraBox", "emoticon": "📦", "chats": terabox_links},
        {"id": 7, "title": "🔒 R-Videos", "emoticon": "🔒", "chats": restricted_video},
        {"id": 8, "title": "🔒 R-TeraBox", "emoticon": "📁", "chats": restricted_terabox},
    ]
    
    # 3. Resolve peers and create each folder
    for folder in folders_to_setup:
        fid = folder["id"]
        title = folder["title"]
        emoticon = folder["emoticon"]
        chats = folder["chats"]
        
        print(f"\nSetting up folder [{title}] (ID: {fid}) with {len(chats)} channels...")
        include_peers = []
        for c in chats:
            try:
                peer = await app.resolve_peer(c.id)
                include_peers.append(peer)
            except Exception as e:
                print(f"   Could not resolve peer {c.id} ({c.title}): {e}")
                
        # Construct DialogFilter
        dialog_filter = DialogFilter(
            id=fid,
            title=title,
            emoticon=emoticon,
            pinned_peers=[],
            include_peers=include_peers,
            exclude_peers=[],
            exclude_muted=False,
            exclude_read=False,
            exclude_archived=False
        )
        
        try:
            res = await app.invoke(UpdateDialogFilter(id=fid, filter=dialog_filter))
            print(f"   SUCCESS: Folder [{title}] created/updated on Telegram! Result: {res}")
        except Exception as e:
            print(f"   ERROR: Failed updating folder [{title}]: {e}")
            
    # 4. Verify existing filters from Telegram
    print("\n--- Final Verification: Reading All Dialog Filters from Telegram ---")
    current_filters = await app.invoke(GetDialogFilters())
    for f in current_filters:
        fid = getattr(f, 'id', 'N/A')
        title = getattr(f, 'title', 'All Chats')
        emoticon = getattr(f, 'emoticon', '')
        peers = getattr(f, 'include_peers', [])
        print(f" Filter ID: {fid} | Title: '{title}' | Icon: '{emoticon}' | Included Peers: {len(peers)}")
        
    await app.stop()
    print("\nAll chat folders have been configured successfully!")

if __name__ == "__main__":
    asyncio.run(main())
