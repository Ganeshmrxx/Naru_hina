import asyncio
asyncio.set_event_loop(asyncio.new_event_loop())

import sys
sys.stdout.reconfigure(encoding='utf-8')

import re
from pyrogram import Client
from pyrogram.errors import FloodWait
from pyrogram.raw.functions.messages import GetDialogFilters, UpdateDialogFilter
from pyrogram.raw.types import DialogFilter
from config import Config

TERABOX_REGEX = re.compile(r"(terabox|1024tera|nephobox|4funbox|mirrobox|momerybox)", re.IGNORECASE)
VIDEO_EXTS = (".mp4", ".mkv", ".webm", ".avi", ".mov", ".flv", ".wmv", ".m4v")

SCAN_LIMIT = 50

async def scan_channel_media(app, chat_id):
    video_count = 0
    photo_count = 0
    terabox_count = 0
    other_count = 0
    
    try:
        async for msg in app.get_chat_history(chat_id, limit=SCAN_LIMIT):
            # Check video
            if msg.video:
                video_count += 1
                continue
                
            # Check document (video file)
            if msg.document:
                is_video_doc = False
                if msg.document.mime_type and msg.document.mime_type.startswith("video/"):
                    is_video_doc = True
                elif msg.document.file_name and msg.document.file_name.lower().endswith(VIDEO_EXTS):
                    is_video_doc = True
                    
                if is_video_doc:
                    video_count += 1
                    continue
                    
            # Check photo
            if msg.photo:
                photo_count += 1
                
            # Check terabox link
            text = (msg.caption or "") + " " + (msg.text or "")
            if TERABOX_REGEX.search(text):
                terabox_count += 1
            else:
                other_count += 1
    except FloodWait as e:
        print(f"      [FloodWait] Sleeping {e.value + 2}s...")
        await asyncio.sleep(e.value + 2)
    except Exception as e:
        pass
        
    return {
        "videos": video_count,
        "photos": photo_count,
        "terabox": terabox_count,
        "other": other_count
    }

async def main():
    print("=" * 65)
    print("DEEP 50-MESSAGE MEDIA AUDIT & FOLDER REORGANIZATION")
    print("=" * 65)
    
    app = Client(
        "deep_audit_session",
        api_id=Config.API_ID2,
        api_hash=Config.API_HASH2,
        session_string=Config.SESSION2,
        in_memory=True
    )
    await app.start()
    me = await app.get_me()
    print(f"Connected as: {me.first_name} (@{me.username}) ID: {me.id}")
    
    target_hub = []
    videos_p = []
    videos_u = []
    terabox_p = []
    terabox_u = []
    r_videos = []
    r_terabox = []
    
    removed_channels = []
    
    print(f"\nScanning all dialogs (checking up to {SCAN_LIMIT} messages per channel)...")
    
    dialogs_list = []
    async for d in app.get_dialogs():
        if d.chat.type.name in ("CHANNEL", "SUPERGROUP"):
            dialogs_list.append(d.chat)
            
    print(f"Total Channels/Supergroups to analyze: {len(dialogs_list)}\n")
    
    for idx, chat in enumerate(dialogs_list, 1):
        # 1. Check if Target Hub
        is_owner = getattr(chat, 'is_creator', False)
        is_target = is_owner or (chat.title and (chat.title.startswith("DB") or chat.title.startswith("XDB")))
        if is_target:
            target_hub.append(chat)
            print(f"[{idx:>2}/{len(dialogs_list)}] 🎯 Target Hub: '{chat.title}' (Owner/DB)")
            continue
            
        # 2. Deep scan messages
        media_stats = await scan_channel_media(app, chat.id)
        v_count = media_stats["videos"]
        t_count = media_stats["terabox"]
        p_count = media_stats["photos"]
        
        is_protected = getattr(chat, "has_protected_content", False)
        is_public = bool(chat.username)
        user_badge = f"(@{chat.username})" if is_public else "(Private)"
        
        # Classification based on real media
        if is_protected:
            if t_count > 0:
                r_terabox.append(chat)
                print(f"[{idx:>2}/{len(dialogs_list)}] 🔒 R-TeraBox: '{chat.title}' {user_badge} (TB: {t_count})")
            elif v_count > 0:
                r_videos.append(chat)
                print(f"[{idx:>2}/{len(dialogs_list)}] 🔒 R-Videos: '{chat.title}' {user_badge} (Videos: {v_count})")
            else:
                removed_channels.append({"title": chat.title, "type": user_badge, "reason": f"Protected but 0 videos/terabox (Photos: {p_count})"})
                print(f"[{idx:>2}/{len(dialogs_list)}] ⚠️ REMOVED: '{chat.title}' {user_badge} -> No video/terabox found.")
        else:
            if t_count > 0:
                if is_public:
                    terabox_p.append(chat)
                    print(f"[{idx:>2}/{len(dialogs_list)}] 📦 TeraBox P: '{chat.title}' {user_badge} (TB: {t_count})")
                else:
                    terabox_u.append(chat)
                    print(f"[{idx:>2}/{len(dialogs_list)}] 📦 TeraBox U: '{chat.title}' {user_badge} (TB: {t_count})")
            elif v_count > 0:
                if is_public:
                    videos_p.append(chat)
                    print(f"[{idx:>2}/{len(dialogs_list)}] 🎥 Videos DB1P: '{chat.title}' {user_badge} (Videos: {v_count})")
                else:
                    videos_u.append(chat)
                    print(f"[{idx:>2}/{len(dialogs_list)}] 🎥 Videos DB1U: '{chat.title}' {user_badge} (Videos: {v_count})")
            else:
                removed_channels.append({"title": chat.title, "type": user_badge, "reason": f"0 Videos found (Photos: {p_count}, Text/Spam)"})
                print(f"[{idx:>2}/{len(dialogs_list)}] ❌ REMOVED: '{chat.title}' {user_badge} -> No video found!")
                
    print("\n" + "=" * 65)
    print("DEEP AUDIT RESULTS:")
    print("=" * 65)
    print(f"🎯 Target Hub:                      {len(target_hub)} channels")
    print(f"🎥 Videos DB1P (Verified Videos - Bots):   {len(videos_p)} channels")
    print(f"🎥 Videos DB1U (Verified Videos - Userbot): {len(videos_u)} channels")
    print(f"📦 TeraBox P (Verified Links - Bots):     {len(terabox_p)} channels")
    print(f"📦 TeraBox U (Verified Links - Userbot): {len(terabox_u)} channels")
    print(f"🔒 R-Videos (Protected Videos):          {len(r_videos)} channels")
    print(f"🔒 R-TeraBox (Protected TeraBox):        {len(r_terabox)} channels")
    print(f"🚫 Total Non-Video Channels REMOVED:     {len(removed_channels)} channels")
    
    # Update Telegram Folders
    folders_to_update = [
        {"id": 4,  "title": "🎯 Target Hub",  "emoticon": "🎯", "chats": target_hub},
        {"id": 5,  "title": "Videos DB1P",    "emoticon": "🎬", "chats": videos_p},
        {"id": 9,  "title": "Videos DB1U",    "emoticon": "🎬", "chats": videos_u},
        {"id": 6,  "title": "📦 TeraBox P",   "emoticon": "📦", "chats": terabox_p},
        {"id": 8,  "title": "📦 TeraBox U",   "emoticon": "📦", "chats": terabox_u},
        {"id": 7,  "title": "🔒 R-Videos",    "emoticon": "🔒", "chats": r_videos},
        {"id": 10, "title": "🔒 R-TeraBox",   "emoticon": "📁", "chats": r_terabox},
    ]
    
    print("\nUpdating Telegram Folders on Server...")
    for folder in folders_to_update:
        fid = folder["id"]
        title = folder["title"]
        emoticon = folder["emoticon"]
        chats = folder["chats"]
        
        include_peers = []
        for c in chats:
            try:
                peer = await app.resolve_peer(c.id)
                include_peers.append(peer)
            except Exception as e:
                pass
                
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
            await app.invoke(UpdateDialogFilter(id=fid, filter=dialog_filter))
            print(f"   ✅ Updated Folder [{title}] -> {len(include_peers)} active channels")
        except Exception as e:
            print(f"   ❌ Failed to update [{title}]: {e}")
            
    await app.stop()
    print("\nALL FOLDERS CLEANED AND SYNCHRONIZED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(main())
