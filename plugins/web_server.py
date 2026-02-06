from aiohttp import web
from urllib.parse import quote_plus
import traceback

from info import BIN_CHANNEL, URL
from Lucia.Bot import SilentX
from Lucia.util.file_properties import get_name, get_hash


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

    except BaseException:
        traceback.print_exc()
        return web.json_response(
            {"status": "error", "message": "Internal error"},
            status=500
        )



async def start_api_server():
    app = web.Application()
    app.router.add_get("/api/streamfile/{file_id}", streamfile_api)

    runner = web.AppRunner(app)
    await runner.setup()

    # 🔹 USE A DIFFERENT PORT
    site = web.TCPSite(runner, "0.0.0.0", 8081)
    await site.start()

    print("✅ API Server started on port 8081")
