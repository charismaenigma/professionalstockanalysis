# MarketClarity v0.4 · Anytime Strategy Lab (initial research build)
Visit /backtest to test completed Massive aggregate candles while US markets are closed.
Periods: previous market day, 1/3 weeks, 1/3/6 months, 1/3/5 years. Valid interval choices depend on period.
Ten strategy families appear; Relative Strength Rotation is intentionally disabled until synchronized multi-asset data exists.
All backtests are historical research **only**, no broker orders, with one long position at a time and conservative stop-first intrabar assumptions. 10 bps entry and exit friction modeled.
Limitations to address before claiming reliable historical P/L: first-window warmup trade exposure currently affects period metrics; the 1d interval is calendar-based rather than exchange-session aware; missing holidays/coverage are not yet flagged; latest partially completed weekly bars may be included; corporate actions require independent verification; comparison benchmark is same-ticker buy-and-hold; next-bar fill model has no limit-fill uncertainty; no out-of-sample walk-forward validation; strategy definitions are heuristic prototypes, not optimized systems.
The existing /paper workflow and order-enable flags remain untouched. Do not enable unattended paper orders based solely on these results.
