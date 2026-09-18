import asyncio
asyncio.set_event_loop(asyncio.new_event_loop())
import sys
sys.stdout.reconfigure(encoding='utf-8')

import pyrogram.utils
pyrogram.utils.MIN_CHANNEL_ID = -1009999999999
pyrogram.utils.MAX_CHANNEL_ID = -1000000000000

from pyrogram import Client, raw
from config import Config

async def main():
    print("=" * 60)
    print("UNARCHIVE TELEGRAM CHATS (SESSION2 / GANESH)")
    print("=" * 60)

    app = Client(
        "unarchiver",
        api_id=Config.API_ID2,
        api_hash=Config.API_HASH2,
        session_string=Config.SESSION2,
        in_memory=True
    )
    await app.start()
    me = await app.get_me()
    print(f"Logged in as: {me.first_name} (@{me.username}) ID: {me.id}\n")

    # 1. Inspect and fetch all archived dialogs (folder_id = 1)
    offset_date = 0
    offset_id = 0
    offset_peer = raw.types.InputPeerEmpty()
    
    all_peers_to_unarchive = []
    
    while True:
        r = await app.invoke(raw.functions.messages.GetDialogs(
            folder_id=1,
            offset_date=offset_date,
            offset_id=offset_id,
            offset_peer=offset_peer,
            limit=100,
            hash=0
        ))
        
        dialogs = getattr(r, 'dialogs', [])
        if not dialogs:
            break
            
        chats_map = {c.id: c for c in getattr(r, 'chats', [])}
        users_map = {u.id: u for u in getattr(r, 'users', [])}
        msg_dict = {m.id: m for m in getattr(r, 'messages', []) if hasattr(m, 'id')}
        
        print(f"Fetched batch of {len(dialogs)} archived dialogs...")
        
        for d in dialogs:
            peer = d.peer
            if isinstance(peer, raw.types.PeerChannel):
                c = chats_map.get(peer.channel_id)
                access_hash = getattr(c, 'access_hash', 0) if c else 0
                title = getattr(c, 'title', 'Channel') if c else 'Channel'
                is_broadcast = getattr(c, 'broadcast', False)
                input_peer = raw.types.InputPeerChannel(channel_id=peer.channel_id, access_hash=access_hash)
                all_peers_to_unarchive.append({
                    "id": f"-100{peer.channel_id}",
                    "title": title,
                    "type": "Channel" if is_broadcast else "Supergroup",
                    "input_peer": input_peer
                })
            elif isinstance(peer, raw.types.PeerChat):
                c = chats_map.get(peer.chat_id)
                title = getattr(c, 'title', 'Chat') if c else 'Chat'
                input_peer = raw.types.InputPeerChat(chat_id=peer.chat_id)
                all_peers_to_unarchive.append({
                    "id": f"-{peer.chat_id}",
                    "title": title,
                    "type": "Basic Group",
                    "input_peer": input_peer
                })
            elif isinstance(peer, raw.types.PeerUser):
                u = users_map.get(peer.user_id)
                access_hash = getattr(u, 'access_hash', 0) if u else 0
                name = f"{getattr(u, 'first_name', '') or ''} {getattr(u, 'last_name', '') or ''}".strip()
                input_peer = raw.types.InputPeerUser(user_id=peer.user_id, access_hash=access_hash)
                all_peers_to_unarchive.append({
                    "id": f"{peer.user_id}",
                    "title": name,
                    "type": "User/Bot",
                    "input_peer": input_peer
                })

        last_d = dialogs[-1]
        offset_id = last_d.top_message
        if offset_id in msg_dict and hasattr(msg_dict[offset_id], 'date'):
            offset_date = msg_dict[offset_id].date
        else:
            offset_date = 0

        p = last_d.peer
        if isinstance(p, raw.types.PeerChannel):
            c = chats_map.get(p.channel_id)
            offset_peer = raw.types.InputPeerChannel(channel_id=p.channel_id, access_hash=getattr(c, 'access_hash', 0))
        elif isinstance(p, raw.types.PeerChat):
            offset_peer = raw.types.InputPeerChat(chat_id=p.chat_id)
        elif isinstance(p, raw.types.PeerUser):
            u = users_map.get(p.user_id)
            offset_peer = raw.types.InputPeerUser(user_id=p.user_id, access_hash=getattr(u, 'access_hash', 0))
        else:
            break

        if len(dialogs) < 100:
            break

    print(f"\nTotal items found in Archive (folder_id=1): {len(all_peers_to_unarchive)}")
    for item in all_peers_to_unarchive:
        print(f" - [{item['type']}] {item['id']}: {item['title']}")

    if not all_peers_to_unarchive:
        print("\nNo archived dialogs found.")
        await app.stop()
        return

    # 2. Unarchive peers: move to folder_id = 0
    # In MTProto, folders.EditPeerFolders takes list of InputFolderPeer(peer=..., folder_id=0)
    print(f"\nUnarchiving {len(all_peers_to_unarchive)} items to Main Dialog list (folder_id=0)...")
    batch_size = 10
    success_count = 0
    failed_count = 0

    for i in range(0, len(all_peers_to_unarchive), batch_size):
        batch = all_peers_to_unarchive[i:i+batch_size]
        folder_peers = [
            raw.types.InputFolderPeer(peer=item["input_peer"], folder_id=0)
            for item in batch
        ]
        try:
            res = await app.invoke(raw.functions.folders.EditPeerFolders(folder_peers=folder_peers))
            success_count += len(batch)
            print(f"  [OK] Unarchived batch {i+1} to {min(i+batch_size, len(all_peers_to_unarchive))}")
        except Exception as e:
            print(f"  [ERROR] Failed batch {i+1} to {min(i+batch_size, len(all_peers_to_unarchive))}: {e}")
            # Try individually in case one peer causes error
            for item in batch:
                try:
                    await app.invoke(raw.functions.folders.EditPeerFolders(
                        folder_peers=[raw.types.InputFolderPeer(peer=item["input_peer"], folder_id=0)]
                    ))
                    success_count += 1
                    print(f"    [OK Individual] Unarchived {item['title']} ({item['id']})")
                except Exception as ie:
                    failed_count += 1
                    print(f"    [FAIL Individual] {item['title']} ({item['id']}): {ie}")
        await asyncio.sleep(0.5)

    print(f"\nCompleted unarchiving. Success: {success_count}, Failed: {failed_count}")

    # 3. Verification
    print("\nVerifying archive folder status...")
    verify_r = await app.invoke(raw.functions.messages.GetDialogs(
        folder_id=1,
        offset_date=0,
        offset_id=0,
        offset_peer=raw.types.InputPeerEmpty(),
        limit=100,
        hash=0
    ))
    remaining = getattr(verify_r, 'dialogs', [])
    print(f"Remaining dialogs in Archive (folder_id=1): {len(remaining)}")

    await app.stop()

if __name__ == "__main__":
    asyncio.run(main())
