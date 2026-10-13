import hashlib
import hmac
import json
import unittest
from bridge import signed_payload

class SigningTests(unittest.TestCase):
    def test_signature_covers_timestamp_body_and_instance(self):
        raw, headers = signed_payload("fixture", "a" * 32, {"message_id": "123"}, timestamp=100, nonce="b" * 32)
        expected = hmac.new(b"fixture", b"100." + raw, hashlib.sha256).hexdigest()
        self.assertEqual(headers["X-Runtime-Signature"], expected)
        self.assertEqual(json.loads(raw)["instance"], "a" * 32)
        self.assertNotIn(b"fixture", raw)
        self.assertNotEqual(expected, hmac.new(b"wrong", b"100." + raw, hashlib.sha256).hexdigest())

    def test_requests_have_unique_nonces(self):
        first, _ = signed_payload("fixture", "a" * 32, {})
        second, _ = signed_payload("fixture", "a" * 32, {})
        self.assertNotEqual(json.loads(first)["nonce"], json.loads(second)["nonce"])
