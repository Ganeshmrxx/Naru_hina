import asyncio
asyncio.set_event_loop(asyncio.new_event_loop())

import sys
sys.stdout.reconfigure(encoding='utf-8')

from pyrogram import Client
from pyrogram.raw.functions.messages import GetDialogFilters, UpdateDialogFilter
from pyrogram.raw.types import DialogFilter
from config import Config

async def main():
    print("=" * 60)
    print("ALLFORWARD: CONFIGURING [📁 ETC] FOLDER ON TELEGRAM")
    print("=" * 60)
    
    app = Client(
        "etc_folder_session",
        api_id=Config.API_ID2,
        api_hash=Config.API_HASH2,
        session_string=Config.SESSION2,
        in_memory=True
    )
    await app.start()
    me = await app.get_me()
    print(f"Connected as: {me.first_name} (@{me.username}) ID: {me.id}")
    
    # 1. Fetch current filters
    filters = await app.invoke(GetDialogFilters())
    assigned_raw_ids = set()
    
    # Target Hub (4), Videos DB1P (5), Videos DB1U (9), R-Videos (7), R-TeraBox (10)
    active_folder_ids = {4, 5, 9, 7, 10}
    
    terabox_peers = []
    
    for f in filters:
        fid = getattr(f, 'id', None)
        peers = getattr(f, 'include_peers', [])
        
        # If TeraBox P (6) or TeraBox U (8), collect peers to merge into single TeraBox folder
        if fid in (6, 8):
            for p in peers:
                terabox_peers.append(p)
                cid = getattr(p, 'channel_id', None) or getattr(p, 'chat_id', None)
                if cid: assigned_raw_ids.add(cid)
        elif fid in active_folder_ids:
            for p in peers:
                cid = getattr(p, 'channel_id', None) or getattr(p, 'chat_id', None)
                if cid: assigned_raw_ids.add(cid)
                
    # 2. Update Folder 6 to combined "📦 TeraBox"
    print(f"\n1. Merging TeraBox channels into Folder 6 [📦 TeraBox] ({len(terabox_peers)} channels)...")
    tb_filter = DialogFilter(
        id=6,
        title="📦 TeraBox",
        emoticon="📦",
        pinned_peers=[],
        include_peers=terabox_peers,
        exclude_peers=[],
        exclude_muted=False,
        exclude_read=False,
        exclude_archived=False
    )
    res_tb = await app.invoke(UpdateDialogFilter(id=6, filter=tb_filter))
    print(f"   ✅ [📦 TeraBox] merged result: {res_tb}")
    
    # 3. Find all unassigned channels in dialogs
    etc_channels = []
    async for d in app.get_dialogs():
        chat = d.chat
        if chat.type.name not in ("CHANNEL", "SUPERGROUP"):
            continue
        raw_id = int(str(chat.id).replace("-100", "").replace("-", ""))
        if raw_id not in assigned_raw_ids:
            etc_channels.append(chat)
            
    print(f"\n2. Resolving {len(etc_channels)} channels for Folder 8 [ETC]...")
    etc_peers = []
    for c in etc_channels:
        try:
            peer = await app.resolve_peer(c.id)
            etc_peers.append(peer)
        except Exception as e:
            print(f"   Could not resolve peer {c.id} ({c.title}): {e}")
            
    # Telegram Free Tier allows max 100 peers per folder
    etc_peers_capped = etc_peers[:100]
    
    etc_filter = DialogFilter(
        id=8,
        title="ETC",
        emoticon="📁",
        pinned_peers=[],
        include_peers=etc_peers_capped,
        exclude_peers=[],
        exclude_muted=False,
        exclude_read=False,
        exclude_archived=False
    )
    
    res_etc = await app.invoke(UpdateDialogFilter(id=8, filter=etc_filter))
    print(f"   ✅ [ETC] folder created with {len(etc_peers_capped)} channels! Result: {res_etc}")
    
    # 4. Final verification of all folders
    print("\n" + "=" * 60)
    print("FINAL TELEGRAM FOLDERS ON SERVER")
    print("=" * 60)
    current_filters = await app.invoke(GetDialogFilters())
    for f in current_filters:
        fid = getattr(f, 'id', 'N/A')
        title = getattr(f, 'title', 'All Chats')
        emoticon = getattr(f, 'emoticon', '') or ''
        peers = getattr(f, 'include_peers', [])
        if fid == 'N/A': continue
        print(f"Folder ID {fid:>3} | {emoticon} {title:<20} | Channels: {len(peers)}")
        
    await app.stop()
    print("\nALL FOLDERS CONFIGURED ON TELEGRAM SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(main())
