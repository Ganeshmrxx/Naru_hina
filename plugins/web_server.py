from aiohttp import web
from urllib.parse import quote_plus
import traceback
import time

from info import BIN_CHANNEL, URL
from Lucia.Bot import SilentX
from Lucia.util.file_properties import get_name, get_hash
from itsdangerous import URLSafeSerializer


SECRET_KEY = "SUPER_SECRET_KEY_CHANGE_THIS"
serializer = URLSafeSerializer(SECRET_KEY)

from pymongo import MongoClient
import re

# ✅ Mongo connection
uri = "mongodb+srv://g3cwork_db_user:g312345@cluster0.lpmpcya.mongodb.net/?appName=Cluster0"

client = MongoClient(uri)

# ❗ IMPORTANT FIX (NOT Cluster0)
db = client["Cluster0"]
collection = db["NovemberMovieData2"]

print("✅ Mongo Connected")


def extract_file_id(msg):
    if msg.document:
        return msg.document.file_id
    if msg.video:
        return msg.video.file_id
    if msg.audio:
        return msg.audio.file_id
    if msg.voice:
        return msg.voice.file_id
    return None


async def streamfile_api(request):
    try:
        channel_id = int(request.match_info["channel_id"])
        message_id = int(request.match_info["message_id"])

        # 1️⃣ Get original message
        cached_msg = await SilentX.get_messages(channel_id, message_id)

        if not cached_msg or not cached_msg.media:
            return web.json_response(
                {"status": "error", "message": "No media in message"},
                status=404
            )

       

        # 3️⃣ Generate stream link using cached message
        name = get_name(cached_msg) or "file"
        payload = {
            "id": cached_msg.id,
            "cid": channel_id,
            "hash": get_hash(cached_msg),
            "exp": int(time.time()) + 3600  # 1 hour expiry
            }


        token = serializer.dumps(payload)
        stream_url = f"{URL}{token}"
        
        """
        stream_url = (
            f"{URL}{cached_msg.id}/"
            f"{quote_plus(name)}?hash={get_hash(cached_msg)}&cid={channel_id}"
        )
        """

        return web.json_response({
            "status": "success",
            "channel_id": channel_id,
            "message_id": message_id,
            "cached_message_id": cached_msg.id,
            "stream": stream_url
        })

    except Exception as e:
        return web.json_response(
            {"status": "error", "message": str(e)},
            status=500
        )

async def search_api(request):
    try:
        query = request.query.get("q", "")
        page = int(request.query.get("page", 1))
        limit = int(request.query.get("limit", 10))

        if not query:
            return web.json_response([])

        # ✅ Split words
        words = re.sub(r"[^a-zA-Z0-9]", " ", query).split()

        # ✅ AND condition
        conditions = [
            {"file_name": {"$regex": word, "$options": "i"}}
            for word in words
        ]

        filter_query = {"$and": conditions} if conditions else {}

        # ✅ Pagination
        skip = (page - 1) * limit

        # ✅ Latest → Old
        cursor = (
            collection.find(filter_query)
            .sort("$natural", -1)
            .skip(skip)
            .limit(limit)
        )

        results = []
        for doc in cursor:
            doc["_id"] = str(doc["_id"])  # convert ObjectId
            results.append({
                "file_name": doc.get("file_name"),
                "channel_id": doc.get("channel_id"),
                "message_id": doc.get("message_id"),
                "file_size": doc.get("file_size"),
                "mime_type": doc.get("mime_type"),
            })

        total = collection.count_documents(filter_query)

        return web.json_response({
            "status": "success",
            "query": query,
            "page": page,
            "total": total,
            "results": results
        })

    except Exception as e:
        traceback.print_exc()
        return web.json_response(
            {"status": "error", "message": str(e)},
            status=500
        )

async def start_api_server():
    app = web.Application()
    app.router.add_get(
        "/stream/{channel_id}/{message_id}",
        streamfile_api
    )
     # ✅ NEW SEARCH API
    app.router.add_get("/api/search", search_api)

    runner = web.AppRunner(app)
    await runner.setup()

    # 🔹 USE A DIFFERENT PORT
    site = web.TCPSite(runner, "0.0.0.0", 8081)
    await site.start()

    print("✅ API Server started on port 8081")
