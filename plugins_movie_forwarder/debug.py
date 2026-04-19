# plugins/debug.py
from pymongo import MongoClient
from pyrogram import Client, filters


# MongoDB Setup
DATABASE_URI = "mongodb+srv://test:test05@cluster0.g05zxpa.mongodb.net/?retryWrites=true&w=majority"
DATABASE_NAME = "Cluster0"

client_mongo = MongoClient(DATABASE_URI)
db = client_mongo[DATABASE_NAME]


@Client.on_message(filters.video | filters.document)
async def big_movie_detector(client, message):
    media = message.video or message.document
    size = media.file_size

    if size > 150 * 1024 * 1024:  # >150 MB
        video_id = media.file_unique_id

        try:
            db["newMovieDatas2"].insert_one({"_id": video_id})
            try:
                await message.copy(chat_id=-1002059529731)
                print("✔ Sent >150MB movie to target channel")
            except Exception as e:
                print("Copy failed:", e)
        except:
            print("duplicate failed:",)
            pass

