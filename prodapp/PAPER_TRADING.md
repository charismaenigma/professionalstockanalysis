# MarketClarity Paper Trading Lab

This feature extends the production MarketClarity research app, preserving its existing search, radar, market-data and public-access behavior. The simulator is at `/paper`.

## What the bot can do

- Read up to five user-selected tickers from a dedicated Alpaca **paper** watchlist.
- Combine MarketClarity's Massive/SEC swing-trade research with a fresh Alpaca IEX quote.
- Reject demo data, unverified/OTC/ETF instruments, stale prices, wide spreads, unqualified setups, risk vetoes, and insufficient cash.
- Place long-only, day-valid **paper bracket orders** with limit entry, stop-loss and take-profit.
- Limit nominal trade risk to 0.25% of account equity, allocation to 5% of equity, and concurrent positions/open buy orders to three.
- Stop adding orders if paper equity is more than 1% below previous-day equity.
- Block repeat order attempts for the same symbol on the same calendar date.
- Display paper-account equity history, open positions, orders, maximum drawdown, and recently closed-trade P/L metrics.

These are **testable research rules**, not calibrated predictions or a proven profitable strategy. A simulated stop may not prevent a larger real-world loss. No shorting, leverage, options or real-money orders are supported.

## Connect and activate

1. Use a **dedicated Alpaca paper trading account**. Generate *paper* keys and store them in Vercel project environment settings as `ALPACA_PAPER_KEY` and `ALPACA_PAPER_SECRET`.
2. Keep the existing `MASSIVE_API_KEY` server-side for research. This version's primary research feed is Massive; FMP is supplemental.
3. Generate a long random `PAPER_CONTROL_TOKEN` for the dashboard. Never publish it or expose it as a `NEXT_PUBLIC_` value. The dashboard prompts for it during the session.
4. Open `/paper`, connect, choose your watchlist (no symbols are preselected), and run **Preview scan**. In preview, zero orders are submitted.
5. Only after reviewing preview results and data entitlements, set `PAPER_TRADE_ENABLED=true` for the target deployment. The manual button can then submit *paper-only* orders.
6. To scan automatically while the browser is closed, also set `PAPER_AUTO_ENABLED=true`, and configure an authenticated scheduler:
   - This repository provides `.github/workflows/paper-scan.yml`. Set GitHub variable `MARKETCLARITY_URL` to the deployed HTTPS origin and GitHub secret `MARKETCLARITY_CRON_SECRET` to match the existing Vercel `CRON_SECRET`. GitHub runs at 15:15, 17:15 and 19:15 UTC Monday–Friday. Alpaca's market clock rejects closed sessions.
   - Alternatively configure a scheduler to send `GET /api/paper/run` with `Authorization: Bearer <CRON_SECRET>`. Do not expose that token.
7. Monitor fills, rejects and paper P/L. Do not infer strategy profitability from a few simulated trades.

## Important data and performance limitations

- Alpaca's free IEX feed sees one exchange; it is not a consolidated SIP view. MarketClarity's primary Massive Stock Basic analysis may use **prior-day** candles. The bot therefore uses the fresh IEX quote only for execution safeguards; it is a swing experiment, **not** a verified intraday day-trading strategy.
- MarketClarity scores are uncalibrated research heuristics. A score of 90 does not mean a 90% win probability.
- The status endpoint uses Alpaca's account-level equity history for the last three months and samples the latest 100 fill activities for realized metrics. Older fills may be excluded. Use a dedicated paper account to isolate performance.
- Paper fills do not fully model latency, order-book queue position, market impact, fees, or real-world slippage. Limit orders may remain unfilled.
- A third-party scheduler and production API keys are required for unattended operation; a browser tab alone does not keep the bot running.

## Security

- The broker adapter hardcodes `https://paper-api.alpaca.markets`; live brokerage endpoints cannot be selected by configuration.
- All paper-account reads/writes require `PAPER_CONTROL_TOKEN`. The unattended route separately requires `CRON_SECRET`.
- Both `PAPER_TRADE_ENABLED` and `PAPER_AUTO_ENABLED` default to false. No automatic order is possible with only market-data access configured.

Run `npm test`, `npm run typecheck`, and `npm run build` from `prodapp/` after changes.
