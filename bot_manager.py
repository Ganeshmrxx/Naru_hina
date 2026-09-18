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
        self.folder_sync_status = {}  # chat_id -> {"status": "syncing"|"completed"|"queued", "processed": int}
        self.dialogs_cache = []
        self.dialogs_cache_time = 0
        self.db_a = None
        self.db_b = None
        self._heartbeat_task = None
        self._auto_folder_sync_task = None
        self._forward_lock = asyncio.Lock()
        self.worker_bots = []
        self.worker_bots_initialized = False
        self.worker_bot_idx = 0
        self.worker_bot_counter = 0

    async def _init_worker_bots_if_needed(self):
        """Initializes worker bots pool on-demand for public channel copying."""
        if self.worker_bots_initialized:
            return
        try:
            from config import Config
            from pyrogram import Client
            logging.info(f"[WORKER POOL] Initializing {len(Config.BOT_WORKERS)} Worker Bots...")
            for idx, token in enumerate(Config.BOT_WORKERS):
                try:
                    wb = Client(
                        f"botmgr_worker_{idx+1}",
                        api_id=Config.API_ID2,
                        api_hash=Config.API_HASH2,
                        bot_token=token,
                        in_memory=True
                    )
                    await wb.start()
                    self.worker_bots.append(wb)
                except Exception as e:
                    logging.warning(f"[WORKER POOL] Worker bot {idx+1} start failed: {e}")
            self.worker_bots_initialized = True
            logging.info(f"[WORKER POOL] Ready with {len(self.worker_bots)} active worker bots.")
        except Exception as e:
            logging.error(f"[WORKER POOL] Initialization error: {e}")

    def _get_next_worker_bot(self):
        """Rotates through worker bots pool, switching bot every 10 messages."""
        if not getattr(self, "worker_bots", []):
            return None
        bot = self.worker_bots[self.worker_bot_idx]
        self.worker_bot_counter += 1
        if self.worker_bot_counter >= 10:
            self.worker_bot_counter = 0
            self.worker_bot_idx = (self.worker_bot_idx + 1) % len(self.worker_bots)
        return bot

    def set_databases(self, db_a, db_b):
        self.db_a = db_a
        self.db_b = db_b

    def start_auto_folder_sync(self):
        if self._auto_folder_sync_task is None:
            self._auto_folder_sync_task = asyncio.create_task(self._auto_folder_sync_runner())

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
        job["status"] = "queued"
        self.folder_sync_status[source_id] = {
            "status": "queued",
            "processed": 0,
            "target_id": target_id,
            "job_id": job_id
        }

        # Acquire lock so only ONE channel's past messages are copied at a time
        async with self._forward_lock:
            job["status"] = "running"
            self.folder_sync_status[source_id]["status"] = "syncing"

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
                    self.folder_sync_status[source_id] = {"status": "failed", "error": job["error"]}
                    return

            # Determine if source channel is Public (has username) or Private
            is_public = False
            source_username = None
            try:
                c_info = await client.get_chat(source_id)
                source_username = getattr(c_info, "username", None)
                if source_username:
                    is_public = True
            except Exception as ce:
                logging.warning(f"[BULK FORWARD] Could not determine username for {source_id}: {ce}")

            if is_public:
                await self._init_worker_bots_if_needed()
                logging.info(f"[BULK FORWARD] Channel {source_id} (@{source_username}) is PUBLIC -> Using 12 Worker Bots pool (rotating every 10 msgs).")
            else:
                logging.info(f"[BULK FORWARD] Channel {source_id} is PRIVATE -> Using Userbot (backup_forwarder).")

            try:
                async for msg in client.get_chat_history(source_id, offset_id=from_msg_id if from_msg_id > 0 else 0):
                    if job["status"] == "stopped":
                        break
                    
                    job["last_activity"] = datetime.now().isoformat()
                    job["current_msg_id"] = msg.id

                    if to_msg_id > 0 and msg.id > to_msg_id:
                        continue

                    # Rule: Single photos are skipped (only videos or album media groups copied)
                    if msg.photo and not getattr(msg, "media_group_id", None):
                        job["skipped"] += 1
                        continue

                    if msg.video or msg.document or (msg.photo and getattr(msg, "media_group_id", None)):
                        file_id = None
                        if msg.video:
                            file_id = getattr(msg.video, 'file_unique_id', None)
                        elif msg.photo:
                            file_id = getattr(msg.photo, 'file_unique_id', None)
                        elif msg.document:
                            file_id = getattr(msg.document, 'file_unique_id', None)

                        # Check duplicate in Cluster B xData
                        if file_id and self.db_b is not None:
                            try:
                                if self.db_b["xData"].find_one({"_id": file_id}):
                                    job["skipped"] += 1
                                    continue
                            except Exception:
                                pass

                        try:
                            copied_msg = None
                            if is_public and self.worker_bots:
                                worker_bot = self._get_next_worker_bot()
                                try:
                                    copied_msg = await worker_bot.copy_message(
                                        chat_id=target_id,
                                        from_chat_id=source_username,
                                        message_id=msg.id
                                    )
                                except Exception as wb_err:
                                    logging.warning(f"[WORKER ERR] Worker copy failed ({wb_err}), fallback to Userbot...")
                                    copied_msg = await client.copy_message(
                                        chat_id=target_id,
                                        from_chat_id=source_id,
                                        message_id=msg.id
                                    )
                            else:
                                copied_msg = await client.copy_message(
                                    chat_id=target_id,
                                    from_chat_id=source_id,
                                    message_id=msg.id
                                )

                            job["processed"] += 1
                            self.folder_sync_status[source_id]["processed"] = job["processed"]

                            if file_id and self.db_b is not None:
                                try:
                                    self.db_b["xData"].insert_one({
                                        "_id": file_id,
                                        "channel_id": target_id,
                                        "source_id": source_id,
                                        "message_id": getattr(copied_msg, "id", None),
                                        "copied_at": datetime.now().isoformat()
                                    })
                                except Exception:
                                    pass

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
                    self.folder_sync_status[source_id] = {
                        "status": "completed",
                        "processed": job["processed"],
                        "completed_at": datetime.now().isoformat()
                    }
                    if self.db_a is not None:
                        try:
                            self.db_a.forward_progress.update_one(
                                {"chat_id": source_id},
                                {"$set": {
                                    "chat_id": source_id,
                                    "status": "completed",
                                    "total_copied": job["processed"],
                                    "target_id": target_id,
                                    "updated_at": datetime.now()
                                }},
                                upsert=True
                            )
                        except Exception:
                            pass
            except Exception as e:
                job["status"] = "failed"
                job["error"] = str(e).encode("ascii", errors="ignore").decode("ascii")
                self.folder_sync_status[source_id] = {"status": "failed", "error": job["error"]}

    async def _auto_folder_sync_runner(self):
        """Background worker: Automatically syncs past media from all channels in videoDB & TeraDB."""
        logging.info("[AUTO SYNC] Folder auto-sync worker started.")
        await asyncio.sleep(20)  # Wait for startup
        while True:
            try:
                # Check if a bulk forward job is already currently running or queued
                any_running = any(j.get("status") in ["running", "queued"] for j in self.forward_jobs.values())
                if not any_running:
                    client = self.bots["backup_forwarder"].get("instance")
                    if client and getattr(client, "is_connected", False):
                        from pyrogram.raw.functions.messages import GetDialogFilters
                        filters = await client.invoke(GetDialogFilters())
                        folder_targets = {
                            5: (-1004401442087, "videoDB"),
                            6: (-1004337870091, "TeraDB")
                        }

                        channels_to_sync = []
                        for f in filters:
                            fid = getattr(f, "id", None)
                            ftitle = str(getattr(f, "title", "")).lower()
                            t_info = folder_targets.get(fid)
                            if not t_info:
                                if "video" in ftitle and "db" in ftitle:
                                    t_info = (-1004401442087, "videoDB")
                                elif "tera" in ftitle and "db" in ftitle:
                                    t_info = (-1004337870091, "TeraDB")

                            if t_info:
                                tid, fname = t_info
                                for p in getattr(f, "include_peers", []):
                                    cid = getattr(p, "channel_id", getattr(p, "chat_id", None))
                                    if cid:
                                        clean_cid = int(str(cid).replace("-100", "").replace("-", ""))
                                        full_cid = int(f"-100{clean_cid}")

                                        # Check if already completed in folder_sync_status or DB
                                        sync_state = self.folder_sync_status.get(full_cid, {})
                                        if sync_state.get("status") != "completed":
                                            is_db_done = False
                                            if self.db_a is not None:
                                                try:
                                                    doc = self.db_a.forward_progress.find_one({"chat_id": full_cid})
                                                    if doc and doc.get("status") == "completed":
                                                        is_db_done = True
                                                        self.folder_sync_status[full_cid] = {
                                                            "status": "completed",
                                                            "processed": doc.get("total_copied", 0)
                                                        }
                                                except Exception:
                                                    pass

                                            if not is_db_done:
                                                channels_to_sync.append((full_cid, tid, fname))

                        if channels_to_sync:
                            next_cid, next_tid, next_fname = channels_to_sync[0]
                            logging.info(f"[AUTO SYNC] Auto-launching past media sync for {next_fname} channel {next_cid} -> {next_tid}")
                            await self.start_bulk_forward_job(source_id=next_cid, target_id=next_tid)

            except Exception as e:
                logging.error(f"[AUTO SYNC] Runner error: {e}")

            await asyncio.sleep(40)  # Re-check queue every 40s

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
                folder_4_channels = set()  # public hub
                try:
                    filters = await client.invoke(GetDialogFilters())
                    for f in filters:
                        fid = getattr(f, 'id', None)
                        ftitle = str(getattr(f, 'title', '')).lower()
                        target_set = None
                        if fid == 5 or ('video' in ftitle and 'db' in ftitle):
                            target_set = folder_5_channels
                        elif fid == 6 or ('tera' in ftitle and 'db' in ftitle):
                            target_set = folder_6_channels
                        elif fid == 4 or 'target' in ftitle or 'public' in ftitle or 'hub' in ftitle:
                            target_set = folder_4_channels

                        if target_set is not None:
                            for p in getattr(f, 'include_peers', []):
                                cid = getattr(p, 'channel_id', getattr(p, 'chat_id', None))
                                if cid:
                                    clean_cid = int(str(cid).replace("-100", "").replace("-", ""))
                                    full_cid = int(f"-100{clean_cid}")
                                    target_set.add(full_cid)
                                    target_set.add(clean_cid)
                except Exception as fe:
                    logging.warning(f"Could not fetch dialog filters: {fe}")

                raw_dialogs = []
                async for d in client.get_dialogs():
                    chat = d.chat
                    if chat.type not in [ChatType.CHANNEL, ChatType.SUPERGROUP, ChatType.GROUP]:
                        continue
                    raw_dialogs.append(d)

                seen_cids = set()
                for d in raw_dialogs:
                    chat = d.chat
                    seen_cids.add(chat.id)
                    title = str(chat.title or "").strip()
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
                    elif chat.id in folder_4_channels or clean_id in folder_4_channels:
                        folder_id = 4
                        folder_name = "TARGEThub"
                        target_id = None
                        target_name = "TARGEThub"
                        is_mapped = True
                    else:
                        folder_id = None
                        folder_name = None
                        target_id = None
                        target_name = None
                        is_mapped = False

                    sync_state = self.folder_sync_status.get(chat.id, {})
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
                        "live_status": "active",
                        "sync_status": sync_state.get("status", "idle"),
                        "sync_processed": sync_state.get("processed", 0)
                    })

                # Guarantee all folder channels are included even if not in dialogs (e.g. archived)
                all_folder_channels = list(folder_5_channels | folder_6_channels | folder_4_channels)
                for f_cid in all_folder_channels:
                    if f_cid < 0 and f_cid not in seen_cids:
                        try:
                            chat = await client.get_chat(f_cid)
                            if chat:
                                clean_id = int(str(chat.id).replace("-100", "").replace("-", ""))
                                if chat.id in folder_5_channels or clean_id in folder_5_channels:
                                    fid, fname, tid, tname = 5, "videoDB", -1004401442087, "DBXVideos"
                                elif chat.id in folder_6_channels or clean_id in folder_6_channels:
                                    fid, fname, tid, tname = 6, "TeraDB", -1004337870091, "DBXTera"
                                elif chat.id in folder_4_channels or clean_id in folder_4_channels:
                                    fid, fname, tid, tname = 4, "TARGEThub", None, "TARGEThub"
                                else:
                                    fid, fname, tid, tname = None, None, None, None

                                is_creator = bool(getattr(chat, "is_creator", False))
                                admin_rights = getattr(chat, "admin_rights", None)
                                is_admin = is_creator or (admin_rights is not None)
                                can_post = is_creator or (admin_rights is not None and getattr(admin_rights, "can_post_messages", True))
                                type_str = "channel" if chat.type == ChatType.CHANNEL else "group"
                                sync_state = self.folder_sync_status.get(chat.id, {})
                                dialogs.append({
                                    "id": chat.id,
                                    "title": str(chat.title or f"Chat {chat.id}").strip() or f"Chat {chat.id}",
                                    "username": getattr(chat, "username", None),
                                    "type": type_str,
                                    "is_creator": is_creator,
                                    "is_admin": is_admin,
                                    "can_post": can_post,
                                    "members_count": getattr(chat, "members_count", None),
                                    "folder_id": fid,
                                    "folder_name": fname,
                                    "is_mapped": fid is not None,
                                    "target_id": tid,
                                    "target_name": tname,
                                    "is_live": True,
                                    "live_status": "active",
                                    "sync_status": sync_state.get("status", "idle"),
                                    "sync_processed": sync_state.get("processed", 0)
                                })
                                seen_cids.add(chat.id)
                        except Exception:
                            pass

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

            if self.db_a is not None:
                try:
                    for d in dialogs:
                        if d.get("sync_status") != "syncing":
                            p_doc = self.db_a.forward_progress.find_one({"chat_id": d["id"]})
                            if p_doc and p_doc.get("status") == "completed":
                                d["sync_status"] = "completed"
                                d["sync_processed"] = p_doc.get("total_copied", 0)
                except Exception:
                    pass

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

    async def cleanup_telegram_folders_to_three(self) -> dict:
        """Deletes all extra folders from Telegram and keeps ONLY videoDB, TeraDB, and public hub."""
        bot_entry = self.bots.get("backup_forwarder")
        client = bot_entry.get("instance") if bot_entry else None
        if not client or not getattr(client, "is_connected", False):
            if "backup_forwarder" in self.bots:
                await self.start_bot("backup_forwarder")
                await asyncio.sleep(2)
                bot_entry = self.bots.get("backup_forwarder")
                client = bot_entry.get("instance") if bot_entry else None
            if not client:
                return {"success": False, "error": "Backup Forwarder userbot is not connected"}

        try:
            filters = await client.invoke(GetDialogFilters())
            kept = []
            deleted = []

            for f in filters:
                fid = getattr(f, "id", None)
                if fid is None:
                    continue
                ftitle = str(getattr(f, "title", "")).strip().lower()

                # Allowed folders: videoDB (5), TeraDB (6), TARGEThub (4)
                is_videodb = ("video" in ftitle and "db" in ftitle) or fid == 5
                is_teradb = ("tera" in ftitle and "db" in ftitle) or fid == 6
                is_targethub = "target" in ftitle or "public" in ftitle or "hub" in ftitle or fid == 4

                if is_videodb or is_teradb or is_targethub:
                    kept.append({"id": fid, "title": getattr(f, "title", "")})
                else:
                    # Extra folder -> delete from Telegram!
                    try:
                        await client.invoke(UpdateDialogFilter(id=fid, filter=None))
                        deleted.append({"id": fid, "title": getattr(f, "title", "")})
                        logging.info(f"Deleted extra Telegram folder: {getattr(f, 'title', '')} (ID: {fid})")
                    except Exception as de:
                        logging.warning(f"Error deleting extra folder {fid}: {de}")

            # Ensure TARGEThub exists if not present
            has_targethub = any("target" in k["title"].lower() or "hub" in k["title"].lower() or k["id"] == 4 for k in kept)
            if not has_targethub:
                pub_filter = DialogFilter(
                    id=4,
                    title="TARGEThub",
                    emoticon="🎯",
                    pinned_peers=[],
                    include_peers=[],
                    exclude_peers=[],
                    exclude_muted=False,
                    exclude_read=False,
                    exclude_archived=False
                )
                try:
                    await client.invoke(UpdateDialogFilter(id=4, filter=pub_filter))
                    kept.append({"id": 4, "title": "TARGEThub"})
                except Exception as ce:
                    logging.warning(f"Error creating TARGEThub folder: {ce}")

            self.dialogs_cache = None
            self.dialogs_cache_time = 0

            return {
                "success": True,
                "kept_folders": kept,
                "deleted_folders": deleted,
                "message": f"Kept {len(kept)} folders (videoDB, TeraDB, public hub). Deleted {len(deleted)} extra folders."
            }
        except Exception as e:
            err = str(e).encode("ascii", errors="ignore").decode("ascii")
            return {"success": False, "error": err}



