import logging
from pyrogram import Client, __version__, enums
from config import Config, LOGGER

class GeneralDataModifierBot(Client):
    def __init__(self):
        super().__init__(
            "xmodify1",
            api_id=Config.API_ID1,
            api_hash=Config.API_HASH1,
            plugins={"root": "plugins_data_modifier"},
            workers=20,
            bot_token=Config.token,
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
