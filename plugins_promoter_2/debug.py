import asyncio
import os
import sys

# Ensure root directory is in path so configX1 can be found
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from pyrogram import Client, filters
from pyrogram.errors import UserNotParticipant

import configX1 as cfg
import xdatamodifyteraconfig as tera_cfg
import aiohttp
import random as rnd

# API settings from tera config
SEARCH_API = getattr(tera_cfg, "SEARCH_API", "https://playterabox.com/api/search-videos")
G3_BASE = getattr(tera_cfg, "G3_BASE", "https://playtera.in/?t=")
KEYWORDS = getattr(tera_cfg, "KEYWORDS", ["latest", "viral", "trending"])

# Use the same logic as modifybot1tera to format captions/buttons
def extract_code(url: str) -> str:
    from urllib.parse import urlparse
    return urlparse(url).path.split("/s/")[-1]

def g3link(url: str) -> str:
    return G3_BASE + extract_code(url)

def get_caption(v: dict) -> str:
    return (
        f"🎬 **{v.get('title', 'N/A')}**\n\n"
        f"📂 {v.get('category', 'N/A')}\n"
        f"📏 {v.get('file_size', 'N/A')} | ⏱ {v.get('duration', 'N/A')}\n"
        f"🎞 Quality: {v.get('quality', 'N/A')}\n\n"
        f"👇 Choose option below"
    )

def get_buttons(video_url: str):
    from pyrogram.types import InlineKeyboardMarkup, InlineKeyboardButton
    link = g3link(video_url)
    return InlineKeyboardMarkup([[InlineKeyboardButton("▶ Watch", url=link)]])

async def fetch_videos(limit=2):
    word = rnd.choice(KEYWORDS)
    params = {"q": word, "limit": limit, "offset": rnd.randint(0, 50)}
    async with aiohttp.ClientSession() as s:
        try:
            async with s.get(SEARCH_API, params=params, timeout=15) as r:
                if r.status == 200:
                    data = await r.json()
                    return data.get("data", [])
        except Exception as e:
            print(f"Fetch error in plugin: {e}")
    return []

# ─── STATE TRACKING ──────────────────────────────────────
# States per user:
#   "pending"   → flow started, waiting to send "hi"
#   "hi_sent"   → "hi" was sent, waiting to send join link
#   "link_sent" → join link sent, waiting for 24h check
#   "done"      → user joined, nothing more to do
#   "silent"    → user never joined, delete all their messages
user_state: dict[int, str] = {}

# Store bot's last sent message_id per user (so we can delete it later)
user_bot_msg: dict[int, int] = {}

# ─── HELPERS ─────────────────────────────────────────────

async def safe_delete(client, chat_id, msg_id):
    try:
        await client.delete_messages(chat_id, msg_id)
    except Exception:
        pass

async def auto_delete_msg(client, chat_id, msg_id, delay):
    await asyncio.sleep(delay)
    await safe_delete(client, chat_id, msg_id)

async def is_member(client, user_id):
    """Return True if user_id is a member of CHANNEL_USERNAME."""
    try:
        member = await client.get_chat_member(cfg.CHANNEL_USERNAME, user_id)
        return member is not None
    except UserNotParticipant:
        return False
    except Exception as e:
        # print(f"is_member error: {e}")
        return False

# ─── MAIN FLOW ───────────────────────────────────────────

async def run_user_flow(client, chat_id, user_id):
    """Full sequential flow for a new user."""

    # ── STEP 1: Wait 2 min, send 2 videos, then send "hi" ─────
    user_state[user_id] = "pending"
    
    # Send 2 pictures during the first 2 minutes
    videos = await fetch_videos(limit=2)
    for v in videos:
        try:
            image = v.get("image_url")
            if image:
                pic_msg = await client.send_photo(chat_id, photo=image)
                # Auto-delete after 15 minutes
                asyncio.create_task(auto_delete_msg(client, chat_id, pic_msg.id, 15 * 60))
            
            await asyncio.sleep(2) # small gap between pics
        except Exception as e:
            print(f"Picture send error: {e}")

    # Wait remaining time (approx 2 mins total)
    await asyncio.sleep(max(1, cfg.DELAY_BEFORE_HI - 5))

    try:
        hi_msg = await client.send_message(chat_id, "hi")
        user_bot_msg[user_id] = hi_msg.id
        user_state[user_id] = "hi_sent"
    except Exception as e:
        print(f"Failed to send hi: {e}")
        user_state.pop(user_id, None)
        return

    # ── STEP 2: Wait 2 min, then send join link ────────────────
    await asyncio.sleep(cfg.DELAY_BEFORE_LINK)

    join_text = cfg.JOIN_MESSAGE.format(JOIN_LINK=cfg.JOIN_LINK)
    try:
        # Delete the "hi" message first
        await safe_delete(client, chat_id, user_bot_msg.get(user_id))

        link_msg = await client.send_message(chat_id, join_text, disable_web_page_preview=False)
        user_bot_msg[user_id] = link_msg.id
        user_state[user_id] = "link_sent"
    except Exception as e:
        print(f"Failed to send join link: {e}")
        user_state.pop(user_id, None)
        return

    # ── STEP 3: Wait 24 hours, then check membership ─────
    await asyncio.sleep(cfg.DELAY_NEXT_CHECK)

    joined = await is_member(client, user_id)

    if joined:
        # ✅ User has joined — all good
        user_state[user_id] = "done"
        print(f"[XBot1] User {user_id} joined ✅ — done")
    else:
        # ❌ User has NOT joined — remind and silence
        user_state[user_id] = "silent"

        # Delete previous link message, then re-send
        await safe_delete(client, chat_id, user_bot_msg.get(user_id))

        try:
            remind_msg = await client.send_message(chat_id, join_text, disable_web_page_preview=False)
            user_bot_msg[user_id] = remind_msg.id
            print(f"[XBot1] User {user_id} did NOT join ❌ — re-sent link, now silencing")
        except Exception as e:
            print(f"[XBot1] Failed to re-send link: {e}")

        # All future messages from this user will be silently deleted (see handler below)


# ─── EVENT HANDLER ───────────────────────────────────────

@Client.on_message(filters.private & ~filters.me)
async def pm_auto_reply(client, message):
    user_id = message.from_user.id
    state = user_state.get(user_id)

    # ── Silent mode: user reminded but never joined ───────
    if state == "silent":
        await safe_delete(client, message.chat.id, message.id)
        return

    # ── Flow already running or done — ignore new messages ─
    if state in ("pending", "hi_sent", "link_sent", "done"):
        await safe_delete(client, message.chat.id, message.id)
        return

    # ── Brand new user: start flow ─────
    user_state[user_id] = "pending"
    asyncio.create_task(run_user_flow(client, message.chat.id, user_id))
    print(f"[XBot1] New user {user_id} — flow started")
