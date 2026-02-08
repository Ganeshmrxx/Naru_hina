from aiohttp import web
from urllib.parse import quote_plus
import traceback

from info import BIN_CHANNEL, URL
from Lucia.Bot import SilentX
from Lucia.util.file_properties import get_name, get_hash


async def streamfile_api(request):
    try:
        channel_id = int(request.match_info.get("channel_id"))
        message_id = int(request.match_info.get("message_id"))

        print("API HIT | channel:", channel_id, "message:", message_id)

        # 🔹 Fetch message directly
        msg = await SilentX.get_messages(
            chat_id=channel_id,
            message_ids=message_id
        )

        if not msg or not msg.media:
            return web.json_response(
                {"status": "error", "message": "Media not found"},
                status=404
            )

        name = get_name(msg) or "file"

        stream_url = (
            f"{URL}{msg.id}/"
            f"{quote_plus(name)}?hash={get_hash(msg)}"
        )

        return web.json_response({
            "status": "success",
            "channel_id": channel_id,
            "message_id": message_id,
            "stream": stream_url
        })

    except BaseException as e:
        traceback.print_exc()
        return web.json_response(
            {"status": "error", "message": str(e)},
            status=500
        )




async def start_api_server():
    app = web.Application()
    app.router.add_get(
        "/stream/{channel_id}/{message_id}",
        stream_by_message
    )

    runner = web.AppRunner(app)
    await runner.setup()

    # 🔹 USE A DIFFERENT PORT
    site = web.TCPSite(runner, "0.0.0.0", 8081)
    await site.start()

    print("✅ API Server started on port 8081")
