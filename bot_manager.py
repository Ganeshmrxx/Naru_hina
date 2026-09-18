import asyncio
import logging
import time
import uuid
from collections import deque
from datetime import datetime

# Fix for Python 3.14 where no event loop exists in MainThread on module import
try:
    asyncio.get_event_loop()
except RuntimeError:
    asyncio.set_event_loop(asyncio.new_event_loop())

# Import bot classes
from MovieForwarderBot import MovieForwarderBot
from TeraBoxModifierBot import TeraBoxModifierBot
from BackupForwarderBot import BackupForwarderBot
from GeneralDataModifierBot import GeneralDataModifierBot
import re
from pyrogram.raw.functions.messages import GetDialogFilters, UpdateDialogFilter
from pyrogram.raw.types import DialogFilter

class LogCaptureHandler(logging.Handler):
    def __init__(self, log_buffer, error_buffer):
        super().__init__()
        self.log_buffer = log_buffer
        self.error_buffer = error_buffer

    def emit(self, record):
        try:
            bot_id = getattr(record, "bot_id", "system")
            msg_str = str(self.format(record)).encode("ascii", errors="ignore").decode("ascii")
            log_entry = {
                "timestamp": datetime.fromtimestamp(record.created).isoformat(),
                "bot_id": bot_id,
                "level": record.levelname,
                "message": msg_str
            }
            self.log_buffer.append(log_entry)
            if record.levelno >= logging.ERROR:
                self.error_buffer.append(log_entry)
        except Exception:
            self.handleError(record)

class BotManager:
    BOT_CONFIGS = {
        "movie_forwarder": {
            "name": "Movie Forwarder",
            "class": MovieForwarderBot,
            "session_type": "userbot",
            "description": "Filters and mirrors large video files (>150MB)"
        },
        "terabox_modifier": {
            "name": "TeraBox Modifier",
            "class": TeraBoxModifierBot,
            "session_type": "bot_token",
            "description": "Rewrites TeraBox links & auto-posts videos"
        },
        "backup_forwarder": {
            "name": "Backup Forwarder",
            "class": BackupForwarderBot,
            "session_type": "userbot",
            "description": "Channel-to-channel live & bulk media forwarding"
        },
        "data_modifier": {
            "name": "General Data Modifier",
            "class": GeneralDataModifierBot,
            "session_type": "bot_token",
            "description": "Interactive media modifier with inline remove button"
        },
    }

    def __init__(self):
        try:
            asyncio.get_event_loop()
        except RuntimeError:
            asyncio.set_event_loop(asyncio.new_event_loop())

        self.log_buffer = deque(maxlen=1000)
        self.error_buffer = deque(maxlen=1000)

        # Custom logging setup
        handler = LogCaptureHandler(self.log_buffer, self.error_buffer)
        formatter = logging.Formatter('%(message)s')
        handler.setFormatter(formatter)
        
        logger = logging.getLogger()
        logger.setLevel(logging.INFO)
        logger.addHandler(handler)

        self.bots = {
            bot_id: {
                "name": cfg["name"],
                "class": cfg["class"],
                "session_type": cfg["session_type"],
                "instance": None,
                "task": None
            }
            for bot_id, cfg in self.BOT_CONFIGS.items()
        }

        self.status = {
            bot_id: {
                "bot_id": bot_id,
                "name": cfg["name"],
                "session_type": cfg["session_type"],
                "is_running": False,
                "started_at": None,
                "last_heartbeat": None,
                "last_activity": None,
                "last_error": None,
                "messages_processed": 0,
                "spam_enabled": False,
                "promote_enabled": True if "promoter" in bot_id else False
            }
            for bot_id, cfg in self.BOT_CONFIGS.items()
        }

        self.spam_enabled = {}
        self.promote_enabled = {}
        self.background_tasks = {}
        self.forward_jobs = {}  # In-memory tracking for active bulk forward jobs
        self.dialogs_cache = []
        self.dialogs_cache_time = 0
        self._heartbeat_task = None

    def start_heartbeat(self):
        if self._heartbeat_task is None:
            self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

    async def _heartbeat_loop(self):
        while True:
            try:
                now_str = datetime.now().isoformat()
                for bot_id, bot_info in self.bots.items():
                    inst = bot_info.get("instance")
                    if inst is not None:
                        is_conn = getattr(inst, "is_connected", False)
                        self.status[bot_id]["is_running"] = bool(is_conn)
                        if is_conn:
                            self.status[bot_id]["last_heartbeat"] = now_str
                    else:
                        self.status[bot_id]["is_running"] = False
            except Exception:
                pass
            await asyncio.sleep(5)

    def get_logs(self, bot_id=None, level=None, limit=100):
        logs = list(self.log_buffer)
        if bot_id:
            logs = [log for log in logs if log["bot_id"] == bot_id]
        if level:
            logs = [log for log in logs if log["level"] == level.upper()]
        return logs[-limit:]

    def get_errors(self, limit=50):
        return list(self.error_buffer)[-limit:]

    async def _run_bot(self, bot_id: str):
        bot_info = self.bots[bot_id]
        bot_info["instance"] = bot_info["class"]()
        try:
            self.status[bot_id]["is_running"] = True
            self.status[bot_id]["started_at"] = datetime.now().isoformat()
            self.status[bot_id]["last_heartbeat"] = datetime.now().isoformat()
            self.status[bot_id]["last_error"] = None
            logging.info(f"Starting {bot_id}...", extra={"bot_id": bot_id})
            await bot_info["instance"].start()
            logging.info(f"{bot_id} started successfully", extra={"bot_id": bot_id})
            if bot_id in ["backup_forwarder", "movie_forwarder"]:
                self.dialogs_cache = None
                self.dialogs_cache_time = 0

            # Check if promotion task should be launched
            if "promoter" in bot_id and self.promote_enabled.get(bot_id, False):
                self.enable_promote(bot_id)

            # Check if spam task should be launched
            if "promoter" in bot_id and self.spam_enabled.get(bot_id, False):
                self.enable_spam(bot_id)

        except Exception as e:
            err_msg = str(e).encode("ascii", errors="ignore").decode("ascii")
            if "AUTH_KEY_DUPLICATED" in err_msg:
                logging.error(f"Duplicate auth key for {bot_id}: session used elsewhere", extra={"bot_id": bot_id})
                self.status[bot_id]["last_error"] = "AUTH_KEY_DUPLICATED: Session is being used elsewhere"
            else:
                logging.error(f"Error running {bot_id}: {err_msg}", extra={"bot_id": bot_id})
                self.status[bot_id]["last_error"] = err_msg
            self.status[bot_id]["is_running"] = False

    async def start_bot(self, bot_id: str) -> dict:
        if bot_id not in self.bots:
            return {"error": "Invalid bot ID"}
        if self.status[bot_id]["is_running"]:
            return {"status": "Already running", "bot_id": bot_id}
        
        self.bots[bot_id]["task"] = asyncio.create_task(self._run_bot(bot_id))
        return {"status": "Started", "bot_id": bot_id}

    async def stop_bot(self, bot_id: str) -> dict:
        if bot_id not in self.bots:
            return {"error": "Invalid bot ID"}
        if not self.status[bot_id]["is_running"] and self.bots[bot_id]["instance"] is None:
            return {"status": "Not running", "bot_id": bot_id}

        # Cancel any background tasks for this bot
        for task_key in list(self.background_tasks.keys()):
            if task_key.startswith(bot_id):
                t = self.background_tasks.pop(task_key, None)
                if t:
                    t.cancel()

        bot_info = self.bots[bot_id]
        if bot_info["instance"]:
            try:
                await bot_info["instance"].stop()
            except Exception as e:
                err_msg = str(e).encode("ascii", errors="ignore").decode("ascii")
                logging.error(f"Error stopping {bot_id}: {err_msg}", extra={"bot_id": bot_id})
        
        if bot_info["task"]:
            bot_info["task"].cancel()
        
        self.status[bot_id]["is_running"] = False
        bot_info["instance"] = None
        bot_info["task"] = None
        logging.info(f"{bot_id} stopped", extra={"bot_id": bot_id})
        return {"status": "Stopped", "bot_id": bot_id}

    async def restart_bot(self, bot_id: str) -> dict:
        await self.stop_bot(bot_id)
        await asyncio.sleep(2)
        return await self.start_bot(bot_id)

    def get_bot_status(self, bot_id: str) -> dict:
        if bot_id not in self.status:
            return {"error": "Invalid bot ID"}
        # Update dynamic fields
        inst = self.bots[bot_id].get("instance")
        if inst is not None:
            self.status[bot_id]["is_running"] = bool(getattr(inst, "is_connected", False))
        return self.status[bot_id]

    def get_all_statuses(self) -> dict:
        for bot_id in self.bots:
            self.get_bot_status(bot_id)
        return self.status

    async def start_all(self):
        # Default bots started by main.py plus backup_forwarder for real-time channel routing
        default_bots = [b for b in ["movie_forwarder", "terabox_modifier", "backup_forwarder"] if b in self.bots]
        for bot_id in default_bots:
            await self.start_bot(bot_id)
            await asyncio.sleep(2)

    async def stop_all(self):
        for bot_id in self.bots:
            if self.status[bot_id]["is_running"] or self.bots[bot_id]["instance"] is not None:
                await self.stop_bot(bot_id)

    def enable_spam(self, bot_id: str):
        if bot_id in self.spam_enabled:
            self.spam_enabled[bot_id] = True
            self.status[bot_id]["spam_enabled"] = True
            try:
                from main import spam_groups
                instance = self.bots[bot_id]["instance"]
                if instance and getattr(instance, "is_connected", False):
                    # spam_groups requires (bot, bot_name)
                    task_name = f"{bot_id}_spam"
                    if task_name in self.background_tasks:
                        self.background_tasks[task_name].cancel()
                    self.background_tasks[task_name] = asyncio.create_task(spam_groups(instance, bot_id))
                    logging.info(f"Enabled spam loop for {bot_id}", extra={"bot_id": bot_id})
                    return {"status": "Spam task started", "bot_id": bot_id}
                else:
                    return {"status": "Spam enabled (bot not currently connected)", "bot_id": bot_id}
            except Exception as e:
                return {"error": str(e)}
        return {"error": "Bot does not support spam"}

    def disable_spam(self, bot_id: str):
        if bot_id in self.spam_enabled:
            self.spam_enabled[bot_id] = False
            self.status[bot_id]["spam_enabled"] = False
            task = self.background_tasks.pop(f"{bot_id}_spam", None)
            if task:
                task.cancel()
            logging.info(f"Disabled spam loop for {bot_id}", extra={"bot_id": bot_id})
            return {"status": "Spam task disabled", "bot_id": bot_id}
        return {"error": "Bot does not support spam"}

    def enable_promote(self, bot_id: str):
        if bot_id in self.promote_enabled:
            self.promote_enabled[bot_id] = True
            self.status[bot_id]["promote_enabled"] = True
            try:
                from main import promote_ganeshmrxx
                instance = self.bots[bot_id]["instance"]
                if instance and getattr(instance, "is_connected", False):
                    task_name = f"{bot_id}_promote"
                    if task_name in self.background_tasks:
                        self.background_tasks[task_name].cancel()
                    self.background_tasks[task_name] = asyncio.create_task(promote_ganeshmrxx(instance, bot_id))
                    return {"status": "Promote task started", "bot_id": bot_id}
                else:
                    return {"status": "Promote enabled (bot not currently connected)", "bot_id": bot_id}
            except Exception as e:
                return {"error": str(e)}
        return {"error": "Bot does not support admin promotion"}

    def disable_promote(self, bot_id: str):
        if bot_id in self.promote_enabled:
            self.promote_enabled[bot_id] = False
            self.status[bot_id]["promote_enabled"] = False
            task = self.background_tasks.pop(f"{bot_id}_promote", None)
            if task:
                task.cancel()
            return {"status": "Promote disabled", "bot_id": bot_id}
        return {"error": "Bot does not support admin promotion"}

    # Bulk Forwarding Job Management
    async def start_bulk_forward_job(self, source_id: int, target_id: int, from_msg_id: int = 0, to_msg_id: int = 0) -> dict:
        job_id = str(uuid.uuid4())[:8]
        job_info = {
            "job_id": job_id,
            "source_id": source_id,
            "target_id": target_id,
            "from_msg_id": from_msg_id,
            "to_msg_id": to_msg_id,
            "status": "running",
            "processed": 0,
            "total": 0,
            "skipped": 0,
            "failed": 0,
            "current_msg_id": from_msg_id,
            "started_at": datetime.now().isoformat(),
            "last_activity": datetime.now().isoformat(),
            "error": None
        }
        self.forward_jobs[job_id] = job_info

        # Run background copy task
        asyncio.create_task(self._execute_bulk_forward(job_id, source_id, target_id, from_msg_id, to_msg_id))
        return job_info

    async def _execute_bulk_forward(self, job_id: str, source_id: int, target_id: int, from_msg_id: int, to_msg_id: int):
        job = self.forward_jobs[job_id]
        # Use backup_forwarder instance if connected, else promoter or movie forwarder
        client = None
        for b_id in ["backup_forwarder", "promoter_1", "promoter_2", "movie_forwarder"]:
            inst = self.bots[b_id].get("instance")
            if inst and getattr(inst, "is_connected", False):
                client = inst
                break

        if client is None:
            # Need to start backup_forwarder temporarily or fail
            res = await self.start_bot("backup_forwarder")
            await asyncio.sleep(3)
            client = self.bots["backup_forwarder"].get("instance")
            if client is None or not getattr(client, "is_connected", False):
                job["status"] = "failed"
                job["error"] = "No connected client available to execute forward job"
                return

        try:
            from plugins_backup_forwarder.debug import copy_all_media
            # Alternatively run direct history iteration
            async for msg in client.get_chat_history(source_id, offset_id=from_msg_id if from_msg_id > 0 else 0):
                if job["status"] == "stopped":
                    break
                
                job["last_activity"] = datetime.now().isoformat()
                job["current_msg_id"] = msg.id

                if to_msg_id > 0 and msg.id > to_msg_id:
                    continue

                if msg.video or msg.photo or msg.document:
                    try:
                        await msg.copy(chat_id=target_id)
                        job["processed"] += 1
                        await asyncio.sleep(1.5)  # Safe delay to prevent FloodWait
                    except Exception as copy_err:
                        job["failed"] += 1
                        err_str = str(copy_err).encode("ascii", errors="ignore").decode("ascii")
                        if "FloodWait" in err_str:
                            await asyncio.sleep(15)
                else:
                    job["skipped"] += 1

            if job["status"] != "stopped":
                job["status"] = "completed"
        except Exception as e:
            job["status"] = "failed"
            job["error"] = str(e).encode("ascii", errors="ignore").decode("ascii")

    def stop_bulk_forward_job(self, job_id: str) -> dict:
        if job_id in self.forward_jobs:
            self.forward_jobs[job_id]["status"] = "stopped"
            return {"status": "Job stopped", "job_id": job_id}
        return {"error": "Job not found"}

    async def get_telegram_dialogs(self, bot_id: str = "backup_forwarder", force_refresh: bool = False, db_b = None) -> list:
        cache_has_live = bool(self.dialogs_cache and any(d.get("is_live", False) for d in self.dialogs_cache))
        if not force_refresh and cache_has_live and (time.time() - self.dialogs_cache_time < 300):
            if db_b is not None:
                self._enrich_dialogs_with_db(self.dialogs_cache, db_b)
            return self.dialogs_cache

        client = None
        candidates = [cid for cid in [bot_id, "backup_forwarder", "movie_forwarder"] if cid in self.bots]
        for candidate_id in candidates:
            bot_entry = self.bots.get(candidate_id)
            if bot_entry:
                inst = bot_entry.get("instance")
                if inst and getattr(inst, "is_connected", False):
                    client = inst
                    break

        if client is None and "backup_forwarder" in self.bots:
            await self.start_bot("backup_forwarder")
            await asyncio.sleep(2)
            bot_entry = self.bots.get("backup_forwarder")
            if bot_entry:
                inst = bot_entry.get("instance")
                if inst and getattr(inst, "is_connected", False):
                    client = inst

        dialogs = []
        if client and getattr(client, "is_connected", False):
            try:
                from pyrogram.enums import ChatType
                
                # Fetch Telegram folders (dialog filters) to determine target channel
                folder_5_channels = set()  # videoDB -> DBXVideos (-1004401442087)
                folder_6_channels = set()  # TeraDB -> DBXTera (-1004337870091)
                try:
                    filters = await client.invoke(GetDialogFilters())
                    for f in filters:
                        fid = getattr(f, 'id', None)
                        if fid in [5, 6]:
                            for p in getattr(f, 'include_peers', []):
                                cid = getattr(p, 'channel_id', getattr(p, 'chat_id', None))
                                if cid:
                                    clean_cid = int(str(cid).replace("-100", "").replace("-", ""))
                                    full_cid = int(f"-100{clean_cid}")
                                    if fid == 5:
                                        folder_5_channels.add(full_cid)
                                        folder_5_channels.add(clean_cid)
                                    elif fid == 6:
                                        folder_6_channels.add(full_cid)
                                        folder_6_channels.add(clean_cid)
                except Exception as fe:
                    logging.warning(f"Could not fetch dialog filters: {fe}")

                raw_dialogs = []
                async for d in client.get_dialogs(limit=200):
                    chat = d.chat
                    if chat.type not in [ChatType.CHANNEL, ChatType.SUPERGROUP, ChatType.GROUP]:
                        continue
                    raw_dialogs.append(d)

                for d in raw_dialogs:
                    chat = d.chat
                    title = str(chat.title or "Untitled").encode("ascii", errors="ignore").decode("ascii").strip()
                    if not title:
                        title = f"Chat {chat.id}"
                    
                    is_creator = bool(getattr(chat, "is_creator", False))
                    admin_rights = getattr(chat, "admin_rights", None)
                    is_admin = is_creator or (admin_rights is not None)
                    can_post = is_creator or (admin_rights is not None and getattr(admin_rights, "can_post_messages", True))
                    type_str = "channel" if chat.type == ChatType.CHANNEL else "group"
                    
                    clean_id = int(str(chat.id).replace("-100", "").replace("-", ""))
                    if chat.id in folder_5_channels or clean_id in folder_5_channels:
                        folder_id = 5
                        folder_name = "videoDB"
                        target_id = -1004401442087
                        target_name = "DBXVideos"
                        is_mapped = True
                    elif chat.id in folder_6_channels or clean_id in folder_6_channels:
                        folder_id = 6
                        folder_name = "TeraDB"
                        target_id = -1004337870091
                        target_name = "DBXTera"
                        is_mapped = True
                    else:
                        folder_id = None
                        folder_name = None
                        target_id = None
                        target_name = None
                        is_mapped = False

                    dialogs.append({
                        "id": chat.id,
                        "title": title,
                        "username": getattr(chat, "username", None),
                        "type": type_str,
                        "is_creator": is_creator,
                        "is_admin": is_admin,
                        "can_post": can_post,
                        "members_count": getattr(chat, "members_count", None),
                        "folder_id": folder_id,
                        "folder_name": folder_name,
                        "is_mapped": is_mapped,
                        "target_id": target_id,
                        "target_name": target_name,
                        "is_live": True,
                        "live_status": "active"
                    })

            except Exception as e:
                logging.error(f"Error fetching telegram dialogs: {e}")

        if any(d.get("is_live", False) for d in dialogs):
            self.dialogs_cache = dialogs
            self.dialogs_cache_time = time.time()

        return dialogs

    def _enrich_dialogs_with_db(self, dialogs: list, db_b):
        try:
            mappings = list(db_b.xDataChannels.find({}))
            mapped_map = {}
            for m in mappings:
                src = m.get("_id")
                try:
                    src_int = int(src)
                except Exception:
                    src_int = src
                mapped_map[src_int] = m

            existing_ids = set()
            for d in dialogs:
                existing_ids.add(d["id"])
                if d["id"] in mapped_map:
                    m = mapped_map[d["id"]]
                    d["is_mapped"] = True
                    d["target_id"] = m.get("target")
                    d["target_name"] = m.get("target_name")

            for src_id, m in mapped_map.items():
                if src_id not in existing_ids:
                    dialogs.append({
                        "id": src_id if isinstance(src_id, int) else int(src_id) if str(src_id).lstrip("-").isdigit() else src_id,
                        "title": m.get("source_name") or f"Chat {src_id}",
                        "username": None,
                        "type": "channel",
                        "is_creator": False,
                        "is_admin": False,
                        "can_post": False,
                        "members_count": None,
                        "is_mapped": True,
                        "target_id": m.get("target"),
                        "target_name": m.get("target_name"),
                        "is_live": False,
                        "live_status": "dead"
                    })
        except Exception as e:
            logging.error(f"Error enriching dialogs with DB: {e}")

    async def clean_dead_channels(self, db_b = None) -> dict:
        if db_b is None:
            return {"error": "Database not connected"}
        
        dialogs = await self.get_telegram_dialogs(force_refresh=True, db_b=db_b)
        live_ids = {d["id"] for d in dialogs if d.get("is_live", True)}
        live_str_ids = {str(d["id"]) for d in dialogs if d.get("is_live", True)}

        if not live_ids:
            return {
                "success": False,
                "error": "No live Telegram channels detected. Please ensure userbot is connected before cleaning dead channels.",
                "deleted_count": 0
            }

        mappings = list(db_b.xDataChannels.find({}))
        dead_ids = []
        for m in mappings:
            src = m.get("_id")
            try:
                src_int = int(src)
            except Exception:
                src_int = src
            if src not in live_ids and src not in live_str_ids and src_int not in live_ids:
                dead_ids.append(src)

        deleted_count = 0
        for d_id in dead_ids:
            res = db_b.xDataChannels.delete_one({"_id": d_id})
            deleted_count += res.deleted_count

        self.dialogs_cache = []
        self.dialogs_cache_time = 0

        return {
            "success": True,
            "deleted_count": deleted_count,
            "remaining_live": len(mappings) - deleted_count
        }

    async def set_channel_mapping(self, source_id: int, source_name: str, target_id: int, target_name: str, forward_history: bool = True, db_b = None) -> dict:
        if db_b is None:
            return {"error": "Database not connected"}
        
        doc = {
            "_id": source_id,
            "source_name": source_name,
            "target": target_id,
            "target_name": target_name,
            "updated_at": datetime.now().isoformat()
        }
        db_b.xDataChannels.update_one({"_id": source_id}, {"$set": doc}, upsert=True)
        # Invalidate dialogs cache so UI reflects immediately
        self.dialogs_cache = []
        self.dialogs_cache_time = 0

        # Ensure backup_forwarder is running for live incoming messages
        if not self.status["backup_forwarder"]["is_running"]:
            asyncio.create_task(self.start_bot("backup_forwarder"))

        job_info = None
        if forward_history:
            job_info = await self.start_bulk_forward_job(source_id=source_id, target_id=target_id)

        return {
            "success": True,
            "mapping": {
                "source_id": source_id,
                "source_name": source_name,
                "target_id": target_id,
                "target_name": target_name
            },
            "job": job_info
        }

    async def add_channel_to_folder(self, folder_id: int, chat_id: int) -> dict:
        bot_entry = self.bots.get("backup_forwarder")
        client = bot_entry.get("instance") if bot_entry else None
        if not client or not getattr(client, "is_connected", False):
            return {"success": False, "error": "Backup Forwarder userbot is not connected"}

        try:
            filters = await client.invoke(GetDialogFilters())
            target_filter = None
            for f in filters:
                if getattr(f, "id", None) == folder_id:
                    target_filter = f
                    break

            if not target_filter:
                return {"success": False, "error": f"Folder ID {folder_id} not found in Telegram"}

            peer = await client.resolve_peer(chat_id)
            include_peers = list(getattr(target_filter, "include_peers", []))
            clean_target = int(str(chat_id).replace("-100", "").replace("-", ""))

            already_there = False
            for p in include_peers:
                cid = getattr(p, "channel_id", getattr(p, "chat_id", None))
                if cid and cid == clean_target:
                    already_there = True
                    break

            if not already_there:
                include_peers.append(peer)
                target_filter.include_peers = include_peers
                await client.invoke(UpdateDialogFilter(id=folder_id, filter=target_filter))

            self.dialogs_cache = None
            self.dialogs_cache_time = 0
            return {"success": True, "chat_id": chat_id, "folder_id": folder_id}
        except Exception as e:
            err = str(e).encode("ascii", errors="ignore").decode("ascii")
            return {"success": False, "error": err}

    async def remove_channel_from_folder(self, folder_id: int, chat_id: int) -> dict:
        bot_entry = self.bots.get("backup_forwarder")
        client = bot_entry.get("instance") if bot_entry else None
        if not client or not getattr(client, "is_connected", False):
            return {"success": False, "error": "Backup Forwarder userbot is not connected"}

        try:
            filters = await client.invoke(GetDialogFilters())
            target_filter = None
            for f in filters:
                if getattr(f, "id", None) == folder_id:
                    target_filter = f
                    break

            if not target_filter:
                return {"success": False, "error": f"Folder ID {folder_id} not found in Telegram"}

            clean_target = int(str(chat_id).replace("-100", "").replace("-", ""))
            def peer_matches(peer) -> bool:
                cid = getattr(peer, "channel_id", getattr(peer, "chat_id", getattr(peer, "user_id", None)))
                return cid == clean_target or cid == chat_id

            orig_include = getattr(target_filter, "include_peers", [])
            new_include = [p for p in orig_include if not peer_matches(p)]
            orig_pinned = getattr(target_filter, "pinned_peers", [])
            new_pinned = [p for p in orig_pinned if not peer_matches(p)]

            target_filter.include_peers = new_include
            target_filter.pinned_peers = new_pinned
            await client.invoke(UpdateDialogFilter(id=folder_id, filter=target_filter))

            self.dialogs_cache = None
            self.dialogs_cache_time = 0
            return {"success": True, "chat_id": chat_id, "folder_id": folder_id}
        except Exception as e:
            err = str(e).encode("ascii", errors="ignore").decode("ascii")
            return {"success": False, "error": err}

    async def clear_all_legacy_mappings(self, db_b = None) -> dict:
        deleted = 0
        if db_b is not None:
            res = db_b.xDataChannels.delete_many({})
            deleted = res.deleted_count
        self.dialogs_cache = None
        self.dialogs_cache_time = 0
        return {"success": True, "deleted_count": deleted}

    async def setup_telegram_folders(self) -> dict:
        bot_entry = self.bots.get("backup_forwarder")
        client = bot_entry.get("instance") if bot_entry else None
        if not client or not getattr(client, "is_connected", False):
            if "backup_forwarder" in self.bots:
                await self.start_bot("backup_forwarder")
                await asyncio.sleep(2)
                bot_entry = self.bots.get("backup_forwarder")
                client = bot_entry.get("instance") if bot_entry else None
            if not client:
                return {"error": "BackupForwarderBot is not running or failed to connect"}

        terabox_regex = re.compile(r"(terabox|1024tera|nephobox|4funbox|mirrobox|momerybox)", re.IGNORECASE)

        target_hub = []
        restricted_video = []
        restricted_terabox = []
        terabox_links = []
        videos_db = []

        async for dialog in client.get_dialogs():
            chat = dialog.chat
            if chat.type.name not in ("CHANNEL", "SUPERGROUP"):
                continue

            is_owner = getattr(chat, 'is_creator', False)
            is_target = is_owner or (chat.title and (chat.title.startswith("DB") or chat.title.startswith("XDB")))

            if is_target:
                target_hub.append(chat)
                continue

            is_protected = getattr(chat, "has_protected_content", False)
            has_terabox = bool(terabox_regex.search(chat.title or ""))

            if is_protected:
                if has_terabox:
                    restricted_terabox.append(chat)
                else:
                    restricted_video.append(chat)
            else:
                if has_terabox:
                    terabox_links.append(chat)
                else:
                    videos_db.append(chat)

        videos_db1 = videos_db[:100]
        videos_db2 = videos_db[100:200]

        folders_to_setup = [
            {"id": 4, "title": "🎯 Target Hub", "emoticon": "🎯", "chats": target_hub},
            {"id": 5, "title": "🎥 Videos DB1", "emoticon": "🎬", "chats": videos_db1},
            {"id": 9, "title": "🎥 Videos DB2", "emoticon": "🎬", "chats": videos_db2},
            {"id": 6, "title": "📦 TeraBox", "emoticon": "📦", "chats": terabox_links if terabox_links else restricted_terabox[:2]},
            {"id": 7, "title": "🔒 R-Videos", "emoticon": "🔒", "chats": restricted_video},
            {"id": 8, "title": "🔒 R-TeraBox", "emoticon": "📁", "chats": restricted_terabox if restricted_terabox else restricted_video[:2]},
        ]

        results = []
        for folder in folders_to_setup:
            fid = folder["id"]
            title = folder["title"]
            emoticon = folder["emoticon"]
            chats = folder["chats"]

            if not chats:
                continue

            include_peers = []
            for c in chats:
                try:
                    peer = await client.resolve_peer(c.id)
                    include_peers.append(peer)
                except Exception as e:
                    logging.warning(f"Error resolving peer {c.id} for folder {title}: {e}")

            dialog_filter = DialogFilter(
                id=fid,
                title=title,
                emoticon=emoticon,
                pinned_peers=[],
                include_peers=include_peers,
                exclude_peers=[],
                exclude_muted=False,
                exclude_read=False,
                exclude_archived=False
            )

            try:
                res = await client.invoke(UpdateDialogFilter(id=fid, filter=dialog_filter))
                results.append({"id": fid, "title": title, "count": len(include_peers), "success": bool(res)})
            except Exception as e:
                err = str(e).encode("ascii", errors="ignore").decode("ascii")
                results.append({"id": fid, "title": title, "count": len(include_peers), "error": err})

        return {
            "success": True,
            "folders": results
        }

