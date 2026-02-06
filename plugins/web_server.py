from aiohttp import web
from urllib.parse import quote_plus
from info import BIN_CHANNEL, URL
from utils import get_name, get_hash
from Lucia.Bot import SilentX
from database.users_chats_db import db
from urllib.parse import quote_plus
from Lucia.util.file_properties import get_name, get_hash, get_media_file_size
from database.topdb import silentdb

async def streamfile_api(request):
    try:
        file_id = request.match_info.get("file_id")
        print("API HIT | file_id =", file_id)

        silent_msg = await SilentX.send_cached_media(
            chat_id=BIN_CHANNEL,
            file_id=file_id
        )

        print("MEDIA SENT | msg_id =", silent_msg.id)

        try:
            name = get_name(silent_msg)
        except Exception as e:
            name = "unknown_file"
            print("get_name ERROR:", e)

        stream_url = f"{URL}watch/{silent_msg.id}/{name}?hash={get_hash(silent_msg)}"

        return web.json_response({
            "status": "success",
            "stream": stream_url
        })

    except Exception as e:
        print("API CRASH:", repr(e))
        return web.json_response(
            {
                "status": "error",
                "error_type": type(e).__name__,
                "message": str(e)
            },
            status=500
        )



async def web_server():
    app = web.Application()

    # 🔗 API route
    app.router.add_get(
        "/api/streamfile/{file_id}",
        streamfile_api
    )

    return app
