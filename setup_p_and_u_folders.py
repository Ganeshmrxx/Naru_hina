import asyncio
asyncio.set_event_loop(asyncio.new_event_loop())

import sys
sys.stdout.reconfigure(encoding='utf-8')

import re
from pyrogram import Client
from pyrogram.raw.functions.messages import GetDialogFilters, UpdateDialogFilter
from pyrogram.raw.types import DialogFilter
from config import Config

TERABOX_REGEX = re.compile(r"(terabox|1024tera|nephobox|4funbox|mirrobox|momerybox)", re.IGNORECASE)

async def main():
    print("=" * 60)
    print("ALLFORWARD: SETTING UP PUBLIC (P) & USERBOT (U) CHAT FOLDERS")
    print("=" * 60)
    
    app = Client(
        "folder_setup_pu",
        api_id=Config.API_ID2,
        api_hash=Config.API_HASH2,
        session_string=Config.SESSION2,
        in_memory=True
    )
    await app.start()
    me = await app.get_me()
    print(f"Connected as: {me.first_name} (@{me.username}) ID: {me.id}")
    
    # 1. Classify all channels
    print("\nScanning all dialogs and classifying channels into P (Public) & U (Userbot)...")
    
    target_hub = []
    videos_p = []
    videos_u = []
    terabox_p = []
    terabox_u = []
    r_videos = []
    r_terabox = []
    
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
        has_terabox = bool(TERABOX_REGEX.search(chat.title or ""))
        
        try:
            async for msg in app.get_chat_history(chat.id, limit=5):
                text = (msg.caption or "") + " " + (msg.text or "")
                if TERABOX_REGEX.search(text):
                    has_terabox = True
                    break
        except Exception:
            pass
            
        is_public = bool(chat.username)
        
        if is_protected:
            if has_terabox:
                r_terabox.append(chat)
            else:
                r_videos.append(chat)
        else:
            if has_terabox:
                if is_public:
                    terabox_p.append(chat)
                else:
                    terabox_u.append(chat)
            else:
                if is_public:
                    videos_p.append(chat)
                else:
                    videos_u.append(chat)
                    
    print("\n--- Channel Audit Results ---")
    print(f"🎯 Target Hub:                    {len(target_hub)} channels")
    print(f"🎥 Videos DB1P (Public -> Bots):   {len(videos_p)} channels")
    print(f"🎥 Videos DB1U (Private -> Userbot): {len(videos_u)} channels")
    print(f"📦 TeraBox P (Public -> Bots):     {len(terabox_p)} channels")
    print(f"📦 TeraBox U (Private -> Userbot): {len(terabox_u)} channels")
    print(f"🔒 R-Videos (Restricted Video):   {len(r_videos)} channels")
    print(f"🔒 R-TeraBox (Restricted TeraBox): {len(r_terabox)} channels")
    
    # 2. Define folders to create / update
    folders_to_setup = [
        {"id": 4,  "title": "🎯 Target Hub",     "emoticon": "🎯", "chats": target_hub},
        {"id": 5,  "title": "🎥 Videos DB1P",    "emoticon": "🎬", "chats": videos_p},
        {"id": 9,  "title": "🎥 Videos DB1U",    "emoticon": "🎬", "chats": videos_u},
        {"id": 6,  "title": "📦 TeraBox P",      "emoticon": "📦", "chats": terabox_p},
        {"id": 8,  "title": "📦 TeraBox U",      "emoticon": "📦", "chats": terabox_u},
        {"id": 7,  "title": "🔒 R-Videos",       "emoticon": "🔒", "chats": r_videos},
        {"id": 10, "title": "🔒 R-TeraBox",      "emoticon": "📁", "chats": r_terabox},
    ]
    
    # 3. Apply UpdateDialogFilter for each folder
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
            print(f"   ✅ SUCCESS: Folder [{title}] created/updated! ({len(include_peers)} peers)")
        except Exception as e:
            print(f"   ❌ ERROR on [{title}]: {e}")
            
    # 4. Final verification
    print("\n" + "=" * 60)
    print("VERIFYING TELEGRAM FOLDERS DIRECTLY FROM TELEGRAM SERVERS")
    print("=" * 60)
    
    current_filters = await app.invoke(GetDialogFilters())
    for f in current_filters:
        fid = getattr(f, 'id', 'N/A')
        title = getattr(f, 'title', 'All Chats')
        emoticon = getattr(f, 'emoticon', '')
        peers = getattr(f, 'include_peers', [])
        print(f"ID: {fid:>3} | Title: {title:<25} | Icon: {emoticon} | Channels: {len(peers)}")
        
    await app.stop()
    print("\nALL FOLDERS CONFIGURED ON TELEGRAM SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(main())
