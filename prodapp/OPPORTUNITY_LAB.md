# Adaptive Opportunity Lab v0.1 — methodology and controls
This preview is a deterministic research-only historical daily opportunity replay. It is NOT a validated trading strategy, not live automatic screening, and not automatic model learning. No Alpaca credentials or order execution are used.

For a chosen target trading date, fetch two prior weekday US stock grouped daily sessions and (only for target dates strictly before the current New York date) target-day grouped bars. Ranking uses ONLY prior sessions. It cannot see target-day results. It does not persist a timestamped premarket selection. A replay run after the close is different from a contemporaneously archived forecast.

Daily liquidity eligibility uses prior close $5–$1000, prior volume >=500,000, prior dollar turnover >= $10m, and a nonzero earlier baseline. Basic symbol syntax is NOT verified security classification (ETF and corporate-action contamination possible). The scoring algorithm has two clearly versioned, simple exploratory day/swing modes based on prior close-to-close move, one-day volume ratio, and intraday range. Scores are NOT win probabilities.

The outcome audit reports hypothetical open-to-close observed movement in the target session (not trading profit or loss, fill, or execution); maximum favorable/adverse moves are observation only and must not be presented as tradable returns. The missed opportunities table is an ex-post comparison among the pre-session eligible universe and must not be used directly to revise weights. Proper evaluation requires immutable timestamped snapshots, years of walk-forward out-of-sample tests, representative securities including delisted names, costs, and a real strategy entry/exit engine.

Data: Massive Grouped Daily bars, 3 calls maximum if no missing sessions, cached for one day; holidays are NOT resolved automatically, and calls share Basic plan request limits. Vercel cron invokes production only; do not add production scheduled scans until authenticated persistence, monitoring and market calendar logic are implemented.

## Integration check · 2026-10-26
The temporary Preview diagnostic successfully loaded grouped US stock data for 2026-10-22, 2026-10-23 and 2026-10-26; the point-in-time candidate filter found 2,574 eligible symbols and ranked 10, capturing 1 of the top 20 retrospectively observed liquid movers. This is a single-day non-tradable replay, not an out-of-sample result or probability. The diagnostic page was removed after verification.

## ETF benchmark monitoring v0.2
A matched historical review period starts at the selected stock screening session OPEN and ends at the most recent eligible closed trading session within 1 day, 1 week or 1 month, clamped to completed data. The same open-to-close interval is applied to the screened stocks AND VOO plus all eleven Select Sector SPDR ETFs. All ETF rows appear even if a price is missing (null/—), never fabricated. The data uses Massive split-adjusted grouped bars; ETF dividend distributions are NOT included in these price returns. Excess return vs VOO is in percentage points, not absolute portfolio gains. Results are hindsight observed moves, not executable backtested positions or simulated P/L.

Watchlist screen entries are saved in the same browser using localStorage in the UI; they do NOT persist to cloud storage or automatically update when the browser is closed. Saved entries can be revisited from their original screening date to see how they compare over newer windows. User credentials are never stored locally.
