from pyrogram import Client, filters
import asyncio

@Client.on_message(filters.command("purge", prefixes=["/", ".", "!"]) & filters.me)
async def purge_history_cmd(client, message):
    """Purge messages from a chat."""
    args = message.text.split()
    limit = 100 # default
    
    if len(args) > 1:
        if args[1].lower() == "all":
            limit = 1000
        elif args[1].isdigit():
            limit = int(args[1])

    await message.edit_text(f"🗑 Purging up to {limit} messages...")
    
    deleted = 0
    try:
        msg_ids = []
        async for msg in client.get_chat_history(message.chat.id, limit=limit):
            if msg.id == message.id:
                continue # don't add the purge command message itself to the list yet
            
            msg_ids.append(msg.id)
            if len(msg_ids) >= 100:
                await client.delete_messages(message.chat.id, msg_ids)
                deleted += len(msg_ids)
                msg_ids = []
                await asyncio.sleep(1)
        
        if msg_ids:
            await client.delete_messages(message.chat.id, msg_ids)
            deleted += len(msg_ids)
        
        status_msg = await client.send_message(message.chat.id, f"✅ Purged {deleted} messages.")
        await asyncio.sleep(5)
        await status_msg.delete()
        await message.delete() # delete the command message
    except Exception as e:
        print(f"Purge failed: {e}")
        await message.edit_text(f"❌ Purge failed: {e}")
