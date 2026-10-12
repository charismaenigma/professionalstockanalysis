# MarketClarity research scoring methodology (v2.0)

**Status: transparent, rules-based educational research model. NOT historically calibrated or statistically validated as a profitable strategy.**

## Why different scores exist

**Company Strength** asks whether the company's operations and balance-sheet fundamentals look sound, independent of its current stock price. It can score a very good business highly even when the stock has a demanding valuation.

**Investment At Today's Price** is the price-sensitive long-term research grade. It includes profitability, growth, debt and liquidity, capital allocation, valuation and a small timing component. Its 95+ class means the rules classify a combination of company condition and price as exceptional. It is NOT a prediction of return.

**Active Growth** measures faster-growing businesses with regard to operating strength, valuation and risk.

**Asymmetric Opportunity** looks for potential for unusually large gains relative to downside, company size and growth; this is still a heuristic, not a probability distribution.

**Swing Trade** is a conditional technical setup measure. Even a high-scoring stock receives no published entry/exit plan unless the price structure, observed resistance, reward/risk, liquidity and additional risk conditions pass separate guards.

**ETFs and daily leveraged ETFs** follow their own existing methodology. An ETF is not a single operating business, and leveraged daily-reset ETFs must not be treated as unleveraged long-term core holdings.

## Weights

| Component | Company Strength | Investment At Price | Active Growth | Asymmetric |
|---|---:|---:|---:|---:|
| Financial health | 23% | 15% | 12% | 14% |
| Business quality | 32% | 15% | 24% | 12% |
| Recent growth | 22% | 12% | 28% | 20% |
| Valuation | — | 35% | 17% | 15% |
| Shareholder treatment | 13% | 8% | 7% | 7% |
| Risk control | 10% | 10% | — | 5% |
| Technical context | — | 5% | 12% | 5% |
| Asymmetry composite | — | — | — | 22% |

Swing Trade uses entry/invalidation 27%, technical quality 24%, reward/risk 18%, liquidity 13%, risk 10%, crowding 5%, verified event context 3%.

Indicators are scaled by simple, **subjective thresholds**, not predictive ML calibrations. Thresholds must be evaluated out of sample against future risk-adjusted returns and appropriate benchmarks. None of the weights imply statistical validity.

## Inputs and sources

- U.S. securities price history and trading volume: Massive's plan-available end-of-day feed; NOT an executable real-time bid/ask quote.
- SEC XBRL company facts: matched fiscal-year and same-quarter-last-year filings, trailing approximate EPS/revenue/cashflow calculations and dated balance-sheet data.
- Company ROIC: **estimated** from after-tax operating profit divided by reported equity plus interest-bearing debt, conservatively excluding limited cash. It is not issuer-reported audited ROIC and may not be appropriate for banks, insurers, unusual capital structures, or negative invested capital.
- Liquid resources: cash plus separately identified current and noncurrent marketable securities where available. Marketable securities vary in duration, valuation and tradability.
- Debt: current term debt and noncurrent term debt, plus separately reported commercial paper, with care not to double-count a combined debt disclosure.
- Valuation ratios: trailing reported results, unless more precise and appropriately verified alternatives become available.
- Catalysts: an SEC filing *exists* is not evidence that a favorable catalyst exists. Routine filings do not improve catalyst grades automatically.
- Risk flags: a maximum of 100 denotes no rule-triggered warning among observed inputs. It does **not** mean zero actual business, market, legal or liquidity risk.

**Data coverage is not data accuracy.** Non-null fields and a successful API request do not prove their interpretation is correct.

## Evidence confidence and missing data

Missing individual inputs are omitted, not automatically replaced with 50/100. Missing a large fraction of the weighted inputs caps a score. A verified **High** fundamental confidence requires a recent annual filing, sufficient complete fields, and observed ROIC and free-cash-flow valuation evidence. Moderate or Low coverage caps high numerical grades. Old or insufficient corporate filings may make investment scores Not Rated; that does not imply a company is bad.

Swing-trading evidence is independently assessed from price-history completeness, liquidity, price freshness and minimum reporting coverage; a stock with no positive free-cash-flow multiple can still have a measurable technical setup, but a setup is not approved solely because an appealing reward/risk can be mathematically drawn.

## Tier interpretation

- 95–100: **Elite Opportunity** in its *specified model*, subject to hard vetoes and meaningful research confidence.
- 90–94.9: **Strong Candidate**; swing entry plans remain conditional, never a trade-now instruction.
- 85–89.9: Watchlist.
- 70–84.9: Research Only; Radar may feature scores 80+ explicitly as research leads, not active trades.
- Below 70: Pass under that model.
- Not Rated: insufficient evidence; never silently regarded as 0 or 50.

These bands are **policy categories**, not probabilities of profitability.

## Known limitations and nonclaims

- Sector-specific valuation and banking/insurance scoring are not yet built. A common ratio threshold is not suitable for every industry.
- Capitalized intangibles, leases, deferred tax assets/liabilities, pension obligations, off-balance-sheet risks, earnings manipulation and competitive durability may not be captured.
- ROIC, trailing P/E and shareholder buyback figures can be distorted by acquisitions, share-count denominator choice, timing and accounting estimates.
- The model has not been trained or backtested with survivorship-bias controls, slippage, transaction costs, look-ahead guards and multiple-testing adjustment.
- VTI/VOO fund structural-quality scores use a **different** model; numeric stock-to-fund comparisons are not estimates of outperformance odds.
- Radar's first-pass market activity ranking is not a full score. Only sufficiently reviewed stocks with at least one 80+ full research category qualify for its featured list; this does not necessarily indicate a good swing trade.
- Never substitute hypothetical future price targets for observed price resistance simply to make reward/risk appear attractive.
- Historical price data do not establish live-market execution quality, especially for OTC, sub-penny or leveraged products.
- The free individual-use data tier is not automatically licensed for commercial resale or redistribution.

## Next validation milestone

Record dated scored results without hindsight. Run point-in-time simulations across multiple business cycles using universe constituents as-of each date, split-adjusted prices, known-at-time financial releases, bid/ask and fee estimates, realistic trade execution, sector benchmarks, and out-of-sample validation. Measure whether 95+ classifications actually improve decision quality relative to 90–94.9 and 80–89.9, and recalibrate thresholds only from defensible evidence.
