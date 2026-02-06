from aiohttp import web
from urllib.parse import quote_plus
from info import BIN_CHANNEL, URL
from utils import get_name, get_hash
from Lucia.Bot import SilentX
from database.users_chats_db import db


async def streamfile_api(request):
    file_id = request.match_info["file_id"]
    user_id = request.query.get("user_id")

    if user_id:
        if not await db.has_premium_access(int(user_id)):
            return web.json_response(
                {"status": "error", "message": "Premium required"},
                status=403
            )

    silent_msg = await SilentX.send_cached_media(
        chat_id=BIN_CHANNEL,
        file_id=file_id
    )

    file_name = quote_plus(get_name(silent_msg))

    stream_url = f"{URL}watch/{silent_msg.id}/{file_name}?hash={get_hash(silent_msg)}"
    download_url = f"{URL}{silent_msg.id}/{file_name}?hash={get_hash(silent_msg)}"

    return web.json_response({
        "status": "success",
        "stream": stream_url,
        "download": download_url
    })



async def web_server():
    app = web.Application()

    # 🔗 API route
    app.router.add_get(
        "/api/streamfile/{file_id}",
        streamfile_api
    )

    return app
