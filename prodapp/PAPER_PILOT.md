# MarketClarity — Alpaca Paper Trading Pilot

## Status
The Preview contains a research-only conservative SWING paper-entry strategy and does not submit orders unless PAPER_TRADE_ENABLED=true. It has no Alpaca live broker API endpoint. PAPER_AUTO_ENABLED is off by default. No automated paper orders are enabled as part of this upgrade.

## Allocation
- The paper account equity is the basis for a theoretical 95% VOO core / 5% active sleeve. The bot does not buy or rebalance VOO.
- Existing VOO paper position is reserved as a core position. All other long paper positions and all outstanding non-VOO buy order quantities count toward the 5% shared active capital limit.
- Maximum concurrent active trading symbols = 3, or 2 if PAPER_POSITION_SLOTS=2. Each new entry is limited by 5% of equity divided by available position slots, remaining shared capital, 70% of available cash, and risk exposure of 0.25% of the 5% sleeve. These caps are conservative and are not a guarantee against stop slippage or overnight losses.
- The legacy account-wide 1% daily loss gate can also trigger if VOO holdings decline, so it does not isolate the 5% sleeve's P/L. A future version should introduce a dedicated paper sleeve accounting ledger.
- Only long-only bracket orders using day limit entry + stop and target; no leveraged funds, OTC or unverified stocks. Broker data is IEX-only for quotes.

## Start-up checklist
1. Add ALPACA_PAPER_KEY and ALPACA_PAPER_SECRET to Vercel Preview for branch feature/anytime-backtesting-v04. Use *paper* keys only. Never paste secrets in chat or commit them to GitHub.
2. Keep MASSIVE_API_KEY and PAPER_CONTROL_TOKEN configured for Preview. Redeploy Preview after any environment changes.
3. Open Preview /paper and authenticate with PAPER_CONTROL_TOKEN. Verify the account, balances, VOO-core reservation, 5% active sleeve, watchlist and open orders.
4. Select one exchange-listed stock, or use the Opportunity Lab's ticker-only handoff and explicitly save chosen candidates to the Alpaca paper watchlist.
5. During an open market session select Preview Scan. Read reasons for every skip and verify order size, limit, stop, target; do not treat a candidate as guaranteed to fill.
6. After observing an accurate dry-run, explicitly enable PAPER_TRADE_ENABLED=true only for Preview if the user authorizes it. Leave PAPER_AUTO_ENABLED unset/false. Run a MANUAL paper-order scan and confirm the Alpaca order status and bracket fill. Do not enable unattended scans until concurrency handling and audit logging have been validated.

## Caveats
- Massive Basic may rate-limit multi-symbol live research scans. Start with one ticker and/or provider caching; a partial scan does not imply there were no qualifying opportunities.
- This is not automatically connected to the 4:30 PM research-review Google Sheet; daily broker history and strategy attribution remain separate work.
- Alpaca paper fills are simulated and can differ from live execution. No guarantee of fill, win rate or profit.
- Preview credentials currently differ from Production. Never silently promote Preview changes to Production or copy secrets across environments.