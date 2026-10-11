"""Offline tests for explicit, wallet-scoped Binance Spot Testnet orders."""
import unittest
from decimal import Decimal
from unittest.mock import patch

from eth_account import Account
from eth_account.messages import encode_defunct

from backend.app import app
from backend.trading import BINANCE_TESTNET_API


class FakeResponse:
    def __init__(self, body, status_code=200):
        self.body = body
        self.status_code = status_code
        self.ok = 200 <= status_code < 300

    def json(self):
        return self.body


def sign_in(client):
    signer = Account.create()
    nonce_response = client.post("/api/auth/nonce", json={"wallet": signer.address})
    message = nonce_response.get_json()["message"]
    signature = Account.sign_message(
        encode_defunct(text=message), private_key=signer.key
    ).signature.hex()
    login_response = client.post(
        "/api/auth/verify",
        json={"wallet": signer.address, "signature": signature},
    )
    return signer.address, login_response.get_json()["token"]


def testnet_market_responses():
    return [
        FakeResponse(
            {
                "symbols": [
                    {
                        "symbol": "BTCUSDT",
                        "status": "TRADING",
                        "isSpotTradingAllowed": True,
                        "quoteAsset": "USDT",
                        "baseAsset": "BTC",
                        "quoteOrderQtyMarketAllowed": True,
                        "filters": [
                            {
                                "filterType": "MARKET_LOT_SIZE",
                                "stepSize": "0.00001",
                                "minQty": "0.00001",
                                "maxQty": "10000",
                            },
                            {
                                "filterType": "MIN_NOTIONAL",
                                "minNotional": "5",
                                "applyToMarket": True,
                            },
                        ],
                    }
                ]
            }
        ),
        FakeResponse(
            {"symbol": "BTCUSDT", "bidPrice": "99990", "askPrice": "100000"}
        ),
    ]


class BackendTradingTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.wallet, self.token = sign_in(self.client)
        self.headers = {"Authorization": f"Bearer {self.token}"}

    def test_quote_and_order_need_each_explicit_confirmation_and_single_use(self):
        market_responses = testnet_market_responses()
        with (
            patch("backend.app.TESTNET_TRADING_READY", True),
            patch("backend.trading.config.TESTNET_TRADING_READY", True),
            patch("backend.trading.config.BINANCE_API_KEY", "testnet-key"),
            patch("backend.trading.config.BINANCE_API_SECRET", "testnet-secret"),
            patch("backend.trading.requests.get", side_effect=market_responses) as get,
            patch(
                "backend.trading.requests.post",
                return_value=FakeResponse(
                    {
                        "symbol": "BTCUSDT",
                        "orderId": 901,
                        "status": "FILLED",
                        "executedQty": "0.00010",
                        "cummulativeQuoteQty": "10.00",
                    }
                ),
            ) as post,
        ):
            quote_response = self.client.post(
                "/api/trade/quote",
                headers=self.headers,
                json={"symbol": "BTCUSDT", "side": "BUY", "amount": "10"},
            )
            self.assertEqual(quote_response.status_code, 201)
            quote = quote_response.get_json()
            self.assertEqual(Decimal(quote["estimatedBaseQty"]), Decimal("0.00010"))
            self.assertEqual(get.call_count, 2)

            declined = self.client.post(
                "/api/trade/execute",
                headers=self.headers,
                json={"quoteId": quote["quoteId"], "confirmed": False},
            )
            self.assertEqual(declined.status_code, 400)
            post.assert_not_called()

            executed = self.client.post(
                "/api/trade/execute",
                headers=self.headers,
                json={"quoteId": quote["quoteId"], "confirmed": True},
            )
            self.assertEqual(executed.status_code, 200)
            self.assertTrue(executed.get_json()["testnet"])
            self.assertEqual(executed.get_json()["exchangeOrderId"], "901")
            request_url = post.call_args.args[0]
            self.assertEqual(request_url, f"{BINANCE_TESTNET_API}/api/v3/order")
            self.assertEqual(
                post.call_args.kwargs["headers"]["X-MBX-APIKEY"], "testnet-key"
            )
            signature = post.call_args.kwargs["params"][-1]
            self.assertEqual(signature[0], "signature")
            self.assertEqual(len(signature[1]), 64)

            replay = self.client.post(
                "/api/trade/execute",
                headers=self.headers,
                json={"quoteId": quote["quoteId"], "confirmed": True},
            )
            self.assertEqual(replay.status_code, 409)
            post.assert_called_once()

            history = self.client.get("/api/trade/orders", headers=self.headers)
            self.assertEqual(history.status_code, 200)
            self.assertEqual(len(history.get_json()["items"]), 1)
            self.assertEqual(history.get_json()["items"][0]["status"], "FILLED")

    def test_order_preview_rejects_pairs_not_listed_for_testnet(self):
        with (
            patch("backend.trading.config.TESTNET_TRADING_READY", True),
            patch("backend.trading.config.BINANCE_API_KEY", "testnet-key"),
            patch("backend.trading.config.BINANCE_API_SECRET", "testnet-secret"),
            patch(
                "backend.trading.requests.get",
                return_value=FakeResponse({"symbols": []}),
            ),
        ):
            response = self.client.post(
                "/api/trade/quote",
                headers=self.headers,
                json={"symbol": "NEXUSUSDT", "side": "BUY", "amount": "10"},
            )
        self.assertEqual(response.status_code, 422)
        self.assertIn("not listed", response.get_json()["error"])

    def test_trade_quote_requires_wallet_authentication(self):
        response = self.client.post(
            "/api/trade/quote",
            json={"symbol": "BTCUSDT", "side": "BUY", "amount": "10"},
        )
        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
