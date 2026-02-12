from aiohttp import web
from urllib.parse import quote_plus
import traceback

from info import BIN_CHANNEL, URL
from Lucia.Bot import SilentX
from Lucia.util.file_properties import get_name, get_hash
from itsdangerous import URLSafeSerializer


SECRET_KEY = "SUPER_SECRET_KEY_CHANGE_THIS"
serializer = URLSafeSerializer(SECRET_KEY)


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



async def start_api_server():
    app = web.Application()
    app.router.add_get(
        "/stream/{channel_id}/{message_id}",
        streamfile_api
    )

    runner = web.AppRunner(app)
    await runner.setup()

    # 🔹 USE A DIFFERENT PORT
    site = web.TCPSite(runner, "0.0.0.0", 8081)
    await site.start()

    print("✅ API Server started on port 8081")
