from aiohttp import web
from urllib.parse import quote_plus
from info import BIN_CHANNEL, URL
from Lucia.Bot import SilentX
from Lucia.util.file_properties import get_name, get_hash
import traceback


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
        stream_url = f"{URL}watch/{silent_msg.id}/{quote_plus(name)}?hash={get_hash(silent_msg)}"

        return web.json_response({
            "status": "success",
            "stream": stream_url
        })

    except BaseException as e:  # 🔥 IMPORTANT
        print("API CRASH:")
        traceback.print_exc()

        return web.json_response(
            {
                "status": "error",
                "type": type(e).__name__,
                "message": str(e)
            },
            status=500
        )
