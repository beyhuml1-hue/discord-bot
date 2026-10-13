"""Authenticated connection to the existing bot website. No member database is copied."""
import hashlib
import hmac
import json
import time
import uuid


def signed_payload(token, instance, data, timestamp=None, nonce=None):
    body = {**data, "instance": instance, "nonce": nonce or uuid.uuid4().hex}
    raw = json.dumps(body, separators=(",", ":"), ensure_ascii=True).encode()
    stamp = str(int(time.time()) if timestamp is None else timestamp)
    signature = hmac.new(token.encode(), stamp.encode() + b"." + raw, hashlib.sha256).hexdigest()
    return raw, {"Content-Type": "application/json", "User-Agent": "VerifyBot/1.0", "X-Runtime-Time": stamp,
                 "X-Runtime-Signature": signature}


class WebsiteBridge:
    def __init__(self, session, token, instance):
        self.session, self.token, self.instance = session, token, instance

    async def call(self, action, **data):
        raw, headers = signed_payload(self.token, self.instance, data)
        async with self.session.post("https://bot.lb000.xyz/api/runtime/" + action,
                                     data=raw, headers=headers, allow_redirects=False) as response:
            try:
                result = await response.json(content_type=None)
            except (ValueError, TypeError):
                raise RuntimeError(f"Website returned HTTP {response.status}; try again shortly.") from None
            if response.status != 200:
                raise RuntimeError(result.get("error", "Website connection failed."))
            return result
