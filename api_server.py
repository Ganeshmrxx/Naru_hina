import os
import asyncio

# Fix for Python 3.14 where no event loop exists in MainThread on module import
try:
    asyncio.get_event_loop()
except RuntimeError:
    asyncio.set_event_loop(asyncio.new_event_loop())

import time
import re
import urllib.parse
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple
from fastapi import FastAPI, Depends, HTTPException, status, Header, Request, Query, Response
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pymongo import MongoClient
from bot_manager import BotManager
from pyrogram import Client
from pyrogram.errors import (
    SessionPasswordNeeded,
    PhoneNumberInvalid,
    PhoneNumberBanned,
    PhoneCodeInvalid,
    PhoneCodeExpired,
    PasswordHashInvalid,
    FloodWait
)
from config import Config
import uuid
try:
    from jose import JWTError, jwt
except ImportError:
    try:
        import jwt
        from jwt.exceptions import PyJWTError as JWTError
    except ImportError:
        jwt = None
        class JWTError(Exception):
            pass
from pydantic import BaseModel
import uvicorn
try:
    from sse_starlette.sse import EventSourceResponse
except ImportError:
    EventSourceResponse = None

# Configuration
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin")
ADMIN_SECRET = os.getenv("ADMIN_SECRET", "supersecretkey123")
ALGORITHM = "HS256"

# MongoDB Configuration
MONGO_URI_A = os.getenv(
    "MONGO_URI_A",
    "mongodb+srv://g3cwork_db_user:g312345@cluster0.lpmpcya.mongodb.net/?retryWrites=true&w=majority"
)
DB_NAME_A = "Cluster0"

MONGO_URI_B = os.getenv(
    "MONGO_URI_B",
    "mongodb+srv://test:test05@cluster0.g05zxpa.mongodb.net/?retryWrites=true&w=majority"
)
DB_NAME_B = "Cluster0"

# Initialize FastAPI
app = FastAPI(title="AllForward Admin API", version="1.0.0")

# Add CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize BotManager
bot_manager = BotManager()

# Global DB clients
client_a: Optional[MongoClient] = None
client_b: Optional[MongoClient] = None
db_a = None
db_b = None

security = HTTPBearer()

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, ADMIN_SECRET, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username != ADMIN_USERNAME:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        return username
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

@app.on_event("startup")
async def startup_event():
    global client_a, client_b, db_a, db_b
    # Connect to Mongo DB Cluster A
    try:
        client_a = MongoClient(MONGO_URI_A, serverSelectionTimeoutMS=5000)
        client_a.server_info()
        db_a = client_a[DB_NAME_A]
        print("Connected to MongoDB Cluster A")
    except Exception as e:
        err_msg = str(e).encode("ascii", errors="ignore").decode("ascii")
        print(f"Error connecting to MongoDB Cluster A: {err_msg}")
        
    # Connect to Mongo DB Cluster B
    try:
        client_b = MongoClient(MONGO_URI_B, serverSelectionTimeoutMS=5000)
        client_b.server_info()
        db_b = client_b[DB_NAME_B]
        print("Connected to MongoDB Cluster B")
    except Exception as e:
        err_msg = str(e).encode("ascii", errors="ignore").decode("ascii")
        print(f"Error connecting to MongoDB Cluster B: {err_msg}")

    # Load any updated sessions from MongoDB Cluster A
    if db_a is not None:
        try:
            for s_key in ["SESSION1", "SESSION2"]:
                s_doc = db_a.bot_sessions.find_one({"_id": s_key})
                if s_doc and s_doc.get("session_string"):
                    val = s_doc["session_string"].strip()
                    os.environ[s_key] = val
                    setattr(Config, s_key, val)
                    print(f"Loaded {s_key} from MongoDB bot_sessions")
        except Exception as se:
            print(f"Error loading bot_sessions from MongoDB: {se}")

    # Start heartbeat and default bots
    bot_manager.start_heartbeat()
    await bot_manager.start_all()

@app.on_event("shutdown")
async def shutdown_event():
    await bot_manager.stop_all()
    if client_a:
        client_a.close()
    if client_b:
        client_b.close()

# --- Auth Endpoints ---
class LoginRequest(BaseModel):
    username: str
    password: str

@app.post("/api/auth/login")
def login(request: LoginRequest):
    if request.username == ADMIN_USERNAME and request.password == ADMIN_PASSWORD:
        token = jwt.encode({"sub": request.username}, ADMIN_SECRET, algorithm=ALGORITHM)
        return {"access_token": token, "token_type": "bearer"}
    raise HTTPException(status_code=401, detail="Invalid username or password")

@app.get("/api/auth/verify", dependencies=[Depends(verify_token)])
def verify():
    return {"status": "valid"}

# --- Health & System ---
@app.get("/api/health")
def health():
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "bots_running": sum(1 for s in bot_manager.status.values() if s.get("is_running")),
        "total_bots": len(bot_manager.bots),
        "cluster_a": "connected" if db_a is not None else "disconnected",
        "cluster_b": "connected" if db_b is not None else "disconnected"
    }

# --- Stats Endpoints ---
@app.get("/api/stats", dependencies=[Depends(verify_token)])
def get_stats():
    today = datetime.now().strftime("%Y-%m-%d")
    default_stats = {
        "date": today,
        "total_media": 0,
        "videos": 0,
        "photos": 0,
        "total_size": 0,
        "pending_chats": 0,
        "running_bots": sum(1 for s in bot_manager.status.values() if s.get("is_running")),
        "errors": len(bot_manager.error_buffer)
    }
    if db_a is None:
        return default_stats
    
    try:
        doc = db_a.daily_summary.find_one({"date": today}, {"_id": 0})
        if doc:
            default_stats.update(doc)
        default_stats["pending_chats"] = db_a.chats.count_documents({"status": "pending"})
    except Exception as e:
        print(f"Error querying stats: {e}")

    return default_stats

@app.get("/api/stats/history", dependencies=[Depends(verify_token)])
def get_stats_history(days: int = Query(7, ge=1, le=90)):
    if db_a is None:
        return []
    try:
        docs = list(db_a.daily_summary.find({}, {"_id": 0}).sort("date", -1).limit(days))
        return list(reversed(docs))
    except Exception as e:
        print(f"Error fetching stats history: {e}")
        return []

# --- Bot Management ---
@app.get("/api/bots", dependencies=[Depends(verify_token)])
def list_bots():
    return bot_manager.get_all_statuses()

@app.get("/api/bots/{bot_id}/status", dependencies=[Depends(verify_token)])
def bot_status(bot_id: str):
    res = bot_manager.get_bot_status(bot_id)
    if "error" in res:
        raise HTTPException(status_code=404, detail=res["error"])
    return res

@app.post("/api/bots/{bot_id}/start", dependencies=[Depends(verify_token)])
async def start_bot_endpoint(bot_id: str):
    res = await bot_manager.start_bot(bot_id)
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])
    return res

@app.post("/api/bots/{bot_id}/stop", dependencies=[Depends(verify_token)])
async def stop_bot_endpoint(bot_id: str):
    res = await bot_manager.stop_bot(bot_id)
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])
    return res

@app.post("/api/bots/{bot_id}/restart", dependencies=[Depends(verify_token)])
async def restart_bot_endpoint(bot_id: str):
    res = await bot_manager.restart_bot(bot_id)
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])
    return res

@app.get("/api/bots/{bot_id}/logs", dependencies=[Depends(verify_token)])
def get_bot_logs(bot_id: str, limit: int = 100):
    return bot_manager.get_logs(bot_id=bot_id, limit=limit)

@app.post("/api/bots/{bot_id}/spam/enable", dependencies=[Depends(verify_token)])
def enable_spam_endpoint(bot_id: str):
    res = bot_manager.enable_spam(bot_id)
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])
    return res

@app.post("/api/bots/{bot_id}/spam/disable", dependencies=[Depends(verify_token)])
def disable_spam_endpoint(bot_id: str):
    res = bot_manager.disable_spam(bot_id)
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])
    return res

@app.post("/api/bots/{bot_id}/promote/enable", dependencies=[Depends(verify_token)])
def enable_promote_endpoint(bot_id: str):
    res = bot_manager.enable_promote(bot_id)
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])
    return res

@app.post("/api/bots/{bot_id}/promote/disable", dependencies=[Depends(verify_token)])
def disable_promote_endpoint(bot_id: str):
    res = bot_manager.disable_promote(bot_id)
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])
    return res

# --- Forwarding Chats (Cluster A - chats collection) ---
class ChatStatusUpdate(BaseModel):
    status: str

class ChatCreateRequest(BaseModel):
    chat_id: int
    title: str
    type: str = "channel"
    status: str = "pending"

@app.get("/api/forwarding/chats", dependencies=[Depends(verify_token)])
def get_forwarding_chats(status: Optional[str] = None):
    if db_a is None:
        return []
    query = {}
    if status and status != "all":
        query["status"] = status
    docs = list(db_a.chats.find(query, {"_id": 0}))
    return docs

@app.post("/api/forwarding/chats", dependencies=[Depends(verify_token)])
def add_forwarding_chat(req: ChatCreateRequest):
    if db_a is None:
        raise HTTPException(status_code=500, detail="Cluster A not connected")
    db_a.chats.update_one(
        {"chat_id": req.chat_id},
        {"$set": {
            "chat_id": req.chat_id,
            "title": req.title,
            "type": req.type,
            "status": req.status,
            "last_scan": None,
            "added_by": "admin_ui"
        }},
        upsert=True
    )
    return {"status": "created", "chat_id": req.chat_id}

@app.post("/api/forwarding/chats/{chat_id}/status", dependencies=[Depends(verify_token)])
def update_chat_status(chat_id: int, req: ChatStatusUpdate):
    if db_a is None:
        raise HTTPException(status_code=500, detail="Cluster A not connected")
    result = db_a.chats.update_one({"chat_id": chat_id}, {"$set": {"status": req.status}})
    if result.matched_count == 0:
        # Also try string format
        db_a.chats.update_one({"chat_id": str(chat_id)}, {"$set": {"status": req.status}})
    return {"status": "updated", "chat_id": chat_id, "new_status": req.status}

@app.delete("/api/forwarding/chats/{chat_id}", dependencies=[Depends(verify_token)])
def delete_chat(chat_id: int):
    if db_a is None:
        raise HTTPException(status_code=500, detail="Cluster A not connected")
    db_a.chats.delete_one({"chat_id": chat_id})
    db_a.chats.delete_one({"chat_id": str(chat_id)})
    db_a.forward_progress.delete_one({"chat_id": chat_id})
    db_a.forward_progress.delete_one({"chat_id": str(chat_id)})
    return {"status": "deleted", "chat_id": chat_id}

@app.get("/api/forwarding/progress", dependencies=[Depends(verify_token)])
def get_progress():
    if db_a is None:
        return []
    docs = list(db_a.forward_progress.find({}, {"_id": 0}))
    return docs

# --- Universal Forwarder (Folder 5 & 6) Endpoints ---
@app.get("/api/forwarding/universal/status", dependencies=[Depends(verify_token)])
def get_universal_status():
    if db_a is None:
        return {
            "active_progress": None,
            "total_queued": 0,
            "total_completed": 0,
            "total_restricted_removed": 0,
            "total_grouped_albums": 0,
            "folders": [
                {"id": 5, "name": "videoDB", "target": "DBXVideos", "target_id": -1004401442087, "mode_c": False},
                {"id": 6, "name": "TeraDB", "target": "DBXTera", "target_id": -1004337870091, "mode_c": True},
            ]
        }
    try:
        active_prog = db_a.forward_progress.find_one({"status": "in_progress"}, {"_id": 0})
        if not active_prog:
            active_prog = db_a.forward_progress.find_one({}, {"_id": 0}, sort=[("updated_at", -1)])
            
        total_queued = db_a.forward_queue.count_documents({"status": {"$in": ["queued", "in_progress", "pending"]}})
        total_completed = db_a.forward_queue.count_documents({"status": {"$in": ["completed", "done"]}})
        total_removed = db_a.forward_queue.count_documents({"status": "removed_restricted"})
        total_grouped = db_a.grouped_messages.count_documents({})
        
        if active_prog and isinstance(active_prog.get("updated_at"), datetime):
            active_prog["updated_at"] = active_prog["updated_at"].isoformat()
            
        return {
            "active_progress": active_prog,
            "total_queued": total_queued,
            "total_completed": total_completed,
            "total_restricted_removed": total_removed,
            "total_grouped_albums": total_grouped,
            "folders": [
                {"id": 5, "name": "videoDB", "target": "DBXVideos", "target_id": -1004401442087, "mode_c": False},
                {"id": 6, "name": "TeraDB", "target": "DBXTera", "target_id": -1004337870091, "mode_c": True},
            ]
        }
    except Exception as e:
        print(f"Error querying universal status: {e}")
        return {"error": str(e)}

@app.get("/api/forwarding/universal/queue", dependencies=[Depends(verify_token)])
def get_universal_queue(folder_id: Optional[int] = None, status: Optional[str] = None):
    if db_a is None:
        return []
    try:
        query: Dict[str, Any] = {}
        if folder_id:
            query["folder_id"] = folder_id
        if status and status != "all":
            query["status"] = status
        
        docs = list(db_a.forward_queue.find(query, {"_id": 0}).sort([("queue_position", 1)]))
        for doc in docs:
            if isinstance(doc.get("updated_at"), datetime):
                doc["updated_at"] = doc["updated_at"].isoformat()
        return docs
    except Exception as e:
        print(f"Error fetching universal queue: {e}")
        return []

@app.get("/api/forwarding/universal/grouped", dependencies=[Depends(verify_token)])
def get_universal_grouped(limit: int = Query(50, ge=1, le=200), channel_id: Optional[int] = None):
    if db_a is None:
        return {"total": 0, "albums": []}
    try:
        query: Dict[str, Any] = {}
        if channel_id:
            query["channel_id"] = channel_id
        total = db_a.grouped_messages.count_documents(query)
        albums = list(db_a.grouped_messages.find(query, {"_id": 0}).sort("copied_at", -1).limit(limit))
        for album in albums:
            if isinstance(album.get("copied_at"), datetime):
                album["copied_at"] = album["copied_at"].isoformat()
        return {"total": total, "albums": albums}
    except Exception as e:
        print(f"Error fetching grouped messages: {e}")
        return {"total": 0, "albums": []}

# --- Bulk Forwarding & Jobs ---
class BulkForwardRequest(BaseModel):
    source_id: int
    target_id: int
    from_msg_id: int = 0
    to_msg_id: int = 0

@app.post("/api/forwarding/bulk", dependencies=[Depends(verify_token)])
async def start_bulk_forward(req: BulkForwardRequest):
    job = await bot_manager.start_bulk_forward_job(
        source_id=req.source_id,
        target_id=req.target_id,
        from_msg_id=req.from_msg_id,
        to_msg_id=req.to_msg_id
    )
    return job

@app.get("/api/forwarding/jobs", dependencies=[Depends(verify_token)])
def list_forward_jobs():
    return list(bot_manager.forward_jobs.values())

@app.get("/api/forwarding/jobs/{job_id}", dependencies=[Depends(verify_token)])
def get_forward_job(job_id: str):
    if job_id not in bot_manager.forward_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return bot_manager.forward_jobs[job_id]

@app.post("/api/forwarding/jobs/{job_id}/stop", dependencies=[Depends(verify_token)])
def stop_forward_job(job_id: str):
    res = bot_manager.stop_bulk_forward_job(job_id)
    if "error" in res:
        raise HTTPException(status_code=404, detail=res["error"])
    return res

# --- Channel Mappings (Cluster B - xDataChannels) ---
class MappingCreateRequest(BaseModel):
    source_id: int
    source_name: str
    target_id: int
    target_name: str

@app.get("/api/mappings", dependencies=[Depends(verify_token)])
def get_mappings():
    if db_b is None:
        return []
    docs = list(db_b.xDataChannels.find({}))
    # Clean MongoDB _id for JSON serialization
    for doc in docs:
        doc["source_id"] = doc.get("_id")
        doc["_id"] = str(doc.get("_id"))
    return docs

@app.post("/api/mappings", dependencies=[Depends(verify_token)])
def create_mapping(req: MappingCreateRequest):
    if db_b is None:
        raise HTTPException(status_code=500, detail="Cluster B not connected")
    doc = {
        "_id": req.source_id,
        "source_name": req.source_name,
        "target": req.target_id,
        "target_name": req.target_name
    }
    db_b.xDataChannels.update_one({"_id": req.source_id}, {"$set": doc}, upsert=True)
    doc["_id"] = str(doc["_id"])
    return doc

@app.delete("/api/mappings/{source_id}", dependencies=[Depends(verify_token)])
def delete_mapping(source_id: int):
    if db_b is None:
        raise HTTPException(status_code=500, detail="Cluster B not connected")
    res = db_b.xDataChannels.delete_one({"_id": source_id})
    if res.deleted_count == 0:
        db_b.xDataChannels.delete_one({"_id": str(source_id)})
    return {"status": "deleted", "source_id": source_id}

@app.post("/api/mappings/{source_id}/copy", dependencies=[Depends(verify_token)])
async def trigger_mapping_copy(source_id: int):
    if db_b is None:
        raise HTTPException(status_code=500, detail="Cluster B not connected")
    mapping = db_b.xDataChannels.find_one({"_id": source_id})
    if not mapping:
        mapping = db_b.xDataChannels.find_one({"_id": str(source_id)})
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    
    target_id = mapping.get("target")
    job = await bot_manager.start_bulk_forward_job(source_id=source_id, target_id=target_id)
    return job

# --- Telegram Live Dialogs & Interactive Channel Router ---
class TelegramSetTargetRequest(BaseModel):
    source_id: int
    source_name: str
    target_id: int
    target_name: str
    forward_history: bool = True

@app.get("/api/telegram/dialogs", dependencies=[Depends(verify_token)])
async def get_telegram_dialogs(bot_id: str = "backup_forwarder", refresh: bool = False):
    try:
        return await bot_manager.get_telegram_dialogs(bot_id=bot_id, force_refresh=refresh, db_b=db_b)
    except Exception as e:
        print(f"Error fetching telegram dialogs: {e}")
        return []

@app.post("/api/telegram/set-target", dependencies=[Depends(verify_token)])
async def set_telegram_target(req: TelegramSetTargetRequest):
    if db_b is None:
        raise HTTPException(status_code=500, detail="Cluster B not connected")
    res = await bot_manager.set_channel_mapping(
        source_id=req.source_id,
        source_name=req.source_name,
        target_id=req.target_id,
        target_name=req.target_name,
        forward_history=req.forward_history,
        db_b=db_b
    )
    return res

@app.delete("/api/telegram/target/{source_id}", dependencies=[Depends(verify_token)])
async def remove_telegram_target(source_id: int):
    if db_b is None:
        raise HTTPException(status_code=500, detail="Cluster B not connected")
    return await bot_manager.remove_channel_mapping(source_id=source_id, db_b=db_b)

@app.post("/api/telegram/sync/{source_id}", dependencies=[Depends(verify_token)])
async def sync_telegram_history(source_id: int):
    if db_b is None:
        raise HTTPException(status_code=500, detail="Cluster B not connected")
    mapping = db_b.xDataChannels.find_one({"_id": source_id})
    if not mapping:
        mapping = db_b.xDataChannels.find_one({"_id": str(source_id)})
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    target_id = mapping.get("target")
    job = await bot_manager.start_bulk_forward_job(source_id=source_id, target_id=target_id)
    return job

@app.post("/api/telegram/clean-dead-channels", dependencies=[Depends(verify_token)])
async def clean_dead_channels():
    if db_b is None:
        raise HTTPException(status_code=500, detail="Cluster B not connected")
    return await bot_manager.clean_dead_channels(db_b=db_b)



class FolderChannelActionRequest(BaseModel):
    chat_id: int
    folder_id: int

@app.post("/api/telegram/folders/assign", dependencies=[Depends(verify_token)])
async def assign_folder_channel(req: FolderChannelActionRequest):
    return await bot_manager.add_channel_to_folder(folder_id=req.folder_id, chat_id=req.chat_id)

@app.post("/api/telegram/folders/remove", dependencies=[Depends(verify_token)])
async def remove_folder_channel(req: FolderChannelActionRequest):
    return await bot_manager.remove_channel_from_folder(folder_id=req.folder_id, chat_id=req.chat_id)

@app.post("/api/telegram/clear-all-mappings", dependencies=[Depends(verify_token)])
async def clear_all_mappings():
    return await bot_manager.clear_all_legacy_mappings(db_b=db_b)

@app.post("/api/telegram/folders/cleanup-to-three", dependencies=[Depends(verify_token)])
async def cleanup_extra_telegram_folders():
    return await bot_manager.cleanup_telegram_folders_to_three()

# --- Telegram String Session Generator ---
PENDING_AUTH_SESSIONS: Dict[str, Dict[str, Any]] = {}

def cleanup_expired_auth_sessions():
    now = time.time()
    for auth_id in list(PENDING_AUTH_SESSIONS.keys()):
        data = PENDING_AUTH_SESSIONS.get(auth_id)
        if data and (now - data.get("created_at", 0) > 600):
            client = data.get("client")
            if client and getattr(client, "is_connected", False):
                try:
                    asyncio.create_task(client.disconnect())
                except Exception:
                    pass
            PENDING_AUTH_SESSIONS.pop(auth_id, None)

class SendSessionCodeRequest(BaseModel):
    phone_number: str
    api_id: Optional[int] = None
    api_hash: Optional[str] = None

class VerifySessionCodeRequest(BaseModel):
    auth_id: str
    phone_code: str
    password: Optional[str] = None

class ApplySessionRequest(BaseModel):
    target_bot: str  # "movie_forwarder" or "backup_forwarder"
    session_string: str

@app.post("/api/telegram/session/send-code", dependencies=[Depends(verify_token)])
async def send_telegram_session_code(req: SendSessionCodeRequest):
    cleanup_expired_auth_sessions()
    
    phone = req.phone_number.strip().replace(" ", "").replace("-", "")
    if not phone.startswith("+"):
        phone = f"+{phone}"
        
    api_id = req.api_id or getattr(Config, "API_ID2", 27672711)
    api_hash = req.api_hash or getattr(Config, "API_HASH2", "4e7aaf6a6b0ddcb00e05e9234e2e84dd")
    
    auth_id = str(uuid.uuid4())
    client = Client(
        name=f"auth_session_{auth_id[:8]}",
        api_id=api_id,
        api_hash=api_hash,
        in_memory=True
    )
    
    try:
        await client.connect()
        sent_code = await client.send_code(phone)
        
        PENDING_AUTH_SESSIONS[auth_id] = {
            "client": client,
            "phone_number": phone,
            "phone_code_hash": sent_code.phone_code_hash,
            "created_at": time.time(),
            "api_id": api_id,
            "api_hash": api_hash
        }
        
        return {
            "success": True,
            "auth_id": auth_id,
            "phone_number": phone,
            "phone_code_hash": sent_code.phone_code_hash,
            "timeout": getattr(sent_code, "timeout", 300),
            "code_type": str(getattr(sent_code, "type", "app")),
            "message": f"Verification code sent to your Telegram app on {phone}"
        }
    except PhoneNumberInvalid:
        if getattr(client, "is_connected", False):
            await client.disconnect()
        raise HTTPException(status_code=400, detail="Invalid phone number. Please include the full country code (e.g. +91...).")
    except PhoneNumberBanned:
        if getattr(client, "is_connected", False):
            await client.disconnect()
        raise HTTPException(status_code=400, detail="This phone number has been banned by Telegram.")
    except FloodWait as e:
        if getattr(client, "is_connected", False):
            await client.disconnect()
        raise HTTPException(status_code=429, detail=f"Telegram FloodWait: Please wait {e.value} seconds before trying again.")
    except Exception as e:
        if getattr(client, "is_connected", False):
            try:
                await client.disconnect()
            except Exception:
                pass
        err_msg = str(e).encode("ascii", errors="ignore").decode("ascii")
        raise HTTPException(status_code=500, detail=f"Failed to send code: {err_msg}")

@app.post("/api/telegram/session/verify-code", dependencies=[Depends(verify_token)])
async def verify_telegram_session_code(req: VerifySessionCodeRequest):
    cleanup_expired_auth_sessions()
    
    auth_data = PENDING_AUTH_SESSIONS.get(req.auth_id)
    if not auth_data:
        raise HTTPException(status_code=400, detail="Session expired or not found. Please request a new code.")
        
    client: Client = auth_data["client"]
    phone = auth_data["phone_number"]
    phone_code_hash = auth_data["phone_code_hash"]
    code = req.phone_code.strip()
    
    try:
        try:
            await client.sign_in(
                phone_number=phone,
                phone_code_hash=phone_code_hash,
                phone_code=code
            )
        except SessionPasswordNeeded:
            if not req.password:
                return {
                    "success": False,
                    "need_password": True,
                    "message": "Two-Step Verification (2FA) password is required for this account."
                }
            await client.check_password(req.password.strip())
            
        session_string = await client.export_session_string()
        me = await client.get_me()
        user_info = {
            "id": me.id,
            "first_name": me.first_name,
            "last_name": getattr(me, "last_name", None),
            "username": getattr(me, "username", None),
            "phone_number": getattr(me, "phone_number", phone)
        }
        
        await client.disconnect()
        PENDING_AUTH_SESSIONS.pop(req.auth_id, None)
        
        return {
            "success": True,
            "session_string": session_string,
            "user": user_info,
            "message": "String session generated successfully!"
        }
    except PhoneCodeInvalid:
        raise HTTPException(status_code=400, detail="Invalid verification code. Please check the code in your Telegram app.")
    except PhoneCodeExpired:
        raise HTTPException(status_code=400, detail="Verification code has expired. Please request a new one.")
    except PasswordHashInvalid:
        raise HTTPException(status_code=400, detail="Incorrect 2FA password. Please try again.")
    except FloodWait as e:
        raise HTTPException(status_code=429, detail=f"Telegram FloodWait: Please wait {e.value} seconds.")
    except Exception as e:
        err_msg = str(e).encode("ascii", errors="ignore").decode("ascii")
        raise HTTPException(status_code=500, detail=f"Authentication failed: {err_msg}")

@app.post("/api/telegram/session/apply", dependencies=[Depends(verify_token)])
async def apply_telegram_session(req: ApplySessionRequest):
    bot_id = req.target_bot
    if bot_id not in ["movie_forwarder", "backup_forwarder"]:
        raise HTTPException(status_code=400, detail="Invalid target bot. Must be 'movie_forwarder' or 'backup_forwarder'")
        
    session_key = "SESSION1" if bot_id == "movie_forwarder" else "SESSION2"
    new_session = req.session_string.strip()
    
    # 1. Update in-memory Config and environment
    os.environ[session_key] = new_session
    setattr(Config, session_key, new_session)
    
    # 2. Update config.py on disk so it persists across restarts
    try:
        config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.py")
        if os.path.isfile(config_path):
            with open(config_path, "r", encoding="utf-8") as f:
                content = f.read()
            
            pattern = rf'({session_key}\s*=\s*(?:getenv\("{session_key}"\s*,\s*)?)"[^"]*"\)?'
            replacement = rf'{session_key} = getenv("{session_key}", "{new_session}")'
            new_content = re.sub(pattern, replacement, content)
            
            with open(config_path, "w", encoding="utf-8") as f:
                f.write(new_content)
    except Exception as e:
        print(f"Warning: Failed to persist session to config.py: {e}")
        
    # 3. Persist to MongoDB Cluster A (bot_sessions collection) for permanent cloud backup
    if db_a is not None:
        try:
            db_a.bot_sessions.update_one(
                {"_id": session_key},
                {"$set": {
                    "_id": session_key,
                    "target_bot": bot_id,
                    "session_string": new_session,
                    "updated_at": datetime.now()
                }},
                upsert=True
            )
            print(f"Persisted {session_key} to MongoDB bot_sessions")
        except Exception as me:
            print(f"Warning: Failed to persist session to MongoDB: {me}")

    # 4. Restart target bot with fresh session
    restart_res = await bot_manager.restart_bot(bot_id)
    
    return {
        "success": True,
        "target_bot": bot_id,
        "session_key": session_key,
        "restart_result": restart_res,
        "message": f"Successfully applied {session_key} and restarted {bot_id}!"
    }

# --- Channels & Groups (Aggregated from DB) ---
@app.get("/api/channels", dependencies=[Depends(verify_token)])
def get_all_channels():
    channels = []
    if db_a is not None:
        try:
            for chat in db_a.chats.find({}, {"_id": 0}):
                channels.append({
                    "chat_id": chat.get("chat_id"),
                    "title": chat.get("title", "Unknown"),
                    "type": chat.get("type", "channel"),
                    "status": chat.get("status", "pending"),
                    "last_scan": chat.get("last_scan"),
                    "source": "chats_queue"
                })
        except Exception as e:
            print(f"Error fetching from chats: {e}")

    if db_b is not None:
        try:
            for mapping in db_b.xDataChannels.find({}):
                channels.append({
                    "chat_id": mapping.get("_id"),
                    "title": mapping.get("source_name", "Source Channel"),
                    "type": "channel",
                    "status": "mapped",
                    "last_scan": None,
                    "target_id": mapping.get("target"),
                    "target_name": mapping.get("target_name"),
                    "source": "backup_mapping"
                })
        except Exception as e:
            print(f"Error fetching from xDataChannels: {e}")

    return channels

# --- Database Status & Collection Inspector ---
@app.get("/api/database/status", dependencies=[Depends(verify_token)])
def db_status():
    status_data = {
        "cluster_a": {
            "name": "Cluster 0 (Main Forwarder)",
            "connected": db_a is not None,
            "collections": {
                "chats": {"count": db_a.chats.count_documents({}) if db_a is not None else 0, "status": "active"},
                "forward_progress": {"count": db_a.forward_progress.count_documents({}) if db_a is not None else 0, "status": "active"},
                "media_store": {"count": db_a.media_store.count_documents({}) if db_a is not None else 0, "status": "active"},
                "daily_summary": {"count": db_a.daily_summary.count_documents({}) if db_a is not None else 0, "status": "active"},
            }
        },
        "cluster_b": {
            "name": "Cluster 0 (Plugins & Media)",
            "connected": db_b is not None,
            "collections": {
                "xData": {"count": db_b.xData.count_documents({}) if db_b is not None else 0, "status": "active"},
                "xDataChannels": {"count": db_b.xDataChannels.count_documents({}) if db_b is not None else 0, "status": "active"},
                "newMovieDatas2": {"count": db_b.newMovieDatas2.count_documents({}) if db_b is not None else 0, "status": "active"},
                "terabotsearch": {"count": db_b.terabotsearch.count_documents({}) if db_b is not None else 0, "status": "active"},
            }
        }
    }
    return status_data

@app.get("/api/database/collections/{name}", dependencies=[Depends(verify_token)])
def get_collection_data(name: str, limit: int = Query(20, ge=1, le=100)):
    records = []
    # Check cluster A
    if db_a is not None and name in ["chats", "forward_progress", "media_store", "daily_summary"]:
        coll = db_a[name]
        for doc in coll.find().sort("_id", -1).limit(limit):
            doc["_id"] = str(doc.get("_id"))
            records.append(doc)
        return records

    # Check cluster B
    if db_b is not None and name in ["xData", "xDataChannels", "newMovieDatas2", "terabotsearch"]:
        coll = db_b[name]
        for doc in coll.find().sort("_id", -1).limit(limit):
            doc["_id"] = str(doc.get("_id"))
            records.append(doc)
        return records

    raise HTTPException(status_code=404, detail="Collection not found")

# --- TeraBox Configuration & Search ---
@app.get("/api/terabox/config", dependencies=[Depends(verify_token)])
def get_terabox_config():
    try:
        import xdatamodifyteraconfig as tcfg
        return {
            "keywords": getattr(tcfg, "KEYWORDS", []),
            "target_channels": getattr(tcfg, "TARGET_CHANNELS", []),
            "search_api": getattr(tcfg, "SEARCH_API", ""),
            "g3_base": getattr(tcfg, "G3_BASE", ""),
            "limit": getattr(tcfg, "LIMIT", 10),
            "auto_limit": getattr(tcfg, "AUTO_LIMIT", 5),
            "auto_send_delay": getattr(tcfg, "AUTO_SEND_DELAY", 1800),
            "auto_delete_delay": getattr(tcfg, "AUTO_DELETE_DELAY", 1800),
            "search_cooldown": getattr(tcfg, "SEARCH_COOLDOWN", 1800),
            "welcome_msg": getattr(tcfg, "WELCOME_MSG", "")
        }
    except Exception as e:
        return {"error": f"Failed to load config: {str(e)}"}

class TeraBoxSearchRequest(BaseModel):
    query: str
    limit: int = 5
    offset: int = 0

@app.post("/api/terabox/search", dependencies=[Depends(verify_token)])
async def search_terabox(req: TeraBoxSearchRequest):
    try:
        import xdatamodifyteraconfig as tcfg
        api_url = getattr(tcfg, "SEARCH_API", "https://playterabox.com/api/search-videos")
        params = {"q": req.query, "limit": req.limit, "offset": req.offset}
        async with aiohttp.ClientSession() as session:
            async with session.get(api_url, params=params, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return {"success": True, "results": data}
                else:
                    return {"success": False, "status_code": resp.status, "results": []}
    except Exception as e:
        return {"success": False, "error": str(e), "results": []}

# --- Logs & Error Monitoring ---
@app.get("/api/logs", dependencies=[Depends(verify_token)])
def get_all_logs(bot_id: Optional[str] = None, level: Optional[str] = None, limit: int = 100):
    return bot_manager.get_logs(bot_id=bot_id, level=level, limit=limit)

@app.get("/api/logs/stream", dependencies=[Depends(verify_token)])
async def stream_logs(request: Request):
    async def log_generator():
        last_index = len(bot_manager.log_buffer)
        while True:
            if await request.is_disconnected():
                break
            
            current_len = len(bot_manager.log_buffer)
            if current_len > last_index:
                for i in range(last_index, current_len):
                    yield {"data": bot_manager.log_buffer[i]}
                last_index = current_len
            
            await asyncio.sleep(1)
            
    return EventSourceResponse(log_generator())

@app.get("/api/errors", dependencies=[Depends(verify_token)])
def get_errors_endpoint(limit: int = 50):
    return bot_manager.get_errors(limit=limit)

# --- Telegram Live Media & Folder APIs ---
from config import Config
import pyrogram.utils
# Fix for 64-bit Telegram Channel IDs (channel IDs above 2.14 billion)
pyrogram.utils.MIN_CHANNEL_ID = -1009999999999
pyrogram.utils.MAX_CHANNEL_ID = -1000000000000

from pyrogram import Client as TgClient, enums
from pyrogram.raw.functions.messages import GetDialogFilters
from pyrogram.errors import FloodWait

_api_tg_client: Optional[TgClient] = None
_channel_stats_cache: Dict[int, tuple] = {}
_thumb_cache: Dict[str, bytes] = {}
THUMB_CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache", "thumbs")
os.makedirs(THUMB_CACHE_DIR, exist_ok=True)
_thumb_file_id_map: Dict[str, str] = {}
_thumb_semaphore = asyncio.Semaphore(4)

async def get_api_tg_client() -> TgClient:
    global _api_tg_client
    if _api_tg_client is None or not _api_tg_client.is_connected:
        _api_tg_client = TgClient(
            "api_media_streamer",
            api_id=Config.API_ID2,
            api_hash=Config.API_HASH2,
            session_string=Config.SESSION2,
            in_memory=True
        )
        await _api_tg_client.start()
    return _api_tg_client

_channel_meta_cache: Dict[int, dict] = {}
_meta_semaphore = asyncio.Semaphore(4)

async def _resolve_channel_meta(tg: TgClient, chat_id: int) -> dict:
    if chat_id in _channel_meta_cache:
        return _channel_meta_cache[chat_id]
    async with _meta_semaphore:
        for attempt in range(2):
            try:
                chat = await tg.get_chat(chat_id)
                meta = {
                    "chat_id": chat.id,
                    "title": chat.title or f"Chat {chat_id}",
                    "username": chat.username,
                    "is_public": bool(chat.username),
                    "has_protected_content": getattr(chat, "has_protected_content", False)
                }
                _channel_meta_cache[chat_id] = meta
                return meta
            except FloodWait as e:
                await asyncio.sleep(e.value + 1)
            except Exception:
                break
        return {
            "chat_id": chat_id,
            "title": f"Chat {chat_id}",
            "username": None,
            "is_public": False,
            "has_protected_content": False
        }

@app.get("/api/telegram/folders", dependencies=[Depends(verify_token)])
async def get_telegram_folders():
    try:
        tg = await get_api_tg_client()
        filters = await tg.invoke(GetDialogFilters())
        folder_list = []
        for f in filters:
            fid = getattr(f, "id", None)
            if fid is None:
                continue
            title = getattr(f, "title", "Untitled")
            emoticon = getattr(f, "emoticon", "") or ""
            peers = getattr(f, "include_peers", [])
            
            chat_ids = []
            for p in peers:
                cid = getattr(p, "channel_id", None) or getattr(p, "chat_id", None)
                if not cid:
                    continue
                chat_id = int(f"-100{cid}") if not str(cid).startswith("-") else cid
                chat_ids.append(chat_id)
                
            channels = await asyncio.gather(*[_resolve_channel_meta(tg, cid) for cid in chat_ids])
                    
            folder_list.append({
                "id": fid,
                "title": title,
                "emoticon": emoticon,
                "channels_count": len(channels),
                "channels": list(channels)
            })
        return folder_list
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def _prefetch_thumbs(items):
    try:
        tg = await get_api_tg_client()
        for cache_key, fid in items:
            c_file = os.path.join(THUMB_CACHE_DIR, f"{cache_key}.jpg")
            if os.path.isfile(c_file):
                continue
            try:
                async with _thumb_semaphore:
                    if os.path.isfile(c_file):
                        continue
                    res = await tg.download_media(fid, in_memory=True)
                    if res and hasattr(res, "getvalue"):
                        with open(c_file, "wb") as f:
                            f.write(res.getvalue())
            except Exception:
                pass
    except Exception:
        pass

@app.get("/api/telegram/channel/{chat_id}/media", dependencies=[Depends(verify_token)])
async def get_channel_media(chat_id: int, limit: int = 40):
    try:
        tg = await get_api_tg_client()
        media_list = []
        to_prefetch = []
        
        async for msg in tg.get_chat_history(chat_id, limit=limit):
            m_type = None
            file_name = None
            file_size = 0
            duration = None
            has_thumb = False
            file_to_download = None
            
            if msg.video:
                m_type = "video"
                file_name = msg.video.file_name or f"video_{msg.id}.mp4"
                file_size = msg.video.file_size or 0
                duration = msg.video.duration
                if msg.video.thumbs:
                    has_thumb = True
                    file_to_download = msg.video.thumbs[0].file_id
            elif msg.document:
                is_video_doc = False
                if msg.document.mime_type and msg.document.mime_type.startswith("video/"):
                    is_video_doc = True
                elif msg.document.file_name and msg.document.file_name.lower().endswith((".mp4", ".mkv", ".webm", ".avi", ".mov")):
                    is_video_doc = True
                    
                if is_video_doc:
                    m_type = "video"
                else:
                    m_type = "document"
                file_name = msg.document.file_name or f"doc_{msg.id}"
                file_size = msg.document.file_size or 0
                if msg.document.thumbs:
                    has_thumb = True
                    file_to_download = msg.document.thumbs[0].file_id
            elif msg.photo:
                m_type = "photo"
                file_name = f"photo_{msg.id}.jpg"
                has_thumb = True
                if getattr(msg.photo, "thumbs", None):
                    file_to_download = msg.photo.thumbs[0].file_id
                else:
                    file_to_download = msg.photo.file_id
                
            if not m_type:
                continue

            cache_key = f"{chat_id}_{msg.id}"
            if has_thumb and file_to_download:
                _thumb_file_id_map[cache_key] = file_to_download
                c_file = os.path.join(THUMB_CACHE_DIR, f"{cache_key}.jpg")
                if not os.path.isfile(c_file):
                    to_prefetch.append((cache_key, file_to_download))
                
            # Formatted size
            if file_size > 1024 * 1024 * 1024:
                size_fmt = f"{round(file_size / (1024 * 1024 * 1024), 2)} GB"
            elif file_size > 1024 * 1024:
                size_fmt = f"{round(file_size / (1024 * 1024), 1)} MB"
            elif file_size > 1024:
                size_fmt = f"{round(file_size / 1024, 1)} KB"
            else:
                size_fmt = f"{file_size} B" if file_size else "Unknown"
                
            # Formatted duration
            duration_fmt = None
            if duration:
                mins, secs = divmod(duration, 60)
                hrs, mins = divmod(mins, 60)
                if hrs:
                    duration_fmt = f"{hrs:02d}:{mins:02d}:{secs:02d}"
                else:
                    duration_fmt = f"{mins:02d}:{secs:02d}"
                    
            media_list.append({
                "message_id": msg.id,
                "chat_id": chat_id,
                "media_type": m_type,
                "file_name": file_name,
                "file_size": file_size,
                "file_size_formatted": size_fmt,
                "duration": duration,
                "duration_formatted": duration_fmt,
                "caption": msg.caption or "",
                "date": msg.date.isoformat() if msg.date else None,
                "has_thumb": has_thumb,
                "thumb_url": f"/api/telegram/media/{chat_id}/{msg.id}/thumb" if has_thumb else None,
                "stream_url": f"/api/telegram/media/{chat_id}/{msg.id}/stream" if (m_type == "video" or m_type == "document") else None
            })
            
        # Launch background pre-fetch for the first 20 thumbnails
        if to_prefetch:
            asyncio.create_task(_prefetch_thumbs(to_prefetch[:20]))
            
        return media_list
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/telegram/channel/{chat_id}/stats", dependencies=[Depends(verify_token)])
async def get_channel_stats(chat_id: int):
    now = time.time()
    if chat_id in _channel_stats_cache:
        cached_time, cached_data = _channel_stats_cache[chat_id]
        if now - cached_time < 300:  # 5 min cache
            return cached_data

    try:
        tg = await get_api_tg_client()
        results = await asyncio.gather(
            tg.search_messages_count(chat_id, filter=enums.MessagesFilter.VIDEO),
            tg.search_messages_count(chat_id, filter=enums.MessagesFilter.PHOTO),
            tg.search_messages_count(chat_id, filter=enums.MessagesFilter.DOCUMENT),
            tg.search_messages_count(chat_id, filter=enums.MessagesFilter.AUDIO),
            tg.search_messages_count(chat_id, filter=enums.MessagesFilter.URL),
            tg.get_chat(chat_id),
            return_exceptions=True
        )

        videos_count = results[0] if isinstance(results[0], int) else 0
        photos_count = results[1] if isinstance(results[1], int) else 0
        documents_count = results[2] if isinstance(results[2], int) else 0
        audio_count = results[3] if isinstance(results[3], int) else 0
        links_count = results[4] if isinstance(results[4], int) else 0
        chat = results[5] if not isinstance(results[5], Exception) else None

        title = chat.title if chat else f"Channel {chat_id}"
        username = chat.username if chat and getattr(chat, "username", None) else None
        members_count = chat.members_count if chat and getattr(chat, "members_count", None) else None
        total_media = videos_count + photos_count + documents_count

        # Smart evaluation / recommendation
        if videos_count >= 100:
            assessment = "Gold Video Source"
            assessment_badge = "movie_dense"
        elif videos_count >= 20:
            assessment = "Active Movie Channel"
            assessment_badge = "video_active"
        elif documents_count >= 50:
            assessment = "Document / File Archive"
            assessment_badge = "doc_dense"
        elif photos_count >= 50:
            assessment = "Photo Gallery"
            assessment_badge = "photo_dense"
        elif total_media == 0:
            assessment = "Empty Channel"
            assessment_badge = "empty"
        else:
            assessment = "Low Content"
            assessment_badge = "low"

        stats_data = {
            "chat_id": chat_id,
            "title": title,
            "username": username,
            "members_count": members_count,
            "videos_count": videos_count,
            "photos_count": photos_count,
            "documents_count": documents_count,
            "audio_count": audio_count,
            "links_count": links_count,
            "total_media": total_media,
            "assessment": assessment,
            "assessment_badge": assessment_badge
        }
        _channel_stats_cache[chat_id] = (now, stats_data)
        return stats_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/telegram/media/{chat_id}/{message_id}/thumb")
async def get_media_thumbnail(chat_id: int, message_id: int):
    cache_key = f"{chat_id}_{message_id}"
    cache_file = os.path.join(THUMB_CACHE_DIR, f"{cache_key}.jpg")
    cache_headers = {
        "Cache-Control": "public, max-age=604800, immutable",
        "Access-Control-Allow-Origin": "*",
    }
    
    # 1. Check persistent disk cache (< 1 millisecond)
    if os.path.isfile(cache_file):
        return FileResponse(cache_file, media_type="image/jpeg", headers=cache_headers)

    # 2. Check in-memory RAM cache
    if cache_key in _thumb_cache:
        return Response(content=_thumb_cache[cache_key], media_type="image/jpeg", headers=cache_headers)
        
    try:
        tg = await get_api_tg_client()
        file_to_download = _thumb_file_id_map.get(cache_key)
        
        # If not pre-mapped, fetch single message from Telegram
        if not file_to_download:
            msg = await tg.get_messages(chat_id, message_id)
            if not msg:
                raise HTTPException(status_code=404, detail="Message not found")
            if msg.video and msg.video.thumbs:
                file_to_download = msg.video.thumbs[0].file_id
            elif msg.photo:
                if getattr(msg.photo, "thumbs", None):
                    file_to_download = msg.photo.thumbs[0].file_id
                else:
                    file_to_download = msg.photo.file_id
            elif msg.document and msg.document.thumbs:
                file_to_download = msg.document.thumbs[0].file_id
                
        if not file_to_download:
            raise HTTPException(status_code=404, detail="No thumbnail available for this message")
            
        async with _thumb_semaphore:
            # Double check disk in case another task finished it
            if os.path.isfile(cache_file):
                return FileResponse(cache_file, media_type="image/jpeg", headers=cache_headers)
                
            thumb_stream = await tg.download_media(file_to_download, in_memory=True)
            if thumb_stream:
                if hasattr(thumb_stream, "getvalue"):
                    img_bytes = thumb_stream.getvalue()
                elif isinstance(thumb_stream, (bytes, bytearray)):
                    img_bytes = bytes(thumb_stream)
                elif isinstance(thumb_stream, str) and os.path.exists(thumb_stream):
                    with open(thumb_stream, "rb") as f:
                        img_bytes = f.read()
                else:
                    raise HTTPException(status_code=500, detail="Unsupported thumb stream type")
                    
                # Save to disk cache
                try:
                    with open(cache_file, "wb") as f:
                        f.write(img_bytes)
                except Exception as save_err:
                    print(f"Error saving thumb disk cache: {save_err}")
                    
                # Keep RAM cache bounded
                if len(_thumb_cache) > 500:
                    _thumb_cache.pop(next(iter(_thumb_cache)))
                _thumb_cache[cache_key] = img_bytes
                return Response(content=img_bytes, media_type="image/jpeg", headers=cache_headers)
                
        raise HTTPException(status_code=404, detail="Failed to load thumbnail")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching thumb {chat_id}/{message_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/telegram/media/{chat_id}/{message_id}/stream")
async def stream_media_endpoint(chat_id: int, message_id: int, request: Request):
    """
    High-performance video streaming endpoint with HTTP Range support (206 Partial Content).
    Enables seeking, scrubbing, and smooth in-browser playback for MP4, WebM, and MKV.
    """
    try:
        tg = await get_api_tg_client()
        msg = await tg.get_messages(chat_id, message_id)
        if not msg:
            raise HTTPException(status_code=404, detail="Message not found")
            
        media = msg.video or msg.document or msg.audio or msg.animation
        if not media:
            raise HTTPException(status_code=404, detail="No streamable media in message")
            
        file_size = getattr(media, "file_size", 0) or 0
        file_name = getattr(media, "file_name", None) or f"video_{message_id}.mp4"
        mime_type = getattr(media, "mime_type", None) or "video/mp4"
        
        fname_lower = file_name.lower()
        if fname_lower.endswith(".mkv"):
            mime_type = "video/x-matroska"
        elif fname_lower.endswith(".mp4"):
            mime_type = "video/mp4"
        elif fname_lower.endswith(".webm"):
            mime_type = "video/webm"
            
        range_header = request.headers.get("range")
        chunk_size = 1024 * 1024  # 1MB chunk size in Pyrogram
        
        if range_header:
            range_match = re.match(r"bytes=(\d+)-(\d*)", range_header)
            if range_match:
                start = int(range_match.group(1))
                end = int(range_match.group(2)) if range_match.group(2) else file_size - 1
            else:
                start = 0
                end = file_size - 1
        else:
            start = 0
            end = file_size - 1
            
        if file_size > 0:
            if start >= file_size:
                raise HTTPException(status_code=416, detail="Requested range not satisfiable")
            end = min(end, file_size - 1)
        else:
            end = 0
            
        content_length = end - start + 1 if file_size > 0 else 0
        start_chunk = start // chunk_size
        end_chunk = end // chunk_size if file_size > 0 else 0
        total_chunks = (end_chunk - start_chunk) + 1
        
        async def media_streamer():
            # Pre-buffer queue holds up to 6MB ahead in RAM to eliminate playback stutter
            buffer_queue = asyncio.Queue(maxsize=6)
            
            async def producer():
                try:
                    async for chunk in tg.stream_media(msg, offset=start_chunk, limit=total_chunks):
                        if not chunk:
                            break
                        await buffer_queue.put(chunk)
                except Exception as p_err:
                    print(f"Stream producer error for {chat_id}/{message_id}: {p_err}")
                finally:
                    await buffer_queue.put(None)
                    
            producer_task = asyncio.create_task(producer())
            
            bytes_left = content_length
            current_offset = start_chunk
            try:
                while bytes_left > 0:
                    chunk = await buffer_queue.get()
                    if chunk is None:
                        break
                        
                    if current_offset == start_chunk:
                        chunk_offset = start % chunk_size
                        chunk = chunk[chunk_offset:]
                        
                    if len(chunk) > bytes_left:
                        chunk = chunk[:bytes_left]
                        
                    bytes_left -= len(chunk)
                    yield chunk
                    current_offset += 1
            except Exception as stream_err:
                print(f"Stream consumer error for {chat_id}/{message_id}: {stream_err}")
            finally:
                if not producer_task.done():
                    producer_task.cancel()

        ascii_filename = re.sub(r'[^\x00-\x7F]+', '_', file_name).strip() or f"video_{message_id}.mp4"
        encoded_filename = urllib.parse.quote(file_name, encoding="utf-8")
        disposition = f'inline; filename="{ascii_filename}"; filename*=UTF-8\'\'{encoded_filename}'

        headers = {
            "Accept-Ranges": "bytes",
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Content-Length": str(content_length),
            "Content-Type": mime_type,
            "Content-Disposition": disposition,
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length",
        }
        
        status_code = 206 if range_header else 200
        return StreamingResponse(
            media_streamer(),
            status_code=status_code,
            headers=headers,
            media_type=mime_type
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error setting up stream for {chat_id}/{message_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class ForwardMediaRequest(BaseModel):
    from_chat_id: int
    to_chat_id: int
    message_ids: List[int]

@app.post("/api/telegram/media/forward", dependencies=[Depends(verify_token)])
async def forward_media_endpoint(payload: ForwardMediaRequest):
    try:
        tg = await get_api_tg_client()
        res = await tg.forward_messages(
            chat_id=payload.to_chat_id,
            from_chat_id=payload.from_chat_id,
            message_ids=payload.message_ids
        )
        return {
            "success": True,
            "forwarded_count": len(payload.message_ids) if isinstance(res, list) else 1
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Serve Next.js Static UI from single port ---
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

admin_out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "admin", "out")
if os.path.exists(admin_out_dir):
    next_static = os.path.join(admin_out_dir, "_next")
    if os.path.exists(next_static):
        app.mount("/_next", StaticFiles(directory=next_static), name="next_static")

    @app.api_route("/{full_path:path}", methods=["GET", "HEAD"])
    async def serve_ui(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API route not found")
        
        target = os.path.join(admin_out_dir, full_path)
        if os.path.isfile(target):
            return FileResponse(target)
            
        html_target = os.path.join(admin_out_dir, f"{full_path}.html")
        if os.path.isfile(html_target):
            return FileResponse(html_target)
            
        dir_idx = os.path.join(admin_out_dir, full_path, "index.html")
        if os.path.isfile(dir_idx):
            return FileResponse(dir_idx)

        fallback = os.path.join(admin_out_dir, "index.html")
        if os.path.isfile(fallback):
            return FileResponse(fallback)
        raise HTTPException(status_code=404, detail="Page not found")

if __name__ == "__main__":
    # Support Bot-Hosting SERVER_PORT as well as standard PORT
    port_str = os.getenv("SERVER_PORT") or os.getenv("PORT") or "8000"
    port = int(port_str)
    host = os.getenv("HOST", "0.0.0.0")
    print(f"Starting AllForward API & UI server on http://{host}:{port} (SERVER_PORT={os.getenv('SERVER_PORT')})...")
    uvicorn.run("api_server:app", host=host, port=port, reload=False)
