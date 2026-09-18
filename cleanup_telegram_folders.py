import asyncio
asyncio.set_event_loop(asyncio.new_event_loop())

import sys
sys.stdout.reconfigure(encoding='utf-8')

import pyrogram.utils
pyrogram.utils.MIN_CHANNEL_ID = -1009999999999
pyrogram.utils.MAX_CHANNEL_ID = -1000000000000

from pyrogram import Client
from pyrogram.raw.functions.messages import GetDialogFilters, UpdateDialogFilter
from pyrogram.raw.types import DialogFilter
from config import Config

async def main():
    print("=" * 60)
    print("TELEGRAM CHAT FOLDERS CLEANUP: KEEP ONLY 3 FOLDERS")
    print("=" * 60)
    
    app = Client(
        "folder_cleaner",
        api_id=Config.API_ID2,
        api_hash=Config.API_HASH2,
        session_string=Config.SESSION2,
        in_memory=True
    )
    await app.start()
    me = await app.get_me()
    print(f"Logged in as: {me.first_name} (@{me.username}) ID: {me.id}")
    
    # 1. Fetch current filters
    filters = await app.invoke(GetDialogFilters())
    folder_dict = {}
    for f in filters:
        fid = getattr(f, 'id', None)
        if fid is not None:
            folder_dict[fid] = {
                "title": getattr(f, 'title', ''),
                "emoticon": getattr(f, 'emoticon', ''),
                "peers": getattr(f, 'include_peers', [])
            }
            
    print(f"Current folders found on Telegram: {list(folder_dict.keys())}")
    
    # 2. Extract peers for target HUB
    target_hub_peers = folder_dict.get(4, {}).get("peers", [])
    print(f"Target Hub (ID 4) has {len(target_hub_peers)} peers")
    
    # 3. Extract peers for TeraDB (merge 6, 8, 10)
    tera_peers_dict = {}
    for fid in [6, 8, 10]:
        for p in folder_dict.get(fid, {}).get("peers", []):
            cid = getattr(p, "channel_id", getattr(p, "user_id", getattr(p, "chat_id", None)))
            if cid and cid not in tera_peers_dict:
                tera_peers_dict[cid] = p
    tera_peers = list(tera_peers_dict.values())
    print(f"TeraDB merged peers: {len(tera_peers)}")
    
    # 4. Extract peers for videoDB (ID 5)
    video_peers_dict = {}
    for p in folder_dict.get(5, {}).get("peers", []):
        cid = getattr(p, "channel_id", getattr(p, "user_id", getattr(p, "chat_id", None)))
        if cid and cid not in video_peers_dict:
            video_peers_dict[cid] = p
    # If room under 100, can include from 9 or 7
    for fid in [9, 7]:
        for p in folder_dict.get(fid, {}).get("peers", []):
            cid = getattr(p, "channel_id", getattr(p, "user_id", getattr(p, "chat_id", None)))
            if cid and cid not in video_peers_dict and len(video_peers_dict) < 100:
                video_peers_dict[cid] = p
    video_peers = list(video_peers_dict.values())
    print(f"videoDB peers: {len(video_peers)}")
    
    # 5. Define the 3 folders to keep
    keep_folders = {
        4: {"title": "target HUB", "emoticon": "🎯", "peers": target_hub_peers},
        5: {"title": "videoDB", "emoticon": "🎥", "peers": video_peers},
        6: {"title": "TeraDB", "emoticon": "📦", "peers": tera_peers}
    }
    
    # 6. Delete all other folders
    folders_to_delete = [fid for fid in folder_dict.keys() if fid not in keep_folders]
    print(f"\nDeleting {len(folders_to_delete)} other folders: {folders_to_delete}")
    
    for fid in folders_to_delete:
        try:
            res = await app.invoke(UpdateDialogFilter(id=fid, filter=None))
            print(f"   [DELETED] Folder ID {fid} (\"{folder_dict[fid]['title']}\"): {res}")
        except Exception as e:
            print(f"   [ERROR] Deleting folder ID {fid}: {e}")
        await asyncio.sleep(1)
        
    # 7. Update/save the 3 folders
    print("\nUpdating the 3 requested folders...")
    for fid, f_info in keep_folders.items():
        df = DialogFilter(
            id=fid,
            title=f_info["title"],
            emoticon=f_info["emoticon"],
            pinned_peers=[],
            include_peers=f_info["peers"],
            exclude_peers=[]
        )
        try:
            res = await app.invoke(UpdateDialogFilter(id=fid, filter=df))
            print(f"   [UPDATED] Folder ID {fid} (\"{f_info['title']}\") with {len(f_info['peers'])} channels: {res}")
        except Exception as e:
            print(f"   [ERROR] Updating folder ID {fid}: {e}")
        await asyncio.sleep(1)
        
    # 8. Final verification
    print("\n" + "=" * 60)
    print("FINAL VERIFICATION: ALL CURRENT TELEGRAM CHAT FOLDERS")
    print("=" * 60)
    
    final_filters = await app.invoke(GetDialogFilters())
    for f in final_filters:
        fid = getattr(f, 'id', None)
        if fid is None:
            continue
        title = getattr(f, 'title', '')
        emoticon = getattr(f, 'emoticon', '')
        peers = getattr(f, 'include_peers', [])
        print(f"  Folder ID {fid}: \"{title}\" (Icon: '{emoticon}') -> {len(peers)} channels")
        
    await app.stop()
    print("\nCLEANUP COMPLETED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(main())
