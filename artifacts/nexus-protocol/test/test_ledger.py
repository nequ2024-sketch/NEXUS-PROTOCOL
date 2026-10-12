"""Offline tests for conservative fill-ledger accounting."""
import unittest

from backend.ledger import build_wallet_ledger, performance_summary


class WalletLedgerTests(unittest.TestCase):
    def test_realized_pnl_includes_base_and_usdt_commissions(self):
        ledger = build_wallet_ledger(
            [
                {
                    "quote_id": "buy",
                    "symbol": "BTCUSDT",
                    "side": "BUY",
                    "status": "FILLED",
                    "created_at": 10,
                    "updated_at": 10,
                    "fills_json": '[{"price":"100","qty":"1","commission":"0.01","commissionAsset":"BTC"}]',
                },
                {
                    "quote_id": "sell",
                    "symbol": "BTCUSDT",
                    "side": "SELL",
                    "status": "FILLED",
                    "created_at": 20,
                    "updated_at": 20,
                    "fills_json": '[{"price":"120","qty":"0.99","commission":"1","commissionAsset":"USDT"}]',
                },
            ]
        )
        close = ledger["history"][0]
        self.assertTrue(close["pnl_known"])
        self.assertAlmostEqual(close["pnl"], 17.8)
        self.assertEqual(ledger["positions"], [])
        self.assertEqual(performance_summary(ledger["history"], 0)["trades"], 1)

    def test_third_asset_commission_never_gets_assumed_zero_usdt_value(self):
        ledger = build_wallet_ledger(
            [
                {
                    "quote_id": "buy",
                    "symbol": "ETHUSDT",
                    "side": "BUY",
                    "status": "FILLED",
                    "created_at": 10,
                    "updated_at": 10,
                    "fills_json": '[{"price":"10","qty":"2","commission":"0.1","commissionAsset":"BNB"}]',
                },
                {
                    "quote_id": "sell",
                    "symbol": "ETHUSDT",
                    "side": "SELL",
                    "status": "FILLED",
                    "created_at": 20,
                    "updated_at": 20,
                    "fills_json": '[{"price":"12","qty":"2","commission":"0","commissionAsset":"USDT"}]',
                },
            ]
        )
        close = ledger["history"][0]
        self.assertFalse(close["pnl_known"])
        self.assertIsNone(close["pnl"])
        summary = performance_summary(ledger["history"], 0)
        self.assertFalse(summary["available"])
        self.assertEqual(summary["incompleteTrades"], 1)

    def test_missing_or_partial_fill_data_does_not_claim_verified_pnl(self):
        ledger = build_wallet_ledger(
            [
                {
                    "quote_id": "buy",
                    "symbol": "BTCUSDT",
                    "side": "BUY",
                    "status": "FILLED",
                    "created_at": 10,
                    "updated_at": 10,
                    "fills_json": '[{"price":"100","qty":"1","commission":"0","commissionAsset":"USDT"}]',
                },
                {
                    "quote_id": "sell",
                    "symbol": "BTCUSDT",
                    "side": "SELL",
                    "status": "FILLED",
                    "created_at": 20,
                    "updated_at": 20,
                    "fills_json": '[{"price":"120","qty":"1","commission":"0","commissionAsset":"USDT"},{"price":"bad","qty":"1","commission":"0","commissionAsset":"USDT"}]',
                },
            ]
        )
        self.assertFalse(ledger["history"][0]["pnl_known"])
        self.assertIsNone(ledger["history"][0]["pnl"])


if __name__ == "__main__":
    unittest.main()
