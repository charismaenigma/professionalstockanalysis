# MarketClarity Premarket Research Desk (Preview)

## What is built
- `/premarket`: authenticated read-only UI with EARLY, RANK, and FINAL research checkpoints. None of the three submits orders, changes the Alpaca paper watchlist, or enables automated trading.
- `GET /api/premarket?phase=early|rank|final` requires the private `PAPER_CONTROL_TOKEN` header `x-marketclarity-token`.
- Read-only server calls to the verified Alpaca PAPER data-account connection, including IEX multi-stock snapshots, 5-minute IEX premarket bars, and Alpaca headlines (subject to provider availability). Massive supplies *previous completed sessions only* on a Basic feed.
- Candidate universe: up to 65 symbols seeded from prior completed-day turnover/movement and the five existing Alpaca PAPER watchlist symbols, **NOT** a real-time scanner across all 10,000+ US securities. Ticker symbols are NOT verified as common shares until downstream research; the app never directly trades these candidates.
- 13 reference ETFs: VOO, VTI and the 11 SPDR S&P 500 sector ETFs. Only timestamped actual ETF premarket trades are counted as premarket returns; blanks are not zero returns.
- News headlines are the latest 16-hour window when authorized; news count does not mean a catalyst is causal.
- Candidate scores are unvalidated sortable observations based on confirmed same-day trade gaps, IEX premarket bars when provided, and available bid/ask spreads. No fresh same-session IEX trade means NO rank; stale quotes never receive a liquidity 'pass'.
- Final checkpoint liquidity 'pass' is a *research signal*, not a trade authorization or consolidated market NBBO, and is always subject to a separate Paper Trading Lab dry-run and risk gates.
- Browser archive holds up to 30 phase/date snapshots and offers JSON and CSV export, both local to the active browser. The private control token is not persisted.

## Verification (October 28, 2026)
- GitHub tests/build and Vercel Preview compile verified.
- Temporary read-only provider smoke test: 59 sampled symbols; 13 ETF categories; 30 available headlines; Massive prior session found; 0 paper orders.
- **No fresh IEX stock trade was available among that sample at testing time**, so the live ranking remains unvalidated, even though the endpoint successfully read provider data.
- Optional Alpaca `delayed_sip` sample endpoint returned zero usable ticker snapshots under current credentials; do NOT represent it as a supported fallback or a complete premarket feed. Paid consolidated data is a future option.

## Research automation status (October 28, 2026)
Three **ChatGPT** recurring research tasks run at 6:30, 7:30, and 8:15 AM America/Chicago Monday–Friday. They can research independently with public sources and attempt a dated update to the connected native Google Sheet `MarketClarity Premarket Research — Live Log` in the user's Stonks Drive folder. These schedules **do not guarantee an authenticated invocation** of the private /api/premarket endpoint, because the task runtime cannot bypass the Preview token.
The native Google Sheet has tabs Checkpoints, Candidates, Sector ETFs, Headlines and How to Use, and a VERIFIED aggregate smoke-test row. It is separate from the older Excel research workbook.
Vercel cron triggers only **Production** deployments, not Preview, and Vercel Hobby scheduling is too imprecise for exact 8:15 AM checks. A fully unattended private app-data capture pipeline still needs a trusted scheduler with scoped secret access plus private persistent storage; do not store watchlists or broker data in public GitHub Actions artifacts.
No live or simulated orders are enabled by these steps.

## Operational follow-up
1. Validate actual same-session IEX premarket activity during the intended phase windows; if unavailable, report missing evidence or assess compliant consolidated data subscriptions before making new premarket performance claims.
2. For unattended app scans, use an authenticated runner with the protected private Preview URL and `PAPER_CONTROL_TOKEN` managed as secrets, not in source code; provide a confidential storage destination (native Sheet via narrow service account/Apps Script or private database).
3. Protect against duplicate runs with a `YYYY-MM-DD|phase` key, retain scan timestamp/feed/methodology, and leave missing values blank.
4. Compare the 7:30 and 8:15 captured records without hindsight, then validate a PAPER order manually during market hours before any order automation.
