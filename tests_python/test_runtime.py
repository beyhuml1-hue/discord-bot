import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock
from main import VerifyBot, PREFIX

class RuntimeTests(unittest.IsolatedAsyncioTestCase):
    async def test_prefix_filter(self):
        self.assertTrue(PREFIX.match('!stock Minecraft'))
        self.assertTrue(PREFIX.match('!buy'))
        self.assertFalse(PREFIX.match('!stockpile'))
        self.assertFalse(PREFIX.match('hello'))

    async def test_real_message_ids_sent_instead_of_forged_actor_or_content(self):
        client = VerifyBot('fixture')
        client.website_ready = True
        client.bridge = SimpleNamespace(call=AsyncMock())
        message = SimpleNamespace(author=SimpleNamespace(bot=False), webhook_id=None,
                                  guild=object(), content='!stock Minecraft',
                                  channel=SimpleNamespace(id=123), id=456)
        await client.on_message(message)
        client.bridge.call.assert_awaited_once_with('message', channel_id='123', message_id='456')
        message.author.bot = True
        await client.on_message(message)
        self.assertEqual(client.bridge.call.await_count, 1)

    async def test_failed_website_connection_does_not_execute_commands(self):
        client = VerifyBot('fixture')
        client.bridge = SimpleNamespace(call=AsyncMock())
        message = SimpleNamespace(author=SimpleNamespace(bot=False), webhook_id=None,
                                  guild=object(), content='!say hello', channel=SimpleNamespace(id=123), id=456)
        await client.on_message(message)
        client.bridge.call.assert_not_awaited()
