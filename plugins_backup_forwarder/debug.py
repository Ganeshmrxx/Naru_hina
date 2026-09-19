# plugins/debug.py
import asyncio
import time
import random as rnd
from pymongo import MongoClient
from pyrogram import Client, filters
from pyrogram.enums import ChatType
from pyrogram.errors import FloodWait, RPCError

# Folder targets cache (cached for 5 minutes)
_folder_cache = {"time": 0, 5: set(), 6: set()}

async def resolve_folder_target(client, incoming_id):
    now = time.time()
    if now - _folder_cache["time"] > 300 or (not _folder_cache[5] and not _folder_cache[6]):
        try:
            from pyrogram.raw.functions.messages import GetDialogFilters
            filters = await asyncio.wait_for(client.invoke(GetDialogFilters()), timeout=8.0)
            f5 = set()
            f6 = set()
            for f in filters:
                fid = getattr(f, 'id', None)
                ftitle = str(getattr(f, 'title', '')).lower()
                target_set = None
                if fid == 5 or ('video' in ftitle and 'db' in ftitle):
                    target_set = f5
                elif fid == 6 or ('tera' in ftitle and 'db' in ftitle):
                    target_set = f6
                if target_set is not None:
                    for p in getattr(f, 'include_peers', []):
                        cid = getattr(p, 'channel_id', getattr(p, 'chat_id', None))
                        if cid:
                            clean_cid = int(str(cid).replace("-100", "").replace("-", ""))
                            target_set.add(int(f"-100{clean_cid}"))
                            target_set.add(clean_cid)
            if f5 or f6:
                _folder_cache[5] = f5
                _folder_cache[6] = f6
                _folder_cache["time"] = now
        except Exception as e:
            _folder_cache["time"] = now - 240  # retry in 60s instead of immediately
            print("Folder filter fetch error:", e)

    clean_id = int(str(incoming_id).replace("-100", "").replace("-", ""))
    if incoming_id in _folder_cache[5] or clean_id in _folder_cache[5]:
        return -1004401442087, "DBXVideos"
    if incoming_id in _folder_cache[6] or clean_id in _folder_cache[6]:
        return -1004337870091, "DBXTera"
    return None, None

def build_caption(original_caption, chat_id, chat_title):
    footer = f"\n\nchannel id = {chat_id}\nchannel name = {chat_title}"
    if not original_caption:
        return footer.strip()
    max_orig_len = 1024 - len(footer) - 5
    if len(original_caption) > max_orig_len:
        original_caption = original_caption[:max_orig_len] + "..."
    return f"{original_caption}{footer}"

def build_text(original_text, chat_id, chat_title):
    footer = f"\n\nchannel id = {chat_id}\nchannel name = {chat_title}"
    if not original_text:
        return footer.strip()
    max_orig_len = 4096 - len(footer) - 5
    if len(original_text) > max_orig_len:
        original_text = original_text[:max_orig_len] + "..."
    return f"{original_text}{footer}"

# MongoDB Setup
DATABASE_URI = "mongodb+srv://test:test05@cluster0.g05zxpa.mongodb.net/?retryWrites=true&w=majority"
DATABASE_NAME = "Cluster0"

client_mongo = MongoClient(DATABASE_URI)
db = client_mongo[DATABASE_NAME]
xchannels = db["xData"]

from pyrogram import filters

chats_col = db["chats"]
progress_col = db["forward_progress"]
media_col = db["media_store"]
summary_col = db["daily_summary"]


def delete_chat_from_db(chat_id):
    chats_col.delete_one({"chat_id": chat_id})
    progress_col.delete_one({"chat_id": chat_id})
    media_col.delete_many({"channel_id": chat_id})
    print(f"🗑️ Deleted chat {chat_id} from DB")


@Client.on_message(filters.left_chat_member)
async def on_left_chat(client, message):
    left = message.left_chat_member
    me = await client.get_me()

    # Check if *you* left
    if left and left.id == me.id:
        chat = message.chat
        print(f"🚪 Manually left: {chat.title}")

        # Delete from DB so forward bot never touches it
        delete_chat_from_db(chat.id)

        # Optional: notify you
        try:
            await client.send_message(
                "me",
                f"🚪 **Chat removed manually**\n\n"
                f"📌 {chat.title}\n"
                f"🗑 Deleted from DB"
            )
        except:
            pass

def mark_notnow(chat_id, reason="manual"):
    chats_col.update_one(
        {"chat_id": chat_id},
        {"$set": {
            "status": "notnow"
        }},
        upsert=True
    )

def mark_notnows(chat_id, reason="manual"):
    chats_col.update_one(
        {"chat_id": chat_id},
        {"$set": {
            "status": "pending"
        }},
        upsert=True
    )
async def copy_all_media(client: Client, source_channel_id, target_channel_id):
    collection = db["xData"]

    # Detect source type (group or channel)
    source = await client.get_chat(source_channel_id)
    source_type = source.type  # "group" / "supergroup" / "channel"
    source_title = getattr(source, "title", "") or str(source_channel_id)
    print(f"Source chat type: {source_type}, title: {source_title}")

    print("Counting media messages...")

    total_media = 0
    total_medias = 0
    async for msg in client.get_chat_history(source_channel_id):
        total_medias += 1

        # Count based on your rule
        if source_type == ChatType.GROUP or source_type == ChatType.SUPERGROUP:
            if msg.video:
                total_media += 1

        elif source_type == ChatType.CHANNEL:
            if msg.video or msg.photo:
                total_media += 1

    print(f"Total media found: {total_media}, {total_medias}")
    status_msg = await client.send_message("me", f"⏳ Starting forwarding...{total_media}, {total_medias}")

    sent_count = 0
    skipped_count = 0
    failed_count = 0
    processed = 0
    counter = 0

    async for msg in client.get_chat_history(source_channel_id):

        processed += 1

        # Apply copying rule
        if source_type == ChatType.GROUP or source_type == ChatType.SUPERGROUP:
            # GROUP → only video
            if not msg.video:
                continue


        elif source_type == ChatType.CHANNEL:
            # CHANNEL → video + photo
            if not (msg.video or msg.photo):
                continue

        else:
            continue

        file_id = None
        duration = None
        size = None
        media_type = None

        if msg.video:

            media_type = "video"
            file_id = msg.video.file_unique_id
            duration = msg.video.duration
            size = msg.video.file_size

        elif msg.photo:
            media_type = "photo"
            file_id = msg.photo.file_unique_id
            size = msg.photo.file_size

        # Skip duplicates
        if collection.find_one({"_id": file_id}):
            skipped_count += 1
            print(f"⚠ Already exists, skipping: {file_id}")
            continue

        try:
            caption = build_caption(msg.caption, source_channel_id, source_title)
            copied_msg = await msg.copy(chat_id=target_channel_id, caption=caption)
            print(f"✔ Copied → {target_channel_id}, new msg ID: {copied_msg.id}")

            collection.insert_one({
                "_id": file_id,
                "channel_id": target_channel_id,
                "message_id": copied_msg.id,
                "media_type": media_type,
                "duration": duration,
                "file_size": size
            })

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
                    chat_id="me",
                    message_id=status_msg.id,
                    text=progress_text
                )
                print(f"⏳ Batch complete. Sleeping {wait_time} sec... "
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
        f"🔄 **Forwarding Completed**\n\n"
        f"📂 Total Messages: `{total_medias}`\n"
        f"📁 Total Media Found: `{total_media}`\n\n"
        f"📤 Sent: `{sent_count}`\n"
        f"⏭ Skipped: `{skipped_count}`\n"
        f"❌ Failed: `{failed_count}`\n"
        f"⚙ Processed: `{processed}`\n"
        f"🕒 Remaining: `{total_media - (sent_count + skipped_count + failed_count)}`\n\n"
        f"⏳ Sleeping `{wait_time}` sec..."
        "✅ **All done!**"
    )

    await client.edit_message_text(
        chat_id="me",
        message_id=status_msg.id,
        text=progress_text
    )

    print("✔ Finished forwarding. Summary sent.")


@Client.on_message(filters.forwarded & filters.outgoing & filters.channel)
async def detect_and_save_mapping(client, message):
    print("here", message.id)

    if not message.forward_from_chat:
        return

    source_chat = message.forward_from_chat
    source_id = source_chat.id
    source_title = source_chat.title

    target_id = message.chat.id
    target_title = message.chat.title

    doc = {
        "_id": source_id,
        "source_name": source_title,
        "target": target_id,
        "target_name": target_title
    }

    db["xDataChannels"].update_one({"_id": source_id}, {"$set": doc}, upsert=True)
    print("Saved mapping:", doc)

    # Delete the mapping message after saving
    try:
        await message.delete()
        await copy_all_media(client, source_id, target_id)
    except:
        pass


@Client.on_message(filters.incoming & (filters.group | filters.channel))
async def auto_forward(client, message):
    incoming_id = message.chat.id
    source_title = message.chat.title

    # CRITICAL GUARD 1: Target storage channels must NEVER be processed by auto_forward!
    # DBXVideos (-1004401442087), DBXTera (-1004337870091), Mix (-1003253102275)
    TARGET_CHANNELS = {-1004401442087, -1004337870091, -1003253102275, 4401442087, 4337870091, 3253102275}
    clean_inc = int(str(incoming_id).replace("-100", "").replace("-", ""))
    if incoming_id in TARGET_CHANNELS or clean_inc in TARGET_CHANNELS:
        return

    # CRITICAL GUARD 2: FAST MEDIA & LINK FILTER (Zero RAM/CPU Cost)
    # Live Forwarder copies:
    # 1. Albums (media groups)
    # 2. Videos / video documents
    # 3. Posts with TeraBox links / URLs (for TeraDB)
    has_link = bool(
        (message.text and ("http" in message.text.lower() or "tera" in message.text.lower())) or
        (message.caption and ("http" in message.caption.lower() or "tera" in message.caption.lower()))
    )
    is_album = bool(getattr(message, "media_group_id", None))
    is_video = bool(message.video or (message.document and getattr(message.document, 'mime_type', '').startswith('video/')))
    if not is_album and not is_video and not has_link:
        return

    # CRITICAL GUARD 3: FAST IGNORED CHANNELS CACHE
    # If this chat was already confirmed not to be in videoDB / TeraDB, drop instantly
    ignored_set = _folder_cache.setdefault("ignored", set())
    if incoming_id in ignored_set or clean_inc in ignored_set:
        return

    # TARGET ROUTING: Check Folder 5 (videoDB) or Folder 6 (TeraDB) first
    target, tn = await resolve_folder_target(client, incoming_id)
    if not target:
        record = db["xDataChannels"].find_one({"_id": incoming_id})
        if record:
            target = record.get("target")
            tn = record.get("target_name")

    if not target or target == -1003253102275 or str(tn).lower() == "mix":
        if len(ignored_set) > 2000:
            ignored_set.clear()
        ignored_set.add(incoming_id)
        ignored_set.add(clean_inc)
        return

    messageType = "album" if is_album else "video"
    print(f"incoming {incoming_id} type {messageType} channel name {source_title} -> Target: {tn} ({target})")

    file_id = None
    duration = None
    size = None
    media_type = None

    # Rule 1: Grouped messages (albums) -> Copy entire media group together
    if is_album:
        group_id = message.media_group_id
        if "processed_groups" not in _folder_cache:
            _folder_cache["processed_groups"] = set()
        if group_id in _folder_cache["processed_groups"]:
            return
        if len(_folder_cache["processed_groups"]) > 500:
            _folder_cache["processed_groups"].clear()
        _folder_cache["processed_groups"].add(group_id)

        caption = build_caption(None, incoming_id, source_title or str(incoming_id))
        try:
            copied_group = await asyncio.wait_for(
                client.copy_media_group(chat_id=target, from_chat_id=incoming_id, message_id=message.id, captions=caption),
                timeout=15.0
            )
            print(f"✔ Copied complete album (group {group_id}) to {target}")
            return
        except FloodWait as fw:
            wait = getattr(fw, "value", 15) + 2
            print(f"⚠ FloodWait on live album: Sleeping {wait}s...")
            await asyncio.sleep(wait)
            try:
                await client.copy_media_group(chat_id=target, from_chat_id=incoming_id, message_id=message.id, captions=caption)
            except Exception as e2:
                print(f"❌ Error retrying album after FloodWait: {e2}")
            return
        except Exception as ge:
            print(f"❌ Error copying live media group {group_id}: {ge}")
            return

    # Check chat type for single video, photo with link, or text message with link
    if message.chat.type in (ChatType.GROUP, ChatType.SUPERGROUP, ChatType.CHANNEL):
        if message.video:
            video_id = message.video.file_unique_id
            media_type = "video"
            duration = message.video.duration
            size = message.video.file_size
        elif message.document and getattr(message.document, 'mime_type', '').startswith('video/'):
            video_id = message.document.file_unique_id
            media_type = "video"
            duration = 0
            size = message.document.file_size
        elif message.photo and (target == -1004337870091 or has_link):
            video_id = message.photo.file_unique_id
            media_type = "photo"
            duration = 0
            size = message.photo.file_size
        elif message.text and has_link:
            text_to_send = build_text(message.text, incoming_id, source_title or str(incoming_id))
            try:
                await message.copy(chat_id=target)
            except Exception:
                await client.send_message(chat_id=target, text=text_to_send)
            return
        else:
            return  # skip unsupported media
    else:
        return  # skip other chat types

    if db["xData"].find_one({"_id": video_id}):
        print(f"⚠ File ID already exists in DB, skipping: {video_id}")
        return

    try:
        caption = build_caption(message.caption, incoming_id, source_title or str(incoming_id))
        copied_msg = await asyncio.wait_for(
            message.copy(chat_id=target, caption=caption),
            timeout=15.0
        )
        print(f"✔ Copied to {target}, message ID: {copied_msg.id}")

        # Insert metadata into DB
        db["xData"].insert_one({
            "_id": video_id,
            "channel_id": target,
            "message_id": copied_msg.id,
            "media_type": media_type,
            "duration": duration,
            "file_size": size
        })
        print("✅ Metadata saved in DB", copied_msg.id)

    except FloodWait as fw:
        wait = getattr(fw, "value", 15) + 2
        print(f"⚠ Live Auto-Forward FloodWait: Sleeping {wait} sec...")
        await asyncio.sleep(wait)
        try:
            copied_msg = await message.copy(chat_id=target, caption=caption)
            db["xData"].insert_one({
                "_id": video_id,
                "channel_id": target,
                "message_id": copied_msg.id,
                "media_type": media_type,
                "duration": duration,
                "file_size": size
            })
            print("✅ Metadata saved in DB after FloodWait retry", getattr(copied_msg, "id", None))
        except Exception as retry_e:
            print(f"❌ Error retrying after FloodWait: {retry_e}")
    except Exception as e:
        print(f"❌ Error copying message or saving data: {e}")


"""
@Client.on_message(filters.text & filters.incoming)
async def delete_all_messages(client, message):
    if message.text.lower() != "deletenow":
        return

    # Get the chat where the command was sent
    chat_id = message.chat.id


    try:
        async for msg in client.get_chat_history(chat_id):
            # Skip the command message itself to avoid infinite loop
            if msg.id == message.id:
                continue
            try:
                await client.delete_messages(chat_id=chat_id, message_ids=msg.id)
            except Exception as e:
                print(f"❌ Could not delete message {msg.id}: {e}")
        await message.reply_text("✅ All deletable messages have been deleted.")
    except Exception as e:
        replytext = await message.reply_text(f"❌ Failed: {e}")
        await asyncio.sleep(10)
        await client.delete_messages(chat_id=chat_id, message_ids=message.id)
        await client.delete_messages(chat_id=chat_id, message_ids=replytext.id)
"""


@Client.on_message(filters.command("addnew") & filters.me)
async def add_new_mapping(client, message):
    print("here addnew")
    try:
        args = message.text.split()[1:]  # everything after /addnew

        # message.text = "/addnew_12345_67890"

        if len(args) != 2:
            return await message.reply("❌ Invalid format.\nUse: `/addnew_srcID_targetID`", parse_mode="markdown")

        src_id = args[0]
        target_id = int(args[1])

        # ── Get Source Chat Info ─────────────────────────────
        try:
            src_chat = await client.get_chat(src_id)
            src_title = src_chat.title if src_chat.title else "(No Title)"
        except Exception as e:
            return await message.reply(f"❌ Failed to fetch source chat: `{e}`", parse_mode="markdown")

        # ── Get Target Chat Info ─────────────────────────────
        try:
            tgt_chat = await client.get_chat(target_id)
            tgt_title = tgt_chat.title if tgt_chat.title else "(No Title)"
        except Exception as e:
            return await message.reply(f"❌ Failed to fetch target chat: `{e}`", parse_mode="markdown")

        # ── Save in DB ───────────────────────────────────────

        doc = {
            "_id": src_id,
            "source_name": src_title,
            "target": target_id,
            "target_name": tgt_title
        }

        db["xDataChannels"].update_one({"_id": src_id}, {"$set": doc}, upsert=True)
        try:

            await copy_all_media(client, src_id, target_id)
        except Exception as e:
            print("error", e)

        # ── Reply nicely ─────────────────────────────────────
        return await message.reply(
            f"✅ **Mapping Added Successfully**\n\n"
            f"**Source:**\n"
            f"🆔 <code>{src_id}</code>\n"
            f"🏷 <b>{src_title}</b>\n\n"
            f"**Target:**\n"
            f"🆔 <code>{target_id}</code>\n"
            f"🏷 <b>{tgt_title}</b>",
            parse_mode="html"
        )




    except Exception as e:
        await message.reply(f"❌ Error: `{e}`")


@Client.on_message(filters.command("check") & filters.me)
async def check_chat(client, message):
    chat = message.chat
    chat_id = chat.id

    await client.send_message(
        "@ganeshmrxx",
        f"📌 **Group Info Found**\n\n"
        f"🆔 **add:**\n<code>/addnew</code>`\n"
        f"🆔 **Chat ID:**\n<code>_{chat_id}</code>\n"

    )
    await message.delete()


@Client.on_message(filters.command("status") & filters.me)
async def check_status(client, message):
    chat = message.chat

    chat_id = chat.id
    count = xchannels.countDocuments()

    await client.send_message(

        "@ganeshmrxx",

        f"📌 **files Found**\n\n"

        f"🆔 **CountID:**\n<code>_{count}</code>\n"

    )


from pyrogram import filters


@Client.on_message(filters.me & filters.reply & filters.command("notnow"))
async def notnow_handler(client, message):
    if not message.reply_to_message:
        return

    text = message.reply_to_message.text or ""

    # Extract chat_id from message text
    import re
    match = re.search(r"`(-100\d+)`", text)
    if not match:
        await message.reply("❌ Chat ID not found")
        return

    chat_id = int(match.group(1))

    mark_notnow(chat_id, reason="manual_notnow")

    await message.reply(
        f"⏸ **Marked as NOTNOW**\n\n"
        f"🆔 `{chat_id}`\n"
        f"This channel will not be forwarded."
    )
    
    
@Client.on_message(filters.me & filters.reply & filters.command("pending"))
async def notnow_handler(client, message):
    if not message.reply_to_message:
        return

    text = message.reply_to_message.text or ""

    # Extract chat_id from message text
    import re
    match = re.search(r"`(-100\d+)`", text)
    if not match:
        await message.reply("❌ Chat ID not found")
        return

    chat_id = int(match.group(1))

    mark_notnows(chat_id, reason="manual_notnow")

    await message.reply(
        f"⏸ **Marked as Pending**\n\n"
        f"🆔 `{chat_id}`\n"
        f"This channel will be forwarded."
    )