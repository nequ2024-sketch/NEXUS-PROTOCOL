"""اختبارات API أساسية للمصادقة وحالات الإعداد غير المتاحة."""
import unittest
from unittest.mock import patch

from eth_account import Account
from eth_account.messages import encode_defunct

from backend.app import app


class BackendApiTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_health_reports_testnet_and_trading_locked(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertEqual(body["chainId"], 97)
        self.assertFalse(body["testnetTradingReady"])
        self.assertFalse(body["autoTradingReady"])

    def test_invalid_wallet_cannot_request_nonce(self):
        response = self.client.post("/api/auth/nonce", json={"wallet": "not-an-address"})
        self.assertEqual(response.status_code, 400)

    @patch("backend.auth.SECRET_KEY", "test-only-session-secret-long-enough-for-hs256")
    def test_wallet_signature_creates_single_use_session(self):
        signer = Account.create()
        response = self.client.post(
            "/api/auth/nonce", json={"wallet": signer.address}
        )
        self.assertEqual(response.status_code, 200)
        message = response.get_json()["message"]
        signature = Account.sign_message(
            encode_defunct(text=message), private_key=signer.key
        ).signature.hex()

        login = self.client.post(
            "/api/auth/verify",
            json={"wallet": signer.address, "signature": signature},
        )
        self.assertEqual(login.status_code, 200)
        token = login.get_json()["token"]
        profile = self.client.get(
            "/api/user", headers={"Authorization": f"Bearer {token}"}
        )
        self.assertEqual(profile.status_code, 200)
        self.assertEqual(profile.get_json()["wallet"], signer.address.lower())

        replay = self.client.post(
            "/api/auth/verify",
            json={"wallet": signer.address, "signature": signature},
        )
        self.assertEqual(replay.status_code, 401)


if __name__ == "__main__":
    unittest.main()
