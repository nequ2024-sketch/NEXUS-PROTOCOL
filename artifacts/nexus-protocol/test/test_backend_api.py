"""اختبارات API أساسية للمصادقة وحالات الإعداد غير المتاحة."""
import unittest
import os
from unittest.mock import patch

from eth_account import Account
from eth_account.messages import encode_defunct
from web3 import Web3

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
        self.assertTrue(login.get_json()["authenticated"])
        self.assertNotIn("token", login.get_json())
        self.assertIn("httponly", login.headers.get("Set-Cookie", "").lower())
        profile = self.client.get("/api/user")
        self.assertEqual(profile.status_code, 200)
        self.assertEqual(profile.get_json()["wallet"], signer.address.lower())

        replay = self.client.post(
            "/api/auth/verify",
            json={"wallet": signer.address, "signature": signature},
        )
        self.assertEqual(replay.status_code, 401)

    @patch("backend.app.BSCSCAN_KEY", "test-only-bscscan-key")
    def test_subscription_verification_requires_contract_event_and_rejects_reuse(self):
        signer = Account.create()
        manager = "0x" + "ab" * 20
        usdt = "0x" + "cd" * 20
        tx_hash = "0x" + os.urandom(32).hex()
        topic = Web3.keccak(
            text="SubscriptionPayment(address,uint256,address,uint256,uint8,uint256)"
        ).hex()
        topics = [
            topic,
            "0x" + signer.address[2:].lower().rjust(64, "0"),
            "0x" + format(1, "064x"),
            "0x" + usdt[2:].lower().rjust(64, "0"),
        ]
        event_data = (
            (49 * 10**18).to_bytes(32, "big")
            + (1).to_bytes(32, "big")
            + (1_900_000_000).to_bytes(32, "big")
        )
        receipt = {
            "status": "0x1",
            "logs": [
                {
                    "address": manager,
                    "topics": topics,
                    "data": "0x" + event_data.hex(),
                }
            ],
        }
        transaction = {"from": signer.address, "to": manager}

        class Response:
            def __init__(self, body):
                self.body = body

            def raise_for_status(self):
                return None

            def json(self):
                return self.body

        def bscscan_get(_url, params, timeout):
            self.assertEqual(timeout, 15)
            result = receipt if params["action"] == "eth_getTransactionReceipt" else transaction
            return Response({"result": result})

        with patch.dict(os.environ, {"SUBSCRIPTION_MANAGER_ADDRESS": manager}):
            with patch("backend.app.requests.get", side_effect=bscscan_get):
                verified = self.client.post(
                    "/api/subscriptions/verify", json={"tx_hash": tx_hash}
                )
                self.assertEqual(verified.status_code, 200)
                self.assertTrue(verified.get_json()["verified"])
                self.assertEqual(verified.get_json()["planId"], 1)
                duplicate = self.client.post(
                    "/api/subscriptions/verify", json={"tx_hash": tx_hash}
                )
                self.assertEqual(duplicate.status_code, 409)
                self.assertEqual(duplicate.get_json()["code"], "ALREADY_VERIFIED")

                receipt["logs"] = []
                invalid = self.client.post(
                    "/api/subscriptions/verify",
                    json={"tx_hash": "0x" + os.urandom(32).hex()},
                )
                self.assertEqual(invalid.status_code, 422)


if __name__ == "__main__":
    unittest.main()
