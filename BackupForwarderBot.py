import logging
from pyrogram import Client, __version__, enums
from config import Config, LOGGER

class BackupForwarderBot(Client):
    def __init__(self):
        super().__init__(
            "userClient1",
            api_id=Config.API_ID2,
            api_hash=Config.API_HASH2,
            plugins={"root": "plugins_backup_forwarder"},
            workers=20,
            session_string=Config.SESSION2,
            sleep_threshold=10
        )
        self.LOGGER = LOGGER


    async def start(self, *args, **kwargs):
        await super().start(*args, **kwargs)
        self.set_parse_mode(enums.ParseMode.HTML)
        bot = await self.get_me()



        self.LOGGER.info(f"🤖 Userbot started as @{bot.username} (ID: {bot.id})")
        self.LOGGER.info(f"Pyrogram v{__version__} is running...")

    async def stop(self, *args, **kwargs):

        await super().stop(*args, **kwargs)
        self.LOGGER.info("🛑 Userbot stopped. Goodbye!")
