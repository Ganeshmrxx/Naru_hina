# plugins/debug.py
import asyncio
import time
import random as rnd
from pymongo import MongoClient
from pyrogram import Client, filters
from pyrogram.types import InputMediaPhoto
from pyrogram.enums import ChatType
from pyrogram.errors import FloodWait, RPCError

# Folder targets cache (cached for 5 minutes)
_folder_cache = {"time": 0, 5: set(), 6: set(), "admin_chats": set()}

VIDEO_TARGET = -1004401442087   # DBXVideos
TERA_TARGET  = -1004337870091   # DBXTera
MIX_TARGET   = -1003253102275   # Mix (ignored)
TARGET_CHANNELS = {VIDEO_TARGET, TERA_TARGET, MIX_TARGET,
                   4401442087, 4337870091, 3253102275}

TERABOX_KEYWORDS = [
    "terabox", "tera box", "teraboxapp", "1024tera",
    "teraboxlink", "terashare", "freeterabox"
]
TERABOX_DOMAINS = [
    "terabox.com", "teraboxapp.com", "1024terabox.com",
    "terafileshare.com", "terasharelink.com", "momerybox.com",
    "4funbox.com", "mirrobox.com", "nephobox.com",
    "freeterabox.com", "tboxlink.com"
]

def is_terabox_content(msg):
    text = ((getattr(msg, 'caption', None) or '') + ' ' + (getattr(msg, 'text', None) or '')).lower()
    if not text.strip():
        return False
    for kw in TERABOX_KEYWORDS:
        if kw in text:
            return True
    for domain in TERABOX_DOMAINS:
        if domain in text:
            return True
    return False

def is_video_message(msg):
    if msg.video:
        return True
    if msg.document and getattr(msg.document, 'mime_type', '').startswith('video/'):
        return True
    return False

def get_live_auto_target(msg):
    """Determine live auto target based on exact user rules:
    1. Single Video (or video document) -> DBXVideos (-1004401442087)
       (unless it has TeraBox link, then -> DBXTera)
    2. Grouped Gallery (Albums: Photo + Video mix or photos/videos) -> DBXVideos (-1004401442087)
       (unless it has TeraBox link, then -> DBXTera)
    3. Single Photo:
       - If contains TeraBox link -> DBXTera (-1004337870091)
       - If NO TeraBox link -> None, None (SKIP permanently)
    4. Text-only / Promo Ads / Plain text without media -> None, None (SKIP permanently)
    5. Groups/Supergroups: Only videos allowed.
    """
    is_group = msg.chat.type in (ChatType.GROUP, ChatType.SUPERGROUP)
    tera = is_terabox_content(msg)
    is_vid = is_video_message(msg)
    is_photo = bool(msg.photo)
    is_album = bool(getattr(msg, "media_group_id", None))

    # RULE 1: GROUPED GALLERY / ALBUMS
    if is_album:
        if tera:
            return TERA_TARGET, "DBXTera"
        # Grouped gallery with pic+video or any album media goes to DBXVideos
        return VIDEO_TARGET, "DBXVideos"

    # RULE 2: SINGLE VIDEO
    if is_vid:
        return (TERA_TARGET, "DBXTera") if tera else (VIDEO_TARGET, "DBXVideos")

    # RULE 3: SINGLE PHOTO
    if is_photo:
        if is_group:
            return None, None
        return (TERA_TARGET, "DBXTera") if tera else (None, None)

    # RULE 4: Plain text / Promo ads without media -> SKIP
    return None, None

async def resolve_folder_target(client, incoming_id):
    now = time.time()
    if now - _folder_cache["time"] > 300 or (not _folder_cache[5] and not _folder_cache[6]):
        if client and getattr(client, "is_connected", False):
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

def build_caption(original_caption, chat_id, chat_title, username=None):
    clean_id = str(chat_id).replace("-100", "").replace("-", "")
    if username:
        user_tag = f"@{username.lstrip('@')}"
        footer = f"\n\nchannel id = {chat_id}\nchannel name = {user_tag}\nchannel link = https://t.me/{username.lstrip('@')}"
    else:
        footer = f"\n\nchannel id = {chat_id}\nchannel name = {chat_title}\nchannel link = https://t.me/c/{clean_id}/1"

    if not original_caption:
        return footer.strip()
    max_orig_len = 1024 - len(footer) - 5
    if len(original_caption) > max_orig_len:
        original_caption = original_caption[:max_orig_len] + "..."
    return f"{original_caption}{footer}"

def build_text(original_text, chat_id, chat_title, username=None):
    clean_id = str(chat_id).replace("-100", "").replace("-", "")
    if username:
        user_tag = f"@{username.lstrip('@')}"
        footer = f"\n\nchannel id = {chat_id}\nchannel name = {user_tag}\nchannel link = https://t.me/{username.lstrip('@')}"
    else:
        footer = f"\n\nchannel id = {chat_id}\nchannel name = {chat_title}\nchannel link = https://t.me/c/{clean_id}/1"

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
    source_title = getattr(message.chat, "title", str(incoming_id))

    # CRITICAL GUARD 1: Target storage channels must NEVER be processed by auto_forward!
    clean_inc = int(str(incoming_id).replace("-100", "").replace("-", ""))
    if incoming_id in TARGET_CHANNELS or clean_inc in TARGET_CHANNELS:
        return

    # CRITICAL GUARD 2: SKIP ADMIN / CREATOR CHANNELS
    # Check cached admin status or resolve via chat permissions
    admin_chats = _folder_cache.setdefault("admin_chats", set())
    if incoming_id in admin_chats or clean_inc in admin_chats:
        return

    chat = message.chat
    is_creator = bool(getattr(chat, "is_creator", False))
    admin_rights = getattr(chat, "admin_rights", None)
    if is_creator or (admin_rights is not None):
        admin_chats.add(incoming_id)
        admin_chats.add(clean_inc)
        return

    # CRITICAL GUARD 3: SKIP KNOWN RESTRICTED VIDEODB CHANNELS
    restricted_chats = _folder_cache.setdefault("restricted_chats", set())
    if incoming_id in restricted_chats or clean_inc in restricted_chats:
        return

    # CRITICAL GUARD 4: UNIVERSAL CONTENT-BASED AUTO ROUTER
    # - Group: only videos (photos skipped)
    # - Videos with TeraBox link -> DBXTera
    # - Videos without TeraBox link -> DBXVideos
    # - Channel photos with TeraBox link -> DBXTera
    # - Text-only -> skipped
    target, tn = get_live_auto_target(message)
    if not target:
        return

    source_username = getattr(message.chat, "username", None)
    is_album = bool(getattr(message, "media_group_id", None))
    messageType = "album" if is_album else ("video" if is_video_message(message) else "photo")
    print(f"incoming {incoming_id} type {messageType} channel name '{source_title}' -> Target: {tn} ({target})")

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

        caption = build_caption(None, incoming_id, source_title or str(incoming_id), username=source_username)
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
            err_s = str(ge)
            if ("CHAT_FORWARDS_RESTRICTED" in err_s or "restricts forwarding content" in err_s) and target == TERA_TARGET:
                try:
                    media_msgs = await client.get_media_group(incoming_id, message.id)
                    input_media = []
                    for idx, m in enumerate(media_msgs):
                        if m.photo:
                            p_file = await client.download_media(m, in_memory=True)
                            if p_file:
                                if not getattr(p_file, 'name', None):
                                    p_file.name = f"album_{idx}.jpg"
                                c = caption if idx == 0 else ""
                                input_media.append(InputMediaPhoto(media=p_file, caption=c))
                    if input_media:
                        await client.send_media_group(chat_id=target, media=input_media)
                        print(f"✔ [TERADB LIVE ALBUM BYPASS] Sent {len(input_media)} photos to {target}")
                        return
                    else:
                        text_c = caption or (message.caption or "")
                        if text_c:
                            await client.send_message(chat_id=target, text=text_c, disable_web_page_preview=False)
                            print(f"✔ [TERADB LIVE ALBUM TEXT BYPASS] Sent caption as text to {target}")
                        return
                except Exception as dl_e:
                    print(f"❌ [TERADB LIVE ALBUM BYPASS ERR] {dl_e}")
                    return
            print(f"❌ Error copying live media group {group_id}: {ge}")
            return

    # Single media processing
    file_id = None
    duration = None
    size = None
    media_type = None

    if message.video:
        file_id = message.video.file_unique_id
        media_type = "video"
        duration = message.video.duration
        size = message.video.file_size
    elif message.document and getattr(message.document, 'mime_type', '').startswith('video/'):
        file_id = message.document.file_unique_id
        media_type = "video"
        duration = 0
        size = message.document.file_size
    elif message.photo:
        file_id = message.photo.file_unique_id
        media_type = "photo"
        duration = 0
        size = message.photo.file_size
    else:
        return

    if file_id and db["xData"].find_one({"_id": file_id}):
        print(f"⚠ File ID already exists in DB, skipping: {file_id}")
        return

    caption = build_caption(message.caption, incoming_id, source_title or str(incoming_id), username=source_username)
    try:
        copied_msg = await asyncio.wait_for(
            message.copy(chat_id=target, caption=caption),
            timeout=15.0
        )
        print(f"✔ Copied to {target}, message ID: {copied_msg.id}")

        # Insert metadata into DB
        if file_id:
            db["xData"].insert_one({
                "_id": file_id,
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
            if file_id:
                db["xData"].insert_one({
                    "_id": file_id,
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
        err_s = str(e)
        if ("CHAT_FORWARDS_RESTRICTED" in err_s or "restricts forwarding content" in err_s) and target == TERA_TARGET:
            try:
                if message.photo:
                    p_file = await client.download_media(message, in_memory=True)
                    if p_file:
                        if not getattr(p_file, 'name', None):
                            p_file.name = "photo.jpg"
                        sent_msg = await client.send_photo(chat_id=target, photo=p_file, caption=caption)
                        print(f"✔ [TERADB LIVE PHOTO BYPASS] Sent photo to {target}, id: {sent_msg.id}")
                        if file_id:
                            db["xData"].insert_one({
                                "_id": file_id,
                                "channel_id": target,
                                "message_id": sent_msg.id,
                                "media_type": media_type,
                                "duration": duration,
                                "file_size": size
                            })
                else:
                    text_c = caption or (message.caption or "")
                    if text_c:
                        sent_msg = await client.send_message(chat_id=target, text=text_c, disable_web_page_preview=False)
                        print(f"✔ [TERADB LIVE TEXT BYPASS] Sent caption as text to {target}, id: {sent_msg.id}")
            except Exception as dl_e:
                print(f"❌ [TERADB LIVE PHOTO BYPASS ERR] {dl_e}")
        else:
            if "CHAT_FORWARDS_RESTRICTED" in err_s or "restricts forwarding content" in err_s:
                restricted_chats = _folder_cache.setdefault("restricted_chats", set())
                restricted_chats.add(incoming_id)
                clean_id = int(str(incoming_id).replace("-100", "").replace("-", ""))
                restricted_chats.add(clean_id)
                print(f"🚫 [RESTRICTED CHANNEL] VideoDB Channel '{source_title}' ({incoming_id}) restricts forwarding. Cached in restricted list to drop future messages.")
            else:
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