"""Wispbyte Python 3.11 entry point for Verify bot."""
import asyncio
import contextlib
import logging
import os
import re
import uuid

import aiohttp
import discord
from dotenv import load_dotenv
from bridge import WebsiteBridge

log = logging.getLogger("verify_bot")
PREFIX = re.compile(r"^!(stock|buy|say|setsection)\b", re.IGNORECASE)


class VerifyBot(discord.Client):
    def __init__(self, token):
        intents = discord.Intents.none()
        intents.guilds = True
        intents.guild_messages = True
        intents.message_content = True
        super().__init__(intents=intents)
        self.bot_token = token
        self.instance = uuid.uuid4().hex
        self.session = None
        self.bridge = None
        self.heartbeat_task = None
        self.website_ready = False
        self.limit = asyncio.Semaphore(4)

    async def setup_hook(self):
        self.session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=60))
        self.bridge = WebsiteBridge(self.session, self.bot_token, self.instance)

    async def on_ready(self):
        try:
            await self.bridge.call("heartbeat")
            self.website_ready = True
            log.info("Connected as %s. Website connected; !stock, !buy, !say and !setsection ready.", self.user)
            if self.heartbeat_task is None or self.heartbeat_task.done():
                self.heartbeat_task = asyncio.create_task(self.keep_website_connected())
        except Exception as exc:
            log.error("Cannot connect to website: %s", exc)
            await self.close()

    async def keep_website_connected(self):
        while not self.is_closed():
            await asyncio.sleep(25)
            if not self.is_ready():
                self.website_ready = False
                continue
            try:
                await self.bridge.call("heartbeat")
                self.website_ready = True
            except Exception as exc:
                self.website_ready = False
                log.warning("Website heartbeat failed: %s", exc)

    async def on_message(self, message):
        if message.author.bot or message.webhook_id or not message.guild or not PREFIX.match(message.content):
            return
        if not self.website_ready:
            log.warning("Command postponed: website connection unavailable.")
            return
        async with self.limit:
            try:
                await self.bridge.call("message", channel_id=str(message.channel.id), message_id=str(message.id))
            except Exception as exc:
                # No automatic retry after ambiguous delivery; shared website claims prevent duplicates.
                log.warning("Command could not finish: %s", exc)

    async def on_guild_join(self, guild):
        if self.website_ready:
            try:
                await self.bridge.call("joined")
            except Exception as exc:
                log.warning("Join notification deferred to website monitor: %s", exc)

    async def close(self):
        self.website_ready = False
        task = self.heartbeat_task
        if task and task is not asyncio.current_task():
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        if self.bridge:
            with contextlib.suppress(Exception):
                await self.bridge.call("release")
        if self.session:
            await self.session.close()
        await super().close()


def main():
    load_dotenv()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    token = os.getenv("DISCORD_BOT_TOKEN", "").strip()
    if not token:
        raise SystemExit("Set DISCORD_BOT_TOKEN in Wispbyte Startup variables or a private .env file, then start main.py.")
    VerifyBot(token).run(token, log_handler=None)


if __name__ == "__main__":
    main()
