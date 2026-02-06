from aiohttp import web
from urllib.parse import quote_plus
import traceback

from info import BIN_CHANNEL, URL
from Lucia.Bot import SilentX
from Lucia.util.file_properties import get_name, get_hash

# =========================
# API ROUTES (FIRST)
# =========================
api_routes = web.RouteTableDef()


@api_routes.get("/api/streamfile/{file_id}")
async def streamfile_api(request):
    try:
        file_id = request.match_info.get("file_id")
        if not file_id:
            return web.json_response(
                {"status": "error", "message": "file_id missing"},
                status=400
            )

        print("API HIT | file_id =", file_id)

        silent_msg = await SilentX.send_cached_media(
            chat_id=BIN_CHANNEL,
            file_id=file_id
        )

        name = get_name(silent_msg) or "file"
        stream_url = (
            f"{URL}watch/{silent_msg.id}/"
            f"{quote_plus(name)}?hash={get_hash(silent_msg)}"
        )

        return web.json_response({
            "status": "success",
            "stream": stream_url
        })

    except BaseException as e:
        traceback.print_exc()
        return web.json_response(
            {"status": "error", "message": str(e)},
            status=500
        )


# =========================
# WEB SERVER
# =========================
async def web_server():
    app = web.Application()

    # 1️⃣ REGISTER API ROUTES FIRST
    app.add_routes(api_routes)

    # 2️⃣ REGISTER STREAM / BYTESTREAMER ROUTES AFTER
    from plugins import route
    app.add_routes(route.routes)

    return app
