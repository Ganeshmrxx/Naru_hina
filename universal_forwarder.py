import asyncio
asyncio.set_event_loop(asyncio.new_event_loop())
import sys
sys.stdout.reconfigure(encoding='utf-8')

import os
import glob
import random
import signal
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from pymongo import MongoClient

import pyrogram.utils
pyrogram.utils.MIN_CHANNEL_ID = -1009999999999
pyrogram.utils.MAX_CHANNEL_ID = -1000000000000

from pyrogram import Client, raw
from pyrogram.types import InputMediaPhoto, InputMediaVideo, InputMediaDocument
from pyrogram.errors import FloodWait, ChatForwardsRestricted, ChannelPrivate, Forbidden, RPCError
from config import Config

# ==============================================================================
# CONFIGURATION
# ==============================================================================
MONGO_URI = "mongodb+srv://g3cwork_db_user:g312345@cluster0.lpmpcya.mongodb.net/?retryWrites=true&w=majority"
DB_NAME = "Cluster0"

# Target Channels
TARGET_VIDEOS_ID = -1004401442087  # DBXVideos
TARGET_TERA_ID = -1004337870091    # DBXTera

# Telegram Folders to Target Mapping
FOLDER_CONFIG = {
    5: {
        "folder_name": "videoDB",
        "target_id": TARGET_VIDEOS_ID,
        "target_name": "DBXVideos"
    },
    6: {
        "folder_name": "TeraDB",
        "target_id": TARGET_TERA_ID,
        "target_name": "DBXTera"
    }
}

STATUS_UPDATE_EVERY = 100  # Commit to MongoDB every 100 transfers
BOT_BATCH_SIZE = 10       # Switch active worker bot every 10 messages
TEMP_DOWNLOAD_DIR = r"e:\Ganesh\ANIGRAVITY\allforward\temp_downloads"

# Global state for graceful shutdown
CURRENT_ACTIVE_CHANNEL = None
CURRENT_PROGRESS = {
    "chat_id": None,
    "source_name": "",
    "folder_name": "",
    "target_id": 0,
    "target_name": "",
    "last_msg_id": 0,
    "total_copied": 0,
    "status": "idle",
    "channel_type": "unknown"
}
SHUTDOWN_REQUESTED = False

# ==============================================================================
# DATABASE HELPERS
# ==============================================================================
mongo_client = MongoClient(MONGO_URI)
db = mongo_client[DB_NAME]
progress_col = db["forward_progress"]
queue_col = db["forward_queue"]

def get_channel_progress(chat_id: int) -> Dict[str, Any]:
    doc = progress_col.find_one({"chat_id": chat_id})
    if not doc:
        doc = progress_col.find_one({"source_id": chat_id})
    return doc or {}

def save_channel_progress(
    chat_id: int,
    source_name: str,
    folder_name: str,
    target_id: int,
    target_name: str,
    last_msg_id: int,
    total_copied: int,
    status: str = "in_progress",
    channel_type: str = "unknown"
):
    progress_col.update_one(
        {"chat_id": chat_id},
        {"$set": {
            "chat_id": chat_id,
            "source_id": chat_id,
            "source_name": source_name,
            "folder_name": folder_name,
            "target_id": target_id,
            "target_name": target_name,
            "last_msg_id": last_msg_id,
            "total_copied": total_copied,
            "status": status,
            "channel_type": channel_type,
            "updated_at": datetime.now(timezone.utc)
        }},
        upsert=True
    )
    CURRENT_PROGRESS.update({
        "chat_id": chat_id,
        "source_name": source_name,
        "folder_name": folder_name,
        "target_id": target_id,
        "target_name": target_name,
        "last_msg_id": last_msg_id,
        "total_copied": total_copied,
        "status": status,
        "channel_type": channel_type
    })

def update_queue_status(queue_items: List[Dict[str, Any]], active_chat_id: Optional[int]):
    """Syncs the ordered channel queue to MongoDB collection forward_queue."""
    for idx, item in enumerate(queue_items):
        cid = item["chat_id"]
        if cid == active_chat_id:
            status = "in_progress"
        else:
            doc = get_channel_progress(cid)
            status = doc.get("status", "queued")
            if status != "completed":
                status = "queued"

        queue_col.update_one(
            {"chat_id": cid},
            {"$set": {
                "queue_position": idx + 1,
                "chat_id": cid,
                "title": item["title"],
                "folder_name": item["folder_name"],
                "folder_id": item["folder_id"],
                "target_id": item["target_id"],
                "target_name": item["target_name"],
                "status": status,
                "updated_at": datetime.now(timezone.utc)
            }},
            upsert=True
        )

# ==============================================================================
# CAPTION HELPERS
# ==============================================================================
def build_caption(original_caption: Optional[str], chat_id: int, chat_title: str) -> str:
    footer = f"\n\nchannel id = {chat_id}\nchannel name = {chat_title}"
    if not original_caption:
        return footer.strip()
    max_orig_len = 1024 - len(footer) - 5
    if len(original_caption) > max_orig_len:
        original_caption = original_caption[:max_orig_len] + "..."
    return f"{original_caption}{footer}"

def build_text(original_text: Optional[str], chat_id: int, chat_title: str) -> str:
    footer = f"\n\nchannel id = {chat_id}\nchannel name = {chat_title}"
    if not original_text:
        return footer.strip()
    max_orig_len = 4096 - len(footer) - 5
    if len(original_text) > max_orig_len:
        original_text = original_text[:max_orig_len] + "..."
    return f"{original_text}{footer}"

# ==============================================================================
# FORWARDER ENGINE
# ==============================================================================
class UniversalForwarder:
    def __init__(self):
        self.user_app: Optional[Client] = None
        self.worker_bots: List[Client] = []
        self.bots_initialized: bool = False
        self.current_bot_idx: int = 0
        self.bot_counter: int = 0
        self.target_input_channels: Dict[int, raw.types.InputChannel] = {}

    async def initialize_userbot(self):
        print("=" * 70, flush=True)
        print("INITIALIZING UNIVERSAL TELEGRAM FORWARDER", flush=True)
        print("=" * 70, flush=True)

        # 1. Clean stale temp downloads
        os.makedirs(TEMP_DOWNLOAD_DIR, exist_ok=True)
        stale_files = glob.glob(os.path.join(TEMP_DOWNLOAD_DIR, "*"))
        for sf in stale_files:
            try:
                os.remove(sf)
            except Exception:
                pass
        if stale_files:
            print(f"Cleaned {len(stale_files)} stale temp download files.", flush=True)

        # 2. Start Userbot Client
        print("\n[1/2] Connecting Userbot (SESSION2)...", flush=True)
        self.user_app = Client(
            "userbot_session",
            api_id=Config.API_ID2,
            api_hash=Config.API_HASH2,
            session_string=Config.SESSION2,
            in_memory=True
        )
        await self.user_app.start()
        me = await self.user_app.get_me()
        print(f"   Logged in as Userbot: {me.first_name} (@{me.username}) [ID: {me.id}]", flush=True)

        # 3. Cache Target Channels & Access Hashes
        print("\n[2/2] Resolving Target Channels...", flush=True)
        for cid, info in [(TARGET_VIDEOS_ID, "DBXVideos"), (TARGET_TERA_ID, "DBXTera")]:
            peer = await self.user_app.resolve_peer(cid)
            self.target_input_channels[cid] = raw.types.InputChannel(
                channel_id=peer.channel_id,
                access_hash=peer.access_hash
            )
            print(f"   Cached Target: {info} (ID: {cid}, ChannelID: {peer.channel_id})", flush=True)

        print("\nUserbot ready! Channel queue will now be built.\n", flush=True)

    async def initialize_worker_bots_if_needed(self):
        """Initializes worker bots on-demand only when a public channel is processed."""
        if self.bots_initialized:
            return

        print(f"\n[LAZY INIT] Connecting {len(Config.BOT_WORKERS)} Worker Bots for Public Channel...", flush=True)
        for idx, token in enumerate(Config.BOT_WORKERS):
            bot = Client(
                f"worker_bot_{idx+1}",
                api_id=Config.API_ID2,
                api_hash=Config.API_HASH2,
                bot_token=token,
                in_memory=True
            )
            await bot.start()
            for cid, inp_chan in self.target_input_channels.items():
                try:
                    await bot.invoke(raw.functions.channels.GetChannels(id=[inp_chan]))
                except Exception:
                    pass
            b_me = await bot.get_me()
            self.worker_bots.append(bot)
            print(f"   Worker {idx+1:02d}: @{b_me.username} [READY]", flush=True)

        self.bots_initialized = True
        print(f"Worker Bots pool ready with {len(self.worker_bots)} bots.\n", flush=True)

    def get_next_worker_bot(self) -> Client:
        """Returns exactly ONE active worker bot, rotating every 10 messages."""
        bot = self.worker_bots[self.current_bot_idx]
        self.bot_counter += 1
        if self.bot_counter >= BOT_BATCH_SIZE:
            self.bot_counter = 0
            self.current_bot_idx = (self.current_bot_idx + 1) % len(self.worker_bots)
        return bot

    async def get_folder_channels(self, folder_id: int) -> List[int]:
        filters = await self.user_app.invoke(raw.functions.messages.GetDialogFilters())
        channel_ids = []
        for f in filters:
            if getattr(f, 'id', None) == folder_id:
                for p in getattr(f, 'include_peers', []):
                    cid = getattr(p, 'channel_id', getattr(p, 'chat_id', None))
                    if cid:
                        channel_ids.append(int(f"-100{cid}"))
        return channel_ids

    async def copy_public_message(self, source_username: str, chat_id: int, chat_title: str, msg: Any, target_id: int) -> bool:
        """Copies message using 1 active bot at a time (rotating every 10 messages)."""
        await self.initialize_worker_bots_if_needed()
        bot = self.get_next_worker_bot()
        bot_me = await bot.get_me()
        caption = build_caption(msg.caption, chat_id, chat_title)

        try:
            if msg.media:
                await bot.copy_message(
                    chat_id=target_id,
                    from_chat_id=source_username,
                    message_id=msg.id,
                    caption=caption
                )
            elif msg.text:
                text = build_text(msg.text, chat_id, chat_title)
                await bot.send_message(
                    chat_id=target_id,
                    text=text,
                    disable_web_page_preview=False
                )
            return True
        except FloodWait as e:
            print(f"   [Worker @{bot_me.username}] FloodWait: Sleeping {e.value + 2}s...", flush=True)
            await asyncio.sleep(e.value + 2)
            return await self.copy_private_message(chat_id, chat_title, msg, target_id)
        except Exception as e:
            print(f"   [Worker @{bot_me.username}] Error ({e}), falling back to Userbot...", flush=True)
            return await self.copy_private_message(chat_id, chat_title, msg, target_id)

    async def copy_private_message(self, chat_id: int, chat_title: str, msg: Any, target_id: int) -> bool:
        """Copies message directly using Userbot."""
        caption = build_caption(msg.caption, chat_id, chat_title)
        try:
            if msg.media:
                await self.user_app.copy_message(
                    chat_id=target_id,
                    from_chat_id=chat_id,
                    message_id=msg.id,
                    caption=caption
                )
            elif msg.text:
                text = build_text(msg.text, chat_id, chat_title)
                await self.user_app.send_message(
                    chat_id=target_id,
                    text=text,
                    disable_web_page_preview=False
                )
            return True
        except ChatForwardsRestricted:
            return await self.copy_restricted_message(chat_id, chat_title, msg, target_id)
        except FloodWait as e:
            print(f"   [Userbot] FloodWait: Sleeping {e.value + 2}s...", flush=True)
            await asyncio.sleep(e.value + 2)
            return await self.copy_private_message(chat_id, chat_title, msg, target_id)
        except Exception as e:
            print(f"   [Userbot] Copy error for msg {msg.id}: {e}", flush=True)
            return False

    async def copy_restricted_message(self, chat_id: int, chat_title: str, msg: Any, target_id: int) -> bool:
        """Downloads media locally and uploads to target channel with caption."""
        caption = build_caption(msg.caption, chat_id, chat_title)
        
        if not msg.media:
            if msg.text:
                text = build_text(msg.text, chat_id, chat_title)
                await self.user_app.send_message(chat_id=target_id, text=text, disable_web_page_preview=False)
                return True
            return False

        file_path = None
        try:
            print(f"   [RESTRICTED] Downloading media from msg {msg.id}...", flush=True)
            file_path = await self.user_app.download_media(msg, file_name=f"{TEMP_DOWNLOAD_DIR}/")
            if not file_path or not os.path.exists(file_path):
                print(f"   [RESTRICTED] Failed to download msg {msg.id}", flush=True)
                return False

            print(f"   [RESTRICTED] Uploading to target channel...", flush=True)
            if msg.video:
                await self.user_app.send_video(
                    chat_id=target_id,
                    video=file_path,
                    caption=caption,
                    duration=getattr(msg.video, 'duration', 0),
                    width=getattr(msg.video, 'width', 0),
                    height=getattr(msg.video, 'height', 0),
                    supports_streaming=True
                )
            elif msg.photo:
                await self.user_app.send_photo(
                    chat_id=target_id,
                    photo=file_path,
                    caption=caption
                )
            elif msg.document:
                await self.user_app.send_document(
                    chat_id=target_id,
                    document=file_path,
                    caption=caption
                )
            elif msg.audio:
                await self.user_app.send_audio(
                    chat_id=target_id,
                    audio=file_path,
                    caption=caption
                )
            elif msg.voice:
                await self.user_app.send_voice(
                    chat_id=target_id,
                    voice=file_path,
                    caption=caption
                )
            elif msg.animation:
                await self.user_app.send_animation(
                    chat_id=target_id,
                    animation=file_path,
                    caption=caption
                )
            return True
        except FloodWait as e:
            print(f"   [RESTRICTED] FloodWait: Sleeping {e.value + 2}s...", flush=True)
            await asyncio.sleep(e.value + 2)
            return False
        except Exception as e:
            print(f"   [RESTRICTED] Upload failed for msg {msg.id}: {e}", flush=True)
            return False
        finally:
            if file_path and os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except Exception:
                    pass

    async def copy_public_media_group(self, source_username: str, chat_id: int, chat_title: str, msg_id: int, target_id: int) -> bool:
        """Copies an entire media group using the active worker bot."""
        await self.initialize_worker_bots_if_needed()
        bot = self.get_next_worker_bot()
        bot_me = await bot.get_me()
        caption = build_caption(None, chat_id, chat_title)
        try:
            await bot.copy_media_group(
                chat_id=target_id,
                from_chat_id=source_username,
                message_id=msg_id,
                captions=caption
            )
            return True
        except FloodWait as e:
            print(f"   [Worker @{bot_me.username}] FloodWait in album: Sleeping {e.value + 2}s...", flush=True)
            await asyncio.sleep(e.value + 2)
            return await self.copy_private_media_group(chat_id, chat_title, msg_id, target_id)
        except Exception as e:
            print(f"   [Worker @{bot_me.username}] Album copy error ({e}), falling back to Userbot...", flush=True)
            return await self.copy_private_media_group(chat_id, chat_title, msg_id, target_id)

    async def copy_private_media_group(self, chat_id: int, chat_title: str, msg_id: int, target_id: int) -> bool:
        """Copies an entire media group using the Userbot."""
        caption = build_caption(None, chat_id, chat_title)
        try:
            await self.user_app.copy_media_group(
                chat_id=target_id,
                from_chat_id=chat_id,
                message_id=msg_id,
                captions=caption
            )
            return True
        except ChatForwardsRestricted:
            try:
                group_msgs = await self.user_app.get_media_group(chat_id, msg_id)
                return await self.copy_restricted_media_group(chat_id, chat_title, group_msgs, target_id)
            except Exception as re:
                print(f"   [RESTRICTED ALBUM] Fallback error: {re}", flush=True)
                return False
        except FloodWait as e:
            print(f"   [Userbot] Album FloodWait: Sleeping {e.value + 2}s...", flush=True)
            await asyncio.sleep(e.value + 2)
            return await self.copy_private_media_group(chat_id, chat_title, msg_id, target_id)
        except Exception as e:
            print(f"   [Userbot] copy_media_group error for msg {msg_id}: {e}", flush=True)
            return False

    async def copy_restricted_media_group(self, chat_id: int, chat_title: str, group_msgs: List[Any], target_id: int) -> bool:
        """Downloads all items in a restricted album, then uploads via send_media_group with custom caption."""
        downloaded_files = []
        media_items = []
        
        orig_caption = None
        for m in group_msgs:
            if m.caption:
                orig_caption = m.caption
                break
        caption = build_caption(orig_caption, chat_id, chat_title)
        
        try:
            print(f"   [RESTRICTED ALBUM] Downloading {len(group_msgs)} items...", flush=True)
            for idx, m in enumerate(group_msgs):
                fpath = await self.user_app.download_media(m, file_name=f"{TEMP_DOWNLOAD_DIR}/")
                if not fpath or not os.path.exists(fpath):
                    continue
                downloaded_files.append(fpath)
                item_caption = caption if idx == 0 else ""
                
                if m.video:
                    media_items.append(InputMediaVideo(
                        media=fpath,
                        caption=item_caption,
                        duration=getattr(m.video, 'duration', 0),
                        width=getattr(m.video, 'width', 0),
                        height=getattr(m.video, 'height', 0),
                        supports_streaming=True
                    ))
                elif m.photo:
                    media_items.append(InputMediaPhoto(
                        media=fpath,
                        caption=item_caption
                    ))
                elif m.document:
                    media_items.append(InputMediaDocument(
                        media=fpath,
                        caption=item_caption
                    ))
            
            if not media_items:
                return False
                
            print(f"   [RESTRICTED ALBUM] Uploading complete group ({len(media_items)} items)...", flush=True)
            await self.user_app.send_media_group(chat_id=target_id, media=media_items)
            return True
        except FloodWait as e:
            print(f"   [RESTRICTED ALBUM] FloodWait: Sleeping {e.value + 2}s...", flush=True)
            await asyncio.sleep(e.value + 2)
            return False
        except Exception as e:
            print(f"   [RESTRICTED ALBUM] Error uploading album: {e}", flush=True)
            return False
        finally:
            for fpath in downloaded_files:
                if fpath and os.path.exists(fpath):
                    try:
                        os.remove(fpath)
                    except Exception:
                        pass

    async def process_channel(self, item: Dict[str, Any], queue_remaining: List[Dict[str, Any]]):
        global CURRENT_ACTIVE_CHANNEL
        chat_id = item["chat_id"]
        chat_title = item["title"]
        folder_name = item["folder_name"]
        target_id = item["target_id"]
        target_name = item["target_name"]
        CURRENT_ACTIVE_CHANNEL = chat_id

        # Update queue state in MongoDB
        update_queue_status([item] + queue_remaining, active_chat_id=chat_id)

        try:
            chat = await self.user_app.get_chat(chat_id)
        except Exception as e:
            print(f"\n[SKIP] Could not access channel '{chat_title}' ({chat_id}): {e}", flush=True)
            return

        chat_title = chat.title or chat_title
        is_public = bool(chat.username)
        is_restricted = getattr(chat, 'has_protected_content', False)

        if is_restricted:
            mode_desc = "Mode C: Restricted (Download & Upload via Userbot)"
            channel_type = "restricted"
        elif is_public:
            mode_desc = f"Mode A: Public (@{chat.username}) (12 Bots Rotation, 1 Bot at a time)"
            channel_type = "public"
        else:
            mode_desc = "Mode B: Private (Direct Copy via Userbot)"
            channel_type = "private"

        print(f"\n" + "=" * 70, flush=True)
        print(f"WORKING ON CHANNEL: {chat_title}", flush=True)
        print(f"Folder: {folder_name} | Target: {target_name} ({target_id})", flush=True)
        print(f"Channel ID: {chat_id} | Type: {mode_desc}", flush=True)
        print(f"Remaining in Queue: {len(queue_remaining)} channels waiting", flush=True)
        print("=" * 70, flush=True)

        # 1. Fetch Latest Message ID
        latest_msg_id = 0
        async for m in self.user_app.get_chat_history(chat_id, limit=1):
            latest_msg_id = m.id
            break

        if latest_msg_id == 0:
            print("   Channel appears empty. Moving to next queued channel.", flush=True)
            save_channel_progress(
                chat_id, chat_title, folder_name, target_id, target_name,
                0, 0, "completed", channel_type
            )
            return

        # 2. Check MongoDB for resume point
        progress = get_channel_progress(chat_id)
        last_msg_id = progress.get("last_msg_id", 0)
        total_copied = progress.get("total_copied", 0)

        if last_msg_id >= latest_msg_id:
            print(f"   [UP TO DATE] All messages up to {latest_msg_id} already transferred. (Copied: {total_copied})", flush=True)
            save_channel_progress(
                chat_id, chat_title, folder_name, target_id, target_name,
                latest_msg_id, total_copied, "completed", channel_type
            )
            return

        print(f"   Resuming from Message ID: {last_msg_id + 1} to {latest_msg_id} (Already copied: {total_copied})", flush=True)

        # 3. Batch Iterate From Oldest to Newest (1 channel at a time)
        batch_size = 50
        current_id = last_msg_id + 1
        messages_since_checkpoint = 0
        processed_group_ids = set()
        processed_msg_ids = set()

        while current_id <= latest_msg_id:
            if SHUTDOWN_REQUESTED:
                print("\n[STOPPING] Shutdown requested. Saving state to MongoDB...", flush=True)
                save_channel_progress(
                    chat_id, chat_title, folder_name, target_id, target_name,
                    current_id - 1, total_copied, "paused", channel_type
                )
                return

            end_id = min(current_id + batch_size - 1, latest_msg_id)
            id_list = list(range(current_id, end_id + 1))

            try:
                msgs = await self.user_app.get_messages(chat_id, id_list)
            except Exception as e:
                print(f"   Error fetching batch {current_id}-{end_id}: {e}", flush=True)
                await asyncio.sleep(3)
                current_id = end_id + 1
                continue

            for msg in msgs:
                if SHUTDOWN_REQUESTED:
                    break

                if not msg or getattr(msg, 'empty', True):
                    continue

                if msg.id in processed_msg_ids:
                    continue

                # ==============================================================
                # RULE 1: GROUPED MESSAGES (ALBUMS) -> FULL GROUP COPIED
                # "grouped message me photo ho ha ya video , pura grouped copy hoga"
                # ==============================================================
                if getattr(msg, 'media_group_id', None):
                    group_id = msg.media_group_id
                    if group_id in processed_group_ids:
                        continue

                    processed_group_ids.add(group_id)
                    try:
                        group_msgs = await self.user_app.get_media_group(chat_id, msg.id)
                    except Exception as ge:
                        print(f"   Error fetching media group {group_id} ({ge}), treating as single.", flush=True)
                        group_msgs = [msg]

                    for gm in group_msgs:
                        processed_msg_ids.add(gm.id)

                    print(f"   [ALBUM] Copying complete media group (Group ID: {group_id}, {len(group_msgs)} items)...", flush=True)
                    success = False
                    if is_restricted:
                        success = await self.copy_restricted_media_group(chat_id, chat_title, group_msgs, target_id)
                    elif is_public:
                        success = await self.copy_public_media_group(chat.username, chat_id, chat_title, msg.id, target_id)
                    else:
                        success = await self.copy_private_media_group(chat_id, chat_title, msg.id, target_id)

                    if success:
                        items_count = len(group_msgs)
                        total_copied += items_count
                        messages_since_checkpoint += items_count
                        print(f"   [OK ALBUM] Group {group_id} ({items_count} items) transferred | Channel Total: {total_copied}", flush=True)

                        if messages_since_checkpoint >= STATUS_UPDATE_EVERY:
                            save_channel_progress(
                                chat_id, chat_title, folder_name, target_id, target_name,
                                msg.id, total_copied, "in_progress", channel_type
                            )
                            print(f"   [CHECKPOINT] MongoDB updated! (Msg ID: {msg.id}, Copied: {total_copied})", flush=True)
                            messages_since_checkpoint = 0

                    await asyncio.sleep(random.uniform(1.5, 2.5))
                    continue

                # ==============================================================
                # RULE 2: SINGLE PHOTO -> DO NOT COPY
                # "but agar photo single me h , copy nahi hoga"
                # ==============================================================
                if msg.photo:
                    print(f"   [SKIP] Single photo ignored (Msg {msg.id})", flush=True)
                    continue

                # ==============================================================
                # RULE 3: SINGLE VIDEO -> COPY
                # "lekin agr video single me h copy hoga"
                # ==============================================================
                is_video = bool(msg.video or (msg.document and getattr(msg.document, 'mime_type', '').startswith('video/')))
                is_text = bool(msg.text and msg.text.strip())

                if not (is_video or is_text):
                    print(f"   [SKIP] Single non-video media ignored (Msg {msg.id})", flush=True)
                    continue

                if is_text:
                    if folder_name == "TeraDB" or "http" in msg.text or "tera" in msg.text.lower():
                        pass  # Allow TeraBox text/links
                    else:
                        print(f"   [SKIP] Non-link text message in {folder_name} ignored (Msg {msg.id})", flush=True)
                        continue

                # Execute transfer using single active worker
                success = False
                if is_restricted:
                    success = await self.copy_restricted_message(chat_id, chat_title, msg, target_id)
                elif is_public:
                    success = await self.copy_public_message(chat.username, chat_id, chat_title, msg, target_id)
                else:
                    success = await self.copy_private_message(chat_id, chat_title, msg, target_id)

                if success:
                    total_copied += 1
                    messages_since_checkpoint += 1
                    m_label = "Video" if is_video else "Text"
                    print(f"   [OK {m_label}] Msg {msg.id}/{latest_msg_id} transferred | Channel Total: {total_copied}", flush=True)

                    # Checkpoint to MongoDB every 100 transfers
                    if messages_since_checkpoint >= STATUS_UPDATE_EVERY:
                        save_channel_progress(
                            chat_id, chat_title, folder_name, target_id, target_name,
                            msg.id, total_copied, "in_progress", channel_type
                        )
                        print(f"   [CHECKPOINT] MongoDB updated! (Msg ID: {msg.id}, Copied: {total_copied})", flush=True)
                        messages_since_checkpoint = 0

                # Gentle delay to respect Telegram limits
                await asyncio.sleep(random.uniform(1.2, 2.2))

            # Update batch progress in MongoDB
            save_channel_progress(
                chat_id, chat_title, folder_name, target_id, target_name,
                end_id, total_copied, "in_progress", channel_type
            )
            current_id = end_id + 1

        # Channel Completed
        save_channel_progress(
            chat_id, chat_title, folder_name, target_id, target_name,
            latest_msg_id, total_copied, "completed", channel_type
        )
        print(f"\n[DONE] Channel '{chat_title}' finished completely! (Total copied: {total_copied})", flush=True)

    async def run(self):
        await self.initialize_userbot()

        # Build full Queue from both folders
        full_queue = []
        for fid in [5, 6]:
            f_cfg = FOLDER_CONFIG[fid]
            channel_ids = await self.get_folder_channels(fid)
            for cid in channel_ids:
                try:
                    c_info = await self.user_app.get_chat(cid)
                    title = c_info.title or f"Channel {cid}"
                except Exception:
                    title = f"Channel {cid}"

                full_queue.append({
                    "chat_id": cid,
                    "title": title,
                    "folder_id": fid,
                    "folder_name": f_cfg["folder_name"],
                    "target_id": f_cfg["target_id"],
                    "target_name": f_cfg["target_name"]
                })

        # Filter out already completed channels from active processing
        pending_queue = []
        for item in full_queue:
            prog = get_channel_progress(item["chat_id"])
            if prog.get("status") == "completed":
                print(f"   [SKIP COMPLETED] {item['title']} is already finished.", flush=True)
            else:
                pending_queue.append(item)

        # Print Queue Status
        print("\n" + "=" * 70, flush=True)
        print(f"FORWARDING QUEUE ({len(pending_queue)} CHANNELS TO PROCESS - 1 AT A TIME)", flush=True)
        print("=" * 70, flush=True)
        for idx, item in enumerate(pending_queue):
            pos_label = "[ACTIVE 1ST]" if idx == 0 else f"[QUEUED #{idx+1}]"
            print(f" {pos_label:14} {item['title']:<25} | Folder: {item['folder_name']:<8} | Target: {item['target_name']}", flush=True)
        print("=" * 70 + "\n", flush=True)

        # Process exactly ONE channel at a time
        while pending_queue:
            if SHUTDOWN_REQUESTED:
                break
            current_item = pending_queue.pop(0)
            await self.process_channel(current_item, queue_remaining=pending_queue)

        print("\nAll queued channels have been processed successfully.", flush=True)
        await self.shutdown()

    async def shutdown(self):
        print("\nClosing client connections...", flush=True)
        if CURRENT_PROGRESS.get("chat_id"):
            save_channel_progress(
                CURRENT_PROGRESS["chat_id"],
                CURRENT_PROGRESS["source_name"],
                CURRENT_PROGRESS["folder_name"],
                CURRENT_PROGRESS["target_id"],
                CURRENT_PROGRESS["target_name"],
                CURRENT_PROGRESS["last_msg_id"],
                CURRENT_PROGRESS["total_copied"],
                CURRENT_PROGRESS["status"],
                CURRENT_PROGRESS["channel_type"]
            )
            print(f"Flushed final state to MongoDB: {CURRENT_PROGRESS}", flush=True)

        if self.user_app and self.user_app.is_connected:
            await self.user_app.stop()
        for bot in self.worker_bots:
            if bot.is_connected:
                await bot.stop()
        print("Shutdown complete.", flush=True)

# ==============================================================================
# MAIN ENTRY POINT
# ==============================================================================
def handle_exit(signum, frame):
    global SHUTDOWN_REQUESTED
    print(f"\nReceived termination signal ({signum}). Requesting safe shutdown...", flush=True)
    SHUTDOWN_REQUESTED = True

signal.signal(signal.SIGINT, handle_exit)
signal.signal(signal.SIGTERM, handle_exit)

if __name__ == "__main__":
    forwarder = UniversalForwarder()
    try:
        asyncio.run(forwarder.run())
    except KeyboardInterrupt:
        print("\nKeyboardInterrupt caught.", flush=True)
