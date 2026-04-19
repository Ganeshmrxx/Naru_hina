import asyncio
import random as rnd
import os
import sys
import re

# Ensure root directory is in path to find xdatamodifyteraconfig
sys.path.append(os.getcwd())

from pymongo import MongoClient
import aiohttp
import math
import base64
from urllib.parse import urlparse
from pyrogram import Client, filters
from pyrogram.types import (
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    CallbackQuery
)
from pyrogram.errors import BadRequest

try:
    import xdatamodifyteraconfig as cfg
except ImportError:
    # Fallback/dummy config if not found (shouldn't happen in production)
    class cfg:
        DATABASE_URI = "mongodb+srv://test:test05@cluster0.g05zxpa.mongodb.net/?retryWrites=true&w=majority"
        DATABASE_NAME = "Cluster0"
        SEARCH_API = "https://playterabox.com/api/search-videos"
        G3_BASE = "https://playtera.in/?t="
        LIMIT = 10
        AUTO_LIMIT = 5
        KEYWORDS = ["oyo", "latest", "viral"]
        TARGET_CHANNELS = []
        OFFSET_FILE = "tera_offset.txt"
        AUTO_DELETE_DELAY = 1200 
        AUTO_SEND_DELAY = 1800 
        SEARCH_COOLDOWN = 120 
        WELCOME_MSG = "hii baby lo kuch video dekho or hilao 😈🔥"

# Track user search times to enforce cooldown
user_search_times = {}

# MongoDB Setup
DATABASE_URI = cfg.DATABASE_URI
DATABASE_NAME = cfg.DATABASE_NAME

client_mongo = MongoClient(DATABASE_URI)
db = client_mongo[DATABASE_NAME]
xchannels = db["terabotsearch"]

SEARCH_API = cfg.SEARCH_API
G3_BASE = cfg.G3_BASE
LIMIT = cfg.LIMIT
AUTO_LIMIT = cfg.AUTO_LIMIT

async def auto_delete(client, chat_id, message_id, delay=10):
    await asyncio.sleep(delay)
    try:
        await client.delete_messages(chat_id, message_id)
    except Exception:
        pass

async def disable_buttons(cq):
    try:
        await cq.message.edit_reply_markup(reply_markup=None)
    except Exception:
        pass

def encodecode(url: str) -> str:
    return base64.urlsafe_b64encode(url.encode()).decode()

def g3link(url: str, username: str = None) -> str:
    user = username if username else "annymous"
    return f"{G3_BASE}{encodecode(url)}&username={user}"

def caption(v: dict) -> str:
    return (
        f"🎬 **{v.get('title', 'N/A')}**\n\n"
        f"📂 {v.get('category', 'N/A')}\n"
        f"📏 {v.get('file_size', 'N/A')} | ⏱ {v.get('duration', 'N/A')}\n"
        f"🎞 Quality: {v.get('quality', 'N/A')}\n\n"
        f"👇 Choose option below"
    )

def action_buttons(video_url: str):
    link = g3link(video_url)
    join_link = "https://t.me/muvibots"
    share_text = "I got this awesome channel join and enjoy https://t.me/muvibots"
    import urllib.parse
    encoded_text = urllib.parse.quote(share_text)
    encoded_url = urllib.parse.quote(join_link)
    
    # Links for sharing
    tg_share = f"https://t.me/share/url?url={encoded_url}&text={encoded_text}"
    wa_share = f"https://api.whatsapp.com/send?text={encoded_text}"

    return InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton("▶ Watch", url=link),
                InlineKeyboardButton("🎬 Join MOVIE", url=join_link),
            ],
            [
                InlineKeyboardButton("✈️ Share on Telegram", url=tg_share),
                InlineKeyboardButton("🟢 Share on WhatsApp", url=wa_share),
            ]
        ]
    )

def pagination_buttons(query: str, page: int, total_count: int):
    total_pages = math.ceil(total_count / LIMIT)
    row = []

    if page > 1:
        row.append(
            InlineKeyboardButton("⬅ Prev", callback_data=f"page|{query}|{page-1}")
        )

    start = max(1, page - 1)
    end = min(total_pages, start + 3)

    for p in range(start, end + 1):
        if p == page:
            row.append(InlineKeyboardButton(f"• {p} •", callback_data="noop"))
        else:
            row.append(
                InlineKeyboardButton(str(p), callback_data=f"page|{query}|{p}")
            )

    if page < total_pages:
        row.append(
            InlineKeyboardButton("Next ➡", callback_data=f"page|{query}|{page+1}")
        )

    return InlineKeyboardMarkup([row])

async def fetch_raw(query: str, offset: int, limit: int = LIMIT):
    params = {
        "q": query,
        "limit": limit,
        "offset": offset
    }

    async with aiohttp.ClientSession() as s:
        try:
            async with s.get(SEARCH_API, params=params, timeout=20) as r:
                if r.status == 200:
                    data = await r.json()
                    res = data.get("data", [])
                    total = data.get("totalCount", 0)
                    if res:
                        return res, total
        except Exception as e:
            print(f"Fetch error: {e}")
            
        # Fallback if query returns nothing
        fallback_words = cfg.KEYWORDS
        f_word = rnd.choice(fallback_words)
        params["q"] = f_word
        try:
            async with s.get(SEARCH_API, params=params, timeout=20) as r2:
                if r2.status == 200:
                    data = await r2.json()
                    return data.get("data", []), data.get("totalCount", 0)
        except Exception as e:
            print(f"Fallback fetch error: {e}")

    return [], 0

async def fetch(query: str, page: int):
    offset = (page - 1) * LIMIT
    return await fetch_raw(query, offset, LIMIT)

async def safe_send_video(client, chat_id, v, auto_del=True):
    text = caption(v)
    link = v["url"]
    
    markup = action_buttons(link)
    image = v.get("image_url")

    sent_msg = None
    if image:
        try:
            sent_msg = await client.send_photo(
                chat_id,
                photo=image,
                caption=text,
                reply_markup=markup
            )
        except BadRequest as e:
            print(f"[SKIP IMAGE] {image} | {e}")

    if not sent_msg:
        sent_msg = await client.send_message(
            chat_id,
            text,
            reply_markup=markup,
            disable_web_page_preview=True
        )
    
    if sent_msg and auto_del:
        # 30-minute delay for everything auto-deleted
        delay = getattr(cfg, "AUTO_DELETE_DELAY", 1800)
        asyncio.create_task(auto_delete(client, chat_id, sent_msg.id, delay=delay))

# ======================
# AUTO SEND LOGIC
# ======================

def get_offset():
    if not os.path.exists(cfg.OFFSET_FILE):
        return 0
    try:
        with open(cfg.OFFSET_FILE, "r") as f:
            return int(f.read().strip())
    except:
        return 0

def save_offset(offset):
    with open(cfg.OFFSET_FILE, "w") as f:
        f.write(str(offset))

async def clear_channel_history(client, chat_id):
    """Delete all messages in a channel to clear history before new batch."""
    deleted = 0
    try:
        msg_ids = []
        async for msg in client.get_chat_history(chat_id, limit=100):
            msg_ids.append(msg.id)
            if len(msg_ids) >= 100:
                await client.delete_messages(chat_id, msg_ids)
                deleted += len(msg_ids)
                msg_ids = []
                await asyncio.sleep(1)
        if msg_ids:
            await client.delete_messages(chat_id, msg_ids)
            deleted += len(msg_ids)
        print(f"🗑 Cleared {deleted} messages from {chat_id}")
    except Exception as e:
        print(f"⚠️ Clear history failed for {chat_id}: {e}")

async def auto_send_task(client):
    print("🚀 Starting auto send task for Terabox Search Bot")
    while True:
        try:
            offset = get_offset()
            print(f"🔄 Auto-sending videos with offset: {offset}")
            
            for target_id in cfg.TARGET_CHANNELS:
                word = rnd.choice(cfg.KEYWORDS)
                print(f"🔍 Fetching for {target_id} with word: {word}")
                
                results, _ = await fetch_raw(word, offset, cfg.AUTO_LIMIT)
                
                if results:
                    # 🗑 Clear all previous messages before posting new batch
                    await clear_channel_history(client, target_id)
                    await asyncio.sleep(2)

                    for v in results:
                        # No auto-delete: next cycle's clear_history handles cleanup
                        await safe_send_video(client, target_id, v, auto_del=False)
                        await asyncio.sleep(2) # delay between videos
                    print(f"✅ Sent {len(results)} videos to {target_id}")
                else:
                    print(f"⚠️ No results for word: {word}")
            
            # Increment offset for next round
            save_offset(offset + 1)
            
        except Exception as e:
            print(f"❌ Error in auto_send_task: {e}")
            
        # Wait for next cycle (30 minutes)
        await asyncio.sleep(cfg.AUTO_SEND_DELAY)

# ======================
# NEW MEMBER WELCOME
# ======================

@Client.on_message(filters.new_chat_members)
async def welcome_new_member(client, message):
    chat_id = message.chat.id

    # 🗑 Delete the "X joined the group" service message
    try:
        await message.delete()
    except Exception:
        pass

    for new_user in message.new_chat_members:
        if new_user.is_bot:
            continue  # skip bots joining

        welcome_msg = getattr(cfg, "WELCOME_MSG", "hii baby lo kuch video dekho or hilao 😈🔥")

        # Send the welcome text (no auto-delete)
        try:
            await client.send_message(chat_id, welcome_msg)
        except Exception as e:
            print(f"[Welcome] Failed to send greeting: {e}")
            continue

        # Pick a random keyword and fetch 5 videos
        word = rnd.choice(cfg.KEYWORDS)
        print(f"[Welcome] New member in {message.chat.title} — fetching '{word}'")
        results, _ = await fetch_raw(word, offset=rnd.randint(0, 50), limit=5)

        for v in results:
            try:
                # No auto-delete: auto_send_task will clear channel on next cycle
                await safe_send_video(client, chat_id, v, auto_del=False)
                await asyncio.sleep(1)
            except Exception as e:
                print(f"[Welcome] Failed to send video: {e}")


@Client.on_message(filters.service)
async def service_cleanup(client, message):
    # Delete all other service messages (left_chat_member, pinned, etc.)
    # but NOT new_chat_members — handled above
    try:
        if not message.new_chat_members:
            await message.delete()
    except Exception:
        pass

@Client.on_message((filters.text | filters.caption) & (filters.private | filters.group) & filters.regex(r"https?://\S*tera\S*"))
async def terabox_modifier(client, message):
    text = message.text or message.caption
    # Extract links containing 'tera'
    links = re.findall(r"https?://\S*tera\S*", text)
    if not links:
        return

    username = message.from_user.username if message.from_user and message.from_user.username else "annymous"
    
    for link in links:
        m_link = g3link(link, username)
        await client.send_message(
            message.chat.id,
            f"**Modified Your Link:**\n`{m_link}`",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("Watch", url=m_link)]
            ])
        )
    
    try:
        await message.delete()
    except:
        pass
    
    message.stop_propagation()

@Client.on_message(filters.text & (filters.private | filters.group))
async def search_handler(client, message):
    user_id = message.from_user.id
    current_time = asyncio.get_event_loop().time()
    
    # 🕒 Check per-user search cooldown
    if user_id in user_search_times:
        last_search = user_search_times[user_id]
        remain = cfg.SEARCH_COOLDOWN - (current_time - last_search)
        if remain > 0:
            m_wait = await message.reply_text(f"⏳ **Cooldown active!**\n\nPlease wait `{int(remain)}` more seconds before searching again.")
            asyncio.create_task(auto_delete(client, message.chat.id, m_wait.id, delay=10))
            asyncio.create_task(auto_delete(client, message.chat.id, message.id, delay=10))
            return

    # Update last search time
    user_search_times[user_id] = current_time

    query = message.text.strip()
    asyncio.create_task(auto_delete(client, message.chat.id, message.id, delay=10))

    if len(query) < 2:
        m = await message.reply_text("❌ Send a valid keyword")
        asyncio.create_task(auto_delete(client, message.chat.id, m.id, delay=10))
        return

    m_search = await message.reply_text("🔍 Searching…")
    asyncio.create_task(auto_delete(client, message.chat.id, m_search.id, delay=10))

    results, total = await fetch(query, page=1)

    if not results:
        m_no = await message.reply_text("❌ No results found after fallback")
        asyncio.create_task(auto_delete(client, message.chat.id, m_no.id, delay=10))
        return

    for v in results:
        await safe_send_video(client, message.chat.id, v)

    m_page = await message.reply_text(
        f"📄 Page 1 for '{query}'",
        reply_markup=pagination_buttons(query, 1, total)
    )
    asyncio.create_task(auto_delete(client, message.chat.id, m_page.id, delay=cfg.AUTO_DELETE_DELAY))

# ======================
# PAGE CALLBACK
# ======================

@Client.on_callback_query(filters.regex("^page\\|"))
async def page_handler(client, cq):
    _, query, page = cq.data.split("|")
    page = int(page)
    await disable_buttons(cq)
    await cq.answer("Loading…", show_alert=False)

    results, total = await fetch(query, page)

    if not results:
        m_no = await client.send_message(
            cq.message.chat.id,
            f"❌ No results found for page {page}\n\n🔁 Try again",
            reply_markup=pagination_buttons(query, page, total or (page * LIMIT))
        )
        asyncio.create_task(auto_delete(client, cq.message.chat.id, m_no.id, delay=10))
        return

    for v in results:
        await safe_send_video(client, cq.message.chat.id, v)

    m_page = await client.send_message(
        cq.message.chat.id,
        f"📄 Page {page}",
        reply_markup=pagination_buttons(query, page, total)
    )
    asyncio.create_task(auto_delete(client, cq.message.chat.id, m_page.id, delay=cfg.AUTO_DELETE_DELAY))

@Client.on_callback_query(filters.regex("^noop$"))
async def noop(_, cq):
    await cq.answer("Current page", show_alert=False)