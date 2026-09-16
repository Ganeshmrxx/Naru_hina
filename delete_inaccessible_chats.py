import asyncio
asyncio.set_event_loop(asyncio.new_event_loop())

import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.path.append(r"e:\Ganesh\ANIGRAVITY\allforward")

from pyrogram import Client
from config import Config

async def main():
    print("Connecting to Telegram to delete inaccessible / banned channels...")
    app = Client(
        "delete_banned_chats",
        api_id=Config.API_ID2,
        api_hash=Config.API_HASH2,
        session_string=Config.SESSION2,
        in_memory=True
    )
    await app.start()
    
    deleted_count = 0
    failed_count = 0
    
    # Iterate dialogs
    chats_to_leave = []
    async for dialog in app.get_dialogs():
        chat = dialog.chat
        if chat.type.name in ("CHANNEL", "SUPERGROUP", "BOT"):
            restr = getattr(chat, 'restrictions', None)
            if restr:
                chats_to_leave.append(chat)

    print(f"Found {len(chats_to_leave)} restricted/inaccessible chats to remove.\n")
    
    for c in chats_to_leave:
        print(f"Leaving & deleting: [{c.title}] (ID: {c.id})...")
        try:
            await app.leave_chat(c.id, delete=True)
            deleted_count += 1
            print(f"   SUCCESS: Removed {c.title}")
        except Exception as e:
            failed_count += 1
            print(f"   FAILED to remove {c.title}: {e}")
        await asyncio.sleep(0.5)

    print("\n" + "="*50)
    print(f"CLEANUP COMPLETE: {deleted_count} removed, {failed_count} failed.")
    print("="*50)
    
    await app.stop()
    
    # Automatically re-run setup_telegram_folders to update chat folders cleanly
    print("\nRefreshing Telegram Chat Folders...")
    import setup_telegram_folders
    await setup_telegram_folders.main()
    print("ALL DONE!")

if __name__ == "__main__":
    asyncio.run(main())
