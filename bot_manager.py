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
from PromotionSpamBot1 import PromotionSpamBot1
from PromotionSpamBot2 import PromotionSpamBot2
from BackupForwarderBot import BackupForwarderBot
from GeneralDataModifierBot import GeneralDataModifierBot

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
        "promoter_1": {
            "name": "Promoter Bot 1",
            "class": PromotionSpamBot1,
            "session_type": "userbot",
            "description": "DM conversion funnel & periodic group broadcasting"
        },
        "promoter_2": {
            "name": "Promoter Bot 2",
            "class": PromotionSpamBot2,
            "session_type": "userbot",
            "description": "DM conversion funnel & periodic group broadcasting (replica)"
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

        self.spam_enabled = {"promoter_1": False, "promoter_2": False}
        self.promote_enabled = {"promoter_1": True, "promoter_2": True}
        self.background_tasks = {}
        self.forward_jobs = {}  # In-memory tracking for active bulk forward jobs
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
        # Default bots started by main.py
        default_bots = ["movie_forwarder", "terabox_modifier", "promoter_1", "promoter_2"]
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
