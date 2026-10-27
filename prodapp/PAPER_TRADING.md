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

## Anytime scans and historical strategy backtesting (v0.4)

The `/paper` dashboard includes a **separate, read-only historical research lab**. It works when the stock market is closed and does not require turning on paper-order submissions or the unattended scheduler.

- **Scan latest close**: computes historical technical triggers for up to five watchlist stocks using their latest *completed daily* bars. This is not the live MarketClarity scanner: spreads, liquidity, fresh quotes, market-open gates, pending corporate news, and paper-order eligibility have not been checked. A trigger is **not** a recommendation to place an order.
- **Backtesting**: enter any valid US stock symbol, select a historical test period, and compare **ten** fixed-rule strategies: Conservative Swing (technical proxy), Momentum Breakout, Trend Following, Mean Reversion, Opening Range Breakout, VWAP Pullback, Trend Pullback, Volatility Breakout, Moving Average Crossover, and Relative Strength vs. SPY.
- **Test periods**: most recent completed market day; 1 and 3 weeks; 1, 3 and 6 months; and 1, 3 and 5 years. The supported intervals are selected by period: 5, 15, 30 minutes and 1 hour for 1 day/1 week/3 weeks; 15/30 minutes, 1 hour, or daily for 1 month; 1 hour or daily for 3 months; 1 hour, daily, or weekly for 6 months; and daily or weekly for 1/3/5 years.
- Intraday-only strategies appear as **incompatible** for daily/weekly testing; they are not automatically substituted with another strategy.
- Performance is measured from hypothetical $100,000 cash, at most one long position per strategy, 5% allocation limit, and 0.25% nominal initial stop risk. Trades enter **at the next candle's open** after a completed-candle signal; each entry/exit is adjusted by 0.1% adverse slippage, and modeled stops and targets can exit trades within a candle. If both stop and target fall inside the same candle, the model assumes the stop happens first. Intraday strategies close out by the end of the session. This does not use the real Alpaca paper account or place any orders.
- Reports provide return, trade count, win rate, profit factor, drawdown, realized hypothetical P/L, equity curves, and recent trades. A 5%-allocated buy-and-hold reference uses the same 0.1% entry/exit friction. The highest-return result is only an **in-sample** ranking, not proof of profitability.
- Historical data comes from Alpaca IEX single-exchange candles, split-adjusted. The hourly option is assembled from regular-session half-hour candles so premarket data is not blended into the 9:30 ET opening hour. Incomplete current sessions and weekly candles are not backtested. Coverage gaps, market holidays, IPO listing dates, gaps in IEX trades, split adjustments, dividend exclusions, and price/volume fidelity can distort comparisons.
- MarketClarity's current-day SEC/Massive composite scores are **not used historically**, because doing so would introduce future information. Conservative Swing is labeled a distinct, historical *technical proxy* rather than a replay of the live scoring model.
- This is an experimental educational tool, not a validated live trading system. Results do not include order-book queue depth, real spreads, true trade-by-trade stop order fills, commissions, regulatory fees, borrow fees, shorting, dividends, changing symbol universes, or investment advice. Historical multiple-strategy comparisons invite overfitting.

The historical feature is available via `POST /api/paper/backtest` using the same private `x-marketclarity-token` header. Requests with `{ "mode":"scan" }` use the watchlist; `{ "mode":"backtest", "symbol":"MSFT", "period":"1w", "interval":"15Min" }` run historical simulations. The route exclusively calls market-data **GET** endpoints; it has no paper-order submission path. Results are transient per request rather than a stored experiment database. The existing `/api/paper/run` market-open rules and paper auto-order flags remain unchanged.

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
