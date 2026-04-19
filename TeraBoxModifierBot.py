import logging
import asyncio
import os
import sys
from pyrogram import Client, __version__, enums
from config import Config, LOGGER

class TeraBoxModifierBot(Client):
    def __init__(self):
        super().__init__(
            "xmodify1terastring",
            api_id=Config.API_ID1,
            api_hash=Config.API_HASH1,
            plugins={"root": "plugins_terabox_modifier"},
            workers=20,
            bot_token=Config.tokentera,
            sleep_threshold=10
        )
        self.LOGGER = LOGGER


    async def start(self, *args, **kwargs):
        await super().start(*args, **kwargs)
        self.set_parse_mode(enums.ParseMode.HTML)
        bot = await self.get_me()



        self.LOGGER.info(f"🤖 terabot started as @{bot.username} (ID: {bot.id})")
        self.LOGGER.info(f"Pyrogram v{__version__} is running...")
        
        # Start auto-send task
        from plugins_terabox_modifier.debug import auto_send_task
        asyncio.create_task(auto_send_task(self))

    async def stop(self, *args, **kwargs):

        await super().stop(*args, **kwargs)
        self.LOGGER.info("🛑 terabot stopped. Goodbye!")
