import os
from aiohttp import web
from .route import routes
from asyncio import sleep 
from datetime import datetime, timedelta
from database.users_chats_db import db
from info import PREMIUM_LOGS, URL
import aiohttp
import asyncio
from logging_helper import LOGGER

from .web_server import streamfile_api, search_api

API_PORT = int(os.environ.get("API_PORT", 8081))

async def proxy_to_fastapi(request: web.Request):
    """Transparently proxy any /api/* request from Koyeb port 8080 to FastAPI on port 8081."""
    if request.method == "OPTIONS":
        return web.Response(
            status=200,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
                "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Origin, X-Requested-With",
                "Access-Control-Max-Age": "86400",
            }
        )
    
    target_url = f"http://127.0.0.1:{API_PORT}{request.rel_url}"
    headers = {k: v for k, v in request.headers.items() if k.lower() not in ("host", "content-length")}
    body = await request.read()
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.request(
                method=request.method,
                url=target_url,
                headers=headers,
                data=body,
                allow_redirects=False,
                timeout=aiohttp.ClientTimeout(total=60)
            ) as resp:
                resp_data = await resp.read()
                resp_headers = {
                    k: v for k, v in resp.headers.items()
                    if k.lower() not in ("transfer-encoding", "content-encoding", "content-length")
                }
                resp_headers["Access-Control-Allow-Origin"] = "*"
                resp_headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
                resp_headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type, Accept, Origin, X-Requested-With"
                return web.Response(body=resp_data, status=resp.status, headers=resp_headers)
    except Exception as e:
        LOGGER.error(f"[FASTAPI PROXY ERROR] {e}")
        return web.json_response(
            {"detail": f"Backend proxy error: {str(e)}"},
            status=502,
            headers={"Access-Control-Allow-Origin": "*"}
        )

async def health_check(request: web.Request):
    return web.json_response({"status": "ok", "service": "Naru_hina & AllForward"})

async def web_server():
    web_app = web.Application(client_max_size=30000000)
    # 1. Health check for Koyeb
    web_app.router.add_get("/health", health_check)
    # 2. Reverse proxy for AllForward FastAPI admin APIs
    web_app.router.add_route("*", "/api/{tail:.*}", proxy_to_fastapi)
    # 3. Stream routes
    web_app.router.add_get("/stream/{channel_id}/{message_id}", streamfile_api)
    # 4. Standard bot routes
    web_app.add_routes(routes)
    return web_app

REMINDER_TIMES = [
    ("10m", timedelta(minutes=10))
]

# Premium Reminder Expired ( This Code Modified By @BOT_OWNER26)
async def check_expired_premium(client):
    while True:
        now = datetime.utcnow()
        expired_users = await db.get_expired(now)
        for user in expired_users:
            user_id = user["id"]
            await db.remove_premium_access(user_id)
            unset_flags = {f"reminder_{label}_sent": "" for label, _ in REMINDER_TIMES}
            await db.users.update_one({"id": user_id}, {"$unset": unset_flags})
            try:
                tg_user = await client.get_users(user_id)
                await client.send_message(
                    user_id,
                    f"<b>ʜᴇʏ {tg_user.mention},\n\nʏᴏᴜʀ ᴘʀᴇᴍɪᴜᴍ ᴀᴄᴄᴇss ʜᴀs ᴇxᴘɪʀᴇᴅ.\n\nTᴀᴘ /plan ꜰᴏʀ ʀᴇɴᴇᴡᴀʟ ᴏᴘᴛɪᴏɴs.</b>"
                )
                await client.send_message(
                    PREMIUM_LOGS,
                    f"<b>#Premium_Expired\nUser: {tg_user.mention}\nID: <code>{user_id}</code></b>"
                )
            except Exception as e:
                LOGGER.error(f"[EXPIRED ERROR] {e}")
            await sleep(0.5)
        for label, delta in REMINDER_TIMES:
            reminder_users = await db.get_expiring_soon(label, delta)
            for user in reminder_users:
                user_id = user["id"]
                try:
                    tg_user = await client.get_users(user_id)
                    await client.send_message(
                        user_id,
                        f"<b>ʜᴇʏ {tg_user.mention},\n\nʏᴏᴜʀ ᴘʀᴇᴍɪᴜᴍ ᴡɪʟʟ ᴇxᴘɪʀᴇ ɪɴ {label}.\nTᴀᴘ /plan ᴛᴏ ʀᴇɴᴇᴡ ɴᴏᴡ!</b>"
                    )
                    await client.send_message(
                        PREMIUM_LOGS,
                        f"<b>#Reminder ({label})\nUser: {tg_user.mention}\nID: <code>{user_id}</code></b>"
                    )
                except Exception as e:
                    LOGGER.error(f"[REMINDER ERROR] {e}")
                await sleep(0.5)
        await sleep(1)
