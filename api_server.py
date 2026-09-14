import os
import asyncio

# Fix for Python 3.14 where no event loop exists in MainThread on module import
try:
    asyncio.get_event_loop()
except RuntimeError:
    asyncio.set_event_loop(asyncio.new_event_loop())

from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, Depends, HTTPException, status, Header, Request, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt
from pymongo import MongoClient
from pydantic import BaseModel
import uvicorn
import aiohttp
from sse_starlette.sse import EventSourceResponse

from bot_manager import BotManager

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
    if not db_a:
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
    if not db_a:
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
    if not db_a:
        return []
    query = {}
    if status and status != "all":
        query["status"] = status
    docs = list(db_a.chats.find(query, {"_id": 0}))
    return docs

@app.post("/api/forwarding/chats", dependencies=[Depends(verify_token)])
def add_forwarding_chat(req: ChatCreateRequest):
    if not db_a:
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
    if not db_a:
        raise HTTPException(status_code=500, detail="Cluster A not connected")
    result = db_a.chats.update_one({"chat_id": chat_id}, {"$set": {"status": req.status}})
    if result.matched_count == 0:
        # Also try string format
        db_a.chats.update_one({"chat_id": str(chat_id)}, {"$set": {"status": req.status}})
    return {"status": "updated", "chat_id": chat_id, "new_status": req.status}

@app.delete("/api/forwarding/chats/{chat_id}", dependencies=[Depends(verify_token)])
def delete_chat(chat_id: int):
    if not db_a:
        raise HTTPException(status_code=500, detail="Cluster A not connected")
    db_a.chats.delete_one({"chat_id": chat_id})
    db_a.chats.delete_one({"chat_id": str(chat_id)})
    db_a.forward_progress.delete_one({"chat_id": chat_id})
    db_a.forward_progress.delete_one({"chat_id": str(chat_id)})
    return {"status": "deleted", "chat_id": chat_id}

@app.get("/api/forwarding/progress", dependencies=[Depends(verify_token)])
def get_progress():
    if not db_a:
        return []
    docs = list(db_a.forward_progress.find({}, {"_id": 0}))
    return docs

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
    if not db_b:
        return []
    docs = list(db_b.xDataChannels.find({}))
    # Clean MongoDB _id for JSON serialization
    for doc in docs:
        doc["source_id"] = doc.get("_id")
        doc["_id"] = str(doc.get("_id"))
    return docs

@app.post("/api/mappings", dependencies=[Depends(verify_token)])
def create_mapping(req: MappingCreateRequest):
    if not db_b:
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
    if not db_b:
        raise HTTPException(status_code=500, detail="Cluster B not connected")
    res = db_b.xDataChannels.delete_one({"_id": source_id})
    if res.deleted_count == 0:
        db_b.xDataChannels.delete_one({"_id": str(source_id)})
    return {"status": "deleted", "source_id": source_id}

@app.post("/api/mappings/{source_id}/copy", dependencies=[Depends(verify_token)])
async def trigger_mapping_copy(source_id: int):
    if not db_b:
        raise HTTPException(status_code=500, detail="Cluster B not connected")
    mapping = db_b.xDataChannels.find_one({"_id": source_id})
    if not mapping:
        mapping = db_b.xDataChannels.find_one({"_id": str(source_id)})
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    
    target_id = mapping.get("target")
    job = await bot_manager.start_bulk_forward_job(source_id=source_id, target_id=target_id)
    return job

# --- Channels & Groups (Aggregated from DB) ---
@app.get("/api/channels", dependencies=[Depends(verify_token)])
def get_all_channels():
    channels = []
    if db_a:
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

    if db_b:
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
                "chats": {"count": db_a.chats.count_documents({}) if db_a else 0, "status": "active"},
                "forward_progress": {"count": db_a.forward_progress.count_documents({}) if db_a else 0, "status": "active"},
                "media_store": {"count": db_a.media_store.count_documents({}) if db_a else 0, "status": "active"},
                "daily_summary": {"count": db_a.daily_summary.count_documents({}) if db_a else 0, "status": "active"},
            }
        },
        "cluster_b": {
            "name": "Cluster 0 (Plugins & Media)",
            "connected": db_b is not None,
            "collections": {
                "xData": {"count": db_b.xData.count_documents({}) if db_b else 0, "status": "active"},
                "xDataChannels": {"count": db_b.xDataChannels.count_documents({}) if db_b else 0, "status": "active"},
                "newMovieDatas2": {"count": db_b.newMovieDatas2.count_documents({}) if db_b else 0, "status": "active"},
                "terabotsearch": {"count": db_b.terabotsearch.count_documents({}) if db_b else 0, "status": "active"},
            }
        }
    }
    return status_data

@app.get("/api/database/collections/{name}", dependencies=[Depends(verify_token)])
def get_collection_data(name: str, limit: int = Query(20, ge=1, le=100)):
    records = []
    # Check cluster A
    if db_a and name in ["chats", "forward_progress", "media_store", "daily_summary"]:
        coll = db_a[name]
        for doc in coll.find().sort("_id", -1).limit(limit):
            doc["_id"] = str(doc.get("_id"))
            records.append(doc)
        return records

    # Check cluster B
    if db_b and name in ["xData", "xDataChannels", "newMovieDatas2", "terabotsearch"]:
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

# --- Serve Next.js Static UI from single port ---
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

admin_out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "admin", "out")
if os.path.exists(admin_out_dir):
    next_static = os.path.join(admin_out_dir, "_next")
    if os.path.exists(next_static):
        app.mount("/_next", StaticFiles(directory=next_static), name="next_static")

    @app.get("/{full_path:path}")
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
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    uvicorn.run("api_server:app", host=host, port=port, reload=False)
