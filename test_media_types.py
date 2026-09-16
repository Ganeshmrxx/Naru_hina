import asyncio
asyncio.set_event_loop(asyncio.new_event_loop())

import sys
sys.stdout.reconfigure(encoding='utf-8')

from pyrogram import Client
from config import Config
from pyrogram.raw.functions.messages import GetDialogFilters

async def inspect():
    app = Client('inspect_media', api_id=Config.API_ID2, api_hash=Config.API_HASH2, session_string=Config.SESSION2, in_memory=True)
    await app.start()
    
    filters = await app.invoke(GetDialogFilters())
    for f in filters:
        fid = getattr(f, 'id', None)
        title = getattr(f, 'title', '')
        peers = getattr(f, 'include_peers', [])
        if fid in (5, 9):  # Videos DB1P, Videos DB1U
            print(f"\n=======================================================")
            print(f"Inspecting Folder: {title} (ID: {fid})")
            print(f"=======================================================")
            sample_count = 0
            for p in peers:
                cid = getattr(p, 'channel_id', None)
                if not cid: continue
                chat_id = int(f"-100{cid}")
                try:
                    c = await app.get_chat(chat_id)
                    video_count = 0
                    doc_video_count = 0
                    photo_count = 0
                    text_count = 0
                    total = 0
                    async for msg in app.get_chat_history(chat_id, limit=10):
                        total += 1
                        if msg.video:
                            video_count += 1
                        elif msg.document and msg.document.mime_type and msg.document.mime_type.startswith("video/"):
                            doc_video_count += 1
                        elif msg.photo:
                            photo_count += 1
                        else:
                            text_count += 1
                    
                    vids = video_count + doc_video_count
                    print(f"• Channel: '{c.title}'")
                    print(f"  Last {total} msgs -> Videos: {vids} | Photos: {photo_count} | Text/Links/Other: {text_count}")
                    sample_count += 1
                    if sample_count >= 5:
                        break
                except Exception as e:
                    pass
    await app.stop()

if __name__ == "__main__":
    asyncio.run(inspect())
