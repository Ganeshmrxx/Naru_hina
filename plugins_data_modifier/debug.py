# plugins/debug.py
import asyncio
import random as rnd
from pymongo import MongoClient
from pyrogram import Client, filters
from pyrogram.enums import ChatType
from pyrogram.errors import FloodWait, RPCError
from pyrogram.types import InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery

# MongoDB Setup
DATABASE_URI = "mongodb+srv://test:test05@cluster0.g05zxpa.mongodb.net/?retryWrites=true&w=majority"
DATABASE_NAME = "Cluster0"

client_mongo = MongoClient(DATABASE_URI)
db = client_mongo[DATABASE_NAME]
xchannels = db["xData"]


async def copy_all_media(client: Client, source_channel_id, target_channel_id):
    ub = client.userbot

    # Detect source type (group or channel)
    source = await client.get_chat(source_channel_id)
    sourceTittle = source.title
    source_type = source.type  # "group" / "supergroup" / "channel"
    print(f"Source chat type: {source_type}")

    print("Counting media messages...")

    total_media = 0
    total_medias = 0
    async for msg in ub.get_chat_history(source_channel_id):
        total_medias += 1
        total_media += 1

    print(f"Total media found: {total_media}, {total_medias}")
    status_msg = await client.send_message("@ganeshmrxx", f"⏳ Starting forwarding... modifytool")

    sent_count = 0
    skipped_count = 0
    failed_count = 0
    processed = 0
    counter = 0

    async for msg in ub.get_chat_history(source_channel_id):

        processed += 1

        if source_type == ChatType.CHANNEL:
            # CHANNEL → video + photo
            if not (msg.video or msg.photo):
                continue

        else:
            continue

        file_id = None
        duration = None
        size = None
        media_type = None

        try:
            copied_msg = await client.copy_message(
                chat_id=-1003457671077,  # target
                from_chat_id=source_channel_id,  # original channel
                message_id=msg.id,
                caption=f"filter = {sourceTittle}",
                reply_markup=InlineKeyboardMarkup([
                    [InlineKeyboardButton("❌ Remove", callback_data=f"del:{source_channel_id}:{msg.id}")]
                ])
            )

            print(f"✔ Copied → {target_channel_id}, new msg ID: {copied_msg.id}")

            sent_count += 1
            counter += 1

            if counter % 10 == 0:
                wait_time = rnd.randint(5, 20)
                # Send batch status update
                progress_text = (
                    f"🔄 **Batch Completed**\n\n"
                    f"📂 Total Messages: `{total_medias}`\n"
                    f"📁 Total Media Found: `{total_media}`\n\n"
                    f"📤 Sent: `{sent_count}`\n"
                    f"⏭ Skipped: `{skipped_count}`\n"
                    f"❌ Failed: `{failed_count}`\n"
                    f"⚙ Processed: `{processed}`\n"
                    f"🕒 Remaining: `{total_media - (sent_count + skipped_count + failed_count)}`\n\n"
                    f"⏳ Sleeping `{wait_time}` sec..."
                )

                await client.edit_message_text(
                    chat_id="@ganeshmrxx",
                    message_id=status_msg.id,
                    text=progress_text
                )
                print(f"⏳ Modify Batch complete. Sleeping {wait_time} sec... "
                      f"Total {total_medias} | Sent {sent_count}")

                await asyncio.sleep(wait_time)

            wait_time = rnd.randint(1, 4)
            await asyncio.sleep(wait_time)

        except FloodWait as fw:
            wait = fw.value + 2
            print(f"⚠ FloodWait: Sleeping {wait} sec...")
            await asyncio.sleep(wait)

        except RPCError as e:
            failed_count += 1
            print(f"❌ RPCError: {e}")
            await asyncio.sleep(2)

        except Exception as e:
            failed_count += 1
            print(f"❌ Unexpected error: {e}")
            await asyncio.sleep(2)

    progress_text = (
        f"🔄 **Modify Forwarding Completed**\n\n"
        f"📂 Total Messages: `{total_medias}`\n"
        f"📁 Total Media Found: `{total_media}`\n\n"
        f"📤 Sent: `{sent_count}`\n"
        f"⏭ Skipped: `{skipped_count}`\n"
        f"❌ Failed: `{failed_count}`\n"
        f"⚙ Processed: `{processed}`\n"
        f"🕒 Remaining: `{total_media - (sent_count + skipped_count + failed_count)}`\n\n"

        "✅ **All done!**"
    )

    await client.edit_message_text(
        chat_id="@ganeshmrxx",
        message_id=status_msg.id,
        text=progress_text
    )

    print("✔ MODIFY Finished forwarding. Summary sent.")


ALLOWED_USER_ID = 5886109249  # your Telegram user ID


@Client.on_message(filters.forwarded)
async def detect_and_save_mapping(client, message):
    print("here", message.id)
    # 1️⃣ Check user protection
    if message.from_user.id != ALLOWED_USER_ID:
        return  # ignore all others

    if not message.forward_from_chat:
        return

    source_chat = message.forward_from_chat
    source_id = source_chat.id
    source_title = source_chat.title

    target_id = message.chat.id
    target_title = message.chat.title

    print("Saved mapping:")

    # Delete the mapping message after saving
    try:
        await message.delete()
        await copy_all_media(client, source_id, target_id)
    except:
        pass


@Client.on_message(filters.incoming & (filters.group | filters.channel))
async def auto_forward(client, message):
    incoming_id = message.chat.id
    try:
        await client.get_chat(-1003457671077)
    except Exception as e:
        print("getchat",e)
            
    if message.chat.id == -1003457671077:
        return

    try:

        copied_msg = await message.copy(chat_id=-1003457671077, caption=f"filter = {message.chat.title} /n chatid = {incoming_id} nmsgid = {message.id}",
                                        reply_markup=InlineKeyboardMarkup([
                                            [InlineKeyboardButton("❌ Remove",
                                                                  callback_data=f"del:{message.chat.id}:{message.id}")]
                                        ]))
        print(f"✔ Copied to dbxall, message ID: {copied_msg.id}")

    except Exception as e:
        print(f"❌ Error copying message or saving data: {e}")


@Client.on_callback_query()
async def delete_handler(client: Client, query: CallbackQuery):
    data = query.data

    if not data.startswith("del:"):
        return

    _, cat_id, msg_id = data.split(":")
    cat_id = int(cat_id)
    msg_id = int(msg_id)

    try:
        # delete from channel
        await client.delete_messages(chat_id=cat_id, message_ids=msg_id)

        # delete from MongoDB
        xchannels.delete_one({
            "channel_id": cat_id,
            "message_id": msg_id
        })

        await query.message.delete()  # remove the button message too
        await query.answer("Deleted ✔", show_alert=False)

        print(f"Deleted message {msg_id} from {cat_id} and MongoDB")

    except Exception as e:
        print("Delete failed:", e)
        await query.answer("Delete failed ❌", show_alert=True)
