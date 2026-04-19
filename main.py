import asyncio
import random

# Fix for "RuntimeError: There is no current event loop" in newer Python versions
try:
    asyncio.get_event_loop()
except RuntimeError:
    asyncio.set_event_loop(asyncio.new_event_loop())

from pyrogram.enums import ChatType

from GeneralDataModifierBot import GeneralDataModifierBot
from TeraBoxModifierBot import TeraBoxModifierBot
from MovieForwarderBot import MovieForwarderBot
from BackupForwarderBot import BackupForwarderBot
from PromotionSpamBot1 import PromotionSpamBot1
from PromotionSpamBot2 import PromotionSpamBot2

import time
from datetime import datetime, timedelta, date

from pymongo import MongoClient
from pyrogram import Client
from pyrogram.enums import ChatType
from pyrogram.errors import FloodWait, Forbidden, ChannelPrivate, ChatWriteForbidden
import requests


TARGET_CHANNEL_ID = -1003660252652  # archive / DB channel
STATUS_CHAT_ID = "me"  # your user ID or log channel

MIN_DELAY = 1
MAX_DELAY = 4
STATUS_UPDATE_EVERY = 50
SCAN_INTERVAL = timedelta(hours=6)

# MongoDB Setup
DATABASE_URI = "mongodb+srv://g3cwork_db_user:g312345@cluster0.lpmpcya.mongodb.net/?retryWrites=true&w=majority"
DATABASE_NAME = "Cluster0"

mongo = MongoClient(DATABASE_URI)
db = mongo[DATABASE_NAME]

chats_col = db["chats"]
progress_col = db["forward_progress"]
media_col = db["media_store"]
summary_col = db["daily_summary"]

FORWARD_LOCK = False


# =========================
# DB HELPERS
# =========================
async def safe_leave_chat(bot, chat_id):
    try:
        await bot.leave_chat(chat_id)
    except ChannelPrivate:
        # Can't leave what you can't access
        pass
    except Forbidden:
        pass
    except Exception as e:
        print("leave_chat failed:", e)

def save_chat(chat, added_by="userbot"):
    chats_col.update_one(
        {"chat_id": chat.id},
        {"$setOnInsert": {
            "chat_id": chat.id,
            "title": chat.title,
            "type": chat.type.value,
            "status": "pending",
            "last_scan": None,
            "added_by": added_by
        }},
        upsert=True
    )


async def handle_restricted_chat(bot2, chat, reason):
    print(f"🚫 Restricted forwarding: {chat.title} ({reason})")

    await bot2.send_message(
        STATUS_CHAT_ID,
        f"🚫 **Forwarding Blocked**\n\n"
        f"📌 {chat.title}\n"
        f"⚠ Reason: `{reason}`"
    )

    await safe_leave_chat(bot2, chat.id)
    delete_chat_from_db(chat.id)


from pyrogram.enums import ChatMemberStatus


def has_terabox_word(text: str | None) -> bool:
    return bool(text) and "terabox" in text.lower()

async def is_me_admin(bot, chat_id):
    try:
        member = await bot.get_chat_member(chat_id, "me")
        return member.status in (
            ChatMemberStatus.ADMINISTRATOR,
            ChatMemberStatus.OWNER
        )
    except Exception:
        return False

def delete_chat_from_db(chat_id):
    chats_col.delete_one({"chat_id": chat_id})
    progress_col.delete_one({"chat_id": chat_id})
    media_col.delete_many({"channel_id": chat_id})
    print(f"🗑️ Deleted chat {chat_id} from DB")


def get_last_msg(chat_id):
    doc = progress_col.find_one({"chat_id": chat_id})
    return doc["last_msg_id"] if doc else 0


def save_progress(chat_id, msg_id):
    progress_col.update_one(
        {"chat_id": chat_id},
        {"$set": {"last_msg_id": msg_id}},
        upsert=True
    )


def mark_scan_done(chat_id):
    chats_col.update_one(
        {"chat_id": chat_id},
        {"$set": {
            "status": "done",
            "last_scan": datetime.utcnow()
        }}
    )


def get_next_chat():
    now = datetime.utcnow()

    chat = chats_col.find_one({"status": "pending"})
    if chat:
        return chat

    for chat in chats_col.find({"status": "done"}):
        last_scan = chat.get("last_scan")
        if not last_scan or now - last_scan >= SCAN_INTERVAL:
            chats_col.update_one(
                {"chat_id": chat["chat_id"]},
                {"$set": {"status": "pending"}}
            )
            return chat

    return None


async def preload_dialogsx(bot):
    print("🔄 Preloading dialogs...")

    async for dialog in bot.get_dialogs():
        chat = dialog.chat

        if chat.type not in (ChatType.CHANNEL, ChatType.GROUP, ChatType.SUPERGROUP):
            continue

        try:
            await asyncio.sleep(1.5)

            if chat.is_restricted:
                await safe_leave_chat(bot, chat.id)

                delete_chat_from_db(chat.id)
                continue

            await bot.get_chat(chat.id)

            # 🚫 IF YOU ARE ADMIN → SKIP & DELETE
            if await is_me_admin(bot, chat.id):
                print(f"🚫 Admin channel skipped: {chat.title}")
                delete_chat_from_db(chat.id)
                continue

            # ✅ Normal channel → save
            save_chat(chat)
            print(f"✅ OK: {chat.title}")

            # Send channel info to YOU
            try:
                await bot.send_message(
                    "me",
                    f"📺 **Channel detected**\n\n"
                    f"📌 {chat.title}\n"
                    f"🆔 `{chat.id}`\n\n"
                    f"Reply `/notnow` to skip forwarding this channel."
                )
            except Exception as e:
                print("Notify failed:", e)

            print(f"✅ OK: {chat.title}")


        except FloodWait as e:
            await asyncio.sleep(e.value + 5)

        except (Forbidden, ChannelPrivate, ChatWriteForbidden):
            try:
                await safe_leave_chat(bot, chat.id)

            finally:
                delete_chat_from_db(chat.id)

        except Exception as e:
            print(f"⚠️ Error in {chat.title}: {e}")

        await asyncio.sleep(0.5)

    print("✅ Preload complete")


# =========================
# COUNT NEW MEDIA
# =========================

async def count_new_media(bot2, chat_id):
    last_msg_id = get_last_msg(chat_id)
    count = 0

    async for msg in bot2.get_chat_history(chat_id, offset_id=last_msg_id):
        if msg.photo or msg.video:
            count += 1

    return count


# =========================
# STATUS MESSAGES
# =========================

async def send_start_status(bot2, chat, total):
    return await bot2.send_message(
        STATUS_CHAT_ID,
        f"🟡 **Scan Started**\n\n"
        f"📌 {chat.title}\n"
        f"📂 New media: `{total}`"
    )


async def update_progress_status(chat , msg, sent, total):
    await msg.edit_text(
        f"🔵 **Forwarding**\n\n"
        f"📌 {chat.title}\n"
        f"📤 `{sent}` / `{total}`"
    )


async def send_complete_status(bot2,msg, chat, sent, start_time):
    t = int(time.time() - start_time)
    m, s = divmod(t, 60)

    await msg.edit_text(
        f"✅ **Completed**\n\n"
        f"📌 {chat.title}\n"
        f"📤 Forwarded: `{sent}`\n"
        f"⏱ {m}m {s}s"
    )


# =========================
# MEDIA & SUMMARY
# =========================

def save_media(msg, chat, target_msg_id):
    media = msg.video or msg.photo

    media_col.update_one(
        {"_id": media.file_id},
        {"$setOnInsert": {
            "_id": media.file_id,
            "channel_id": chat.id,
            "channel_name": chat.title,

            "target_message_id": target_msg_id,
            "media_type": "video" if msg.video else "photo",
            "duration": media.duration if msg.video else None,
            "file_size": media.file_size
        }},
        upsert=True
    )


def update_daily_summary(msg):
    media = msg.video or msg.photo
    today = str(date.today())

    summary_col.update_one(
        {"date": today},
        {"$inc": {
            "total_media": 1,
            "videos": 1 if msg.video else 0,
            "photos": 1 if msg.photo else 0,
            "total_size": media.file_size
        }},
        upsert=True
    )


# =========================
# FORWARD LOGIC
# =========================

async def forward_chat(bot2, chat_id):
    # 🚫 If caption contains "terabox" → ignore channel


    global FORWARD_LOCK
    if FORWARD_LOCK:
        return

    FORWARD_LOCK = True
    start_time = time.time()


    try:
        chat = await bot2.get_chat(chat_id)
        chats_col.update_one({"chat_id": chat_id}, {"$set": {"status": "running"}})
    except Exception as e:
        print(e)
        chats_col.update_one({"chat_id": chat_id}, {"$set": {"status": "done"}})
        FORWARD_LOCK = False
        await auto_runner(bot2)
        return
        
    


    new_count = await count_new_media(bot2, chat_id)
    status_msg = await send_start_status(bot2, chat, new_count)

    if new_count == 0:
        await status_msg.edit_text(f"⚪ No new media\n\n📌 {chat.title}")
        mark_scan_done(chat_id)
        FORWARD_LOCK = False
        return

    sent = 0
    last_msg_id = get_last_msg(chat_id)

    async for msg in bot2.get_chat_history(chat_id, offset_id=last_msg_id):
        if not (msg.photo or msg.video):
            continue

        try:
            if has_terabox_word(msg.caption):
                print(f"🚫 TeraBox detected in {chat.title} → skipping channel")

                await bot2.send_message(
                    STATUS_CHAT_ID,
                    f"🚫 **Channel ignored (contains 'terabox')**\n\n"
                    f"📌 {chat.title}\n"
                    f"🆔 `{chat_id}`"
                )
                delete_chat_from_db(chat_id)


                FORWARD_LOCK = False
                await auto_runner(bot2)

                return

            copied = await msg.copy(
                chat_id=TARGET_CHANNEL_ID,
                caption=f"source = {chat.title}\nchannelid = {chat_id}"

            )

            sent += 1
            save_progress(chat_id, msg.id)
            save_media(msg, chat, copied.id)
            update_daily_summary(msg)

            if sent % STATUS_UPDATE_EVERY == 0:
                await update_progress_status(chat,status_msg, sent, new_count)

            await asyncio.sleep(random.randint(MIN_DELAY, MAX_DELAY))

        except FloodWait as e:
            await asyncio.sleep(e.value + 2)


        except ( ChatWriteForbidden, Forbidden, ChannelPrivate) as e:

            await handle_restricted_chat(bot2,chat, e.__class__.__name__)

            FORWARD_LOCK = False
            await auto_runner(bot2)

            return  # 🚨 STOP this chat immediately


        except Exception as e:
            print("❌ Forward error:", e)
            await asyncio.sleep(2)

    mark_scan_done(chat_id)
    await send_complete_status(bot2, status_msg, chat, sent, start_time)

    FORWARD_LOCK = False
    await auto_runner(bot2)


# =========================
# AUTO RUNNER
# =========================

async def auto_runner(bot2):
    while True:
        if FORWARD_LOCK:
            await asyncio.sleep(5)
            continue

        chat = get_next_chat()
        if not chat:
            await asyncio.sleep(30)
            continue

        await forward_chat(bot2, chat["chat_id"])
        await asyncio.sleep(5)


# =========================
# DAILY REPORT
# =========================

async def daily_report_runner(bot2):
    last_sent = None

    while True:
        today = str(date.today())
        if last_sent != today:
            doc = summary_col.find_one({"date": today})
            if doc:
                await bot2.send_message(
                    STATUS_CHAT_ID,
                    f"📊 **Daily Summary**\n\n"
                    f"📁 Media: `{doc.get('total_media', 0)}`\n"
                    f"🎥 Videos: `{doc.get('videos', 0)}`\n"
                    f"🖼 Photos: `{doc.get('photos', 0)}`\n"
                    f"💾 Size: `{doc.get('total_size', 0) // (1024 * 1024)} MB`"
                
                
                
                )
            last_sent = today

        await asyncio.sleep(3600)


RANDOM_MESSAGES = [
    "Koi hai kya?",
    "Free ho to aa jao!",
    "Kaha ho sab?",
    "Hii guys!",
    "Koi online?",
    "Free videos DM",
    "Free service",
    "Vidos kisko chahiye aajao",
    "Persnal aao kuch dekhna ho to",
    "Blocked ho kya? DM nahi aa pa rhe?",
    "Baat krlo yaar 😂",

    "Admin kaha hai? ghum ho gya? 🤣",
    "Group revive karo koi 😭",
    "Ghost ho sab? 👻",
    "Chalo koi ulta seedha baat kro 😂",
    "Bina message group chalti nahi 😒",
    "Aaj kiska breakup hua? 😜",
    "Koi fight start karo pls 😂",

    "Hello ji 👀",
    "Kaun single h idhar? 😎",
    "Bore ho rahai hoon, koi baat kro.",
    "Mood off h yaar 😔",
    "Koi joke sunao 😂",
    "Selfie bhejo koi 😅",
    "Aaj ka plan kya h?",
    "Aaj kuch spicy bole koi? 😜",
    "Kaun free ho voice call?",
    "Chalo truth & dare chalte hain?",

    "Kya scene h?",
    "Koi active h kya?",
    "Itni shanti kyun hai bhai?",
    "Aaj koi online nahi kya?",
    "Sab so gaye kya?",
    "Kya kr rhe ho sab?",
    "Chalo koi baat kro ❤️",
    "Timepass karlo yaar 😂",
    "Group zinda h ya mar gya? 😭",
    "Koi milo naaa 😅",
]


async def spam_groups(bot, bot_name, min_sec=3600, max_sec=10800):
    """Send random messages to all groups (skip admin groups, leave restricted ones)."""
    await asyncio.sleep(60)  # Initial warmup delay

    while True:
        print(f"[{bot_name}] Starting spam round...")

        try:
            async for dialog in bot.get_dialogs():
                if not dialog:
                    continue

                chat = getattr(dialog, "chat", None)
                if not chat:
                    continue

                chat_id   = getattr(chat, "id", None)
                chat_type = getattr(chat, "type", None)
                chat_title = getattr(chat, "title", "Unknown Chat")

                if chat_id is None or chat_type is None:
                    continue

                # Only groups & supergroups
                if chat_type not in [ChatType.GROUP, ChatType.SUPERGROUP]:
                    continue

                # 🚫 Skip groups where we are admin
                try:
                    if await is_me_admin(bot, chat_id):
                        print(f"[{bot_name}] Skipping (admin): {chat_title}")
                        continue
                except Exception:
                    continue

                msg_text = random.choice(RANDOM_MESSAGES)

                try:
                    sent_msg = await bot.send_message(chat_id, msg_text)
                    print(f"[{bot_name}] Sent → {chat_title}")

                    # 🗑 Auto-delete after 5 minutes
                    async def _auto_delete(cid=chat_id, mid=sent_msg.id, title=chat_title):
                        await asyncio.sleep(300)
                        try:
                            await bot.delete_messages(cid, mid)
                            print(f"[{bot_name}] Deleted in {title}")
                        except Exception as del_e:
                            print(f"[{bot_name}] Delete failed in {title}: {del_e}")

                    asyncio.create_task(_auto_delete())

                    # Small delay between each group message to avoid FloodWait
                    await asyncio.sleep(random.randint(3, 8))

                except FloodWait as fw:
                    print(f"[{bot_name}] FloodWait {fw.value}s in {chat_title}")
                    await asyncio.sleep(fw.value + 5)

                except (ChatWriteForbidden, Forbidden, ChannelPrivate) as e:
                    # 🚪 Leave if we can't send (restricted/banned)
                    print(f"[{bot_name}] Restricted in {chat_title} ({e.__class__.__name__}) → Leaving")
                    try:
                        await bot.leave_chat(chat_id)
                        print(f"[{bot_name}] Left {chat_title}")
                    except Exception as leave_e:
                        print(f"[{bot_name}] Leave failed: {leave_e}")

                except Exception as e:
                    print(f"[{bot_name}] Failed in {chat_title}: {e}")

        except Exception as e:
            print(f"[{bot_name}] Error fetching dialogs: {e}")

        interval = random.randint(min_sec, max_sec)
        h, m = divmod(interval, 3600)
        print(f"[{bot_name}] Round done. Next in {h}h {m // 60}m...\n")
        await asyncio.sleep(interval)


async def preload_dialogs(bot):
    print(f"[preload_dialogs] Starting...")

    if bot.me.is_bot:
        print(f"[preload_dialogs] Bot account → skipping")
        return

    processed = 0
    kept = 0
    left = 0

    async for dialog in bot.get_dialogs():
        chat = dialog.chat
        processed += 1

        try:
            # ⏱ Delay per chat to avoid FloodWait
            await asyncio.sleep(1.5)

            # Only process groups & channels
            if chat.type not in (ChatType.CHANNEL, ChatType.SUPERGROUP, ChatType.GROUP):
                continue

            # ✅ STEP 1: Check if we are admin → always keep
            admin = await is_me_admin(bot, chat.id)
            if admin:
                kept += 1
                print(f"✅ Admin — keeping: {chat.title}")
                continue

            # ⚠️ STEP 2: Not admin → check if chat is accessible
            try:
                await bot.get_chat(chat.id)
                # Accessible (can read it) → keep, just not admin
                kept += 1
                print(f"👁 Not admin but accessible — keeping: {chat.title}")

            except (Forbidden, ChannelPrivate, ChatWriteForbidden):
                # ❌ Inaccessible → leave
                print(f"🚪 Not admin + inaccessible — leaving: {chat.title}")
                try:
                    await bot.leave_chat(chat.id)
                    left += 1
                    print(f"   ↳ Left: {chat.title}")
                except Exception as leave_e:
                    print(f"   ↳ Leave failed: {chat.title} | {leave_e}")

        except FloodWait as e:
            wait_time = e.value + 5
            print(f"⏳ FloodWait → sleeping {wait_time}s")
            await asyncio.sleep(wait_time)

        except (Forbidden, ChannelPrivate, ChatWriteForbidden):
            # Can't even check → leave
            print(f"❌ Fully inaccessible — leaving: {chat.title}")
            try:
                await bot.leave_chat(chat.id)
                left += 1
            except Exception:
                pass

        except Exception as e:
            print(f"⚠️ Error on {chat.title}: {e}")

        # 💤 Extra cooldown every 25 chats
        if processed % 25 == 0:
            print(f"💤 Cooldown pause (10s) — processed {processed} chats so far")
            await asyncio.sleep(10)

    print(f"\n✅ Preload done — Kept: {kept} | Left: {left} | Total scanned: {processed}")


async def main():

    movie_forwarder = MovieForwarderBot()  # Primary Movie Forwarder
    backup_forwarder = BackupForwarderBot()
    terabox_modifier = TeraBoxModifierBot()
    promoter_bot_1 = PromotionSpamBot1()
    promoter_bot_2 = PromotionSpamBot2()

    # Start bots
    await asyncio.gather(
        movie_forwarder.start(),
        #backup_forwarder.start(),
        terabox_modifier.start(),
        promoter_bot_1.start(),
        promoter_bot_2.start()
    )

    # Start spam tasks for Promotion Bots
    asyncio.create_task(spam_groups(promoter_bot_1, "Promoter1", min_sec=3600, max_sec=10800))
    asyncio.create_task(spam_groups(promoter_bot_2, "Promoter2", min_sec=3600, max_sec=10800))

    #asyncio.create_task(auto_runner(bot2))
    #asyncio.create_task(daily_report_runner(bot2))

    print("Bots are running...")
    await asyncio.Event().wait()  # Keep alive


# Run the asyncio event loop
if __name__ == "__main__":
    asyncio.run(main())
