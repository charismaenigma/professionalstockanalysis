# MarketClarity membership

The public home page introduces MarketClarity and directs searches to `/research`.
Research and `/radar` require a signed-in Clerk user with an eligible Stripe subscription.
`/api/analyze`, `/api/radar`, and `/api/research` repeat the membership check before
calling any data or AI provider. All premium API responses use `private, no-store`.
The cron endpoint retains its independent `CRON_SECRET` authorization.

## Activate enrollment

1. Create a Clerk application for MarketClarity. Configure its production domain
   and sign-in/sign-up routes. Set production `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   and `CLERK_SECRET_KEY` directly in Vercel. Use production keys in Production
   and development keys only in Preview/Development.
2. In the intended Stripe account, create the approved MarketClarity product and
   USD recurring price(s). Set `STRIPE_SECRET_KEY`, `STRIPE_MONTHLY_PRICE_ID`, and
   optionally `STRIPE_ANNUAL_PRICE_ID` in Vercel. Production requires a live key.
   Prefer a restricted key (`rk_live_`) with Customers read/write, Checkout
   Sessions read/write, Prices read, Subscriptions read, and Billing Portal
   Sessions write permissions. Keep key values out of source and chat.
   The initial approved offer is $12.99 USD per month.
3. Set `APP_BASE_URL` to the canonical HTTPS origin. Configure Stripe's customer
   portal to allow payment-method changes and end-of-period cancellation.
4. Choose the applicable tax configuration. If Stripe Tax has been configured,
   set `STRIPE_AUTOMATIC_TAX=true`. Pricing amounts are loaded from Stripe;
   this code does not invent prices or create paid products.
5. Sign in with the owner's account. If owner access without payment is wanted,
   set `MARKETCLARITY_ADMIN_USER_IDS` to that account's Clerk user ID.
6. Register `/api/billing/webhook` as a Stripe webhook destination and set its
   signing secret as `STRIPE_WEBHOOK_SECRET` in Vercel. Subscribe to checkout
   completed, asynchronous payment succeeded/failed, invoice paid/payment failed,
   and subscription created/updated/deleted/paused/resumed events. Use separate
   webhook secrets for testing and live mode. Checkout stays disabled without
   a configured signing secret.
7. Redeploy after adding environment variables. Test sign-up, checkout, billing
   portal, cancellation, and direct protected API requests using separate test
   keys and test prices on a Preview deployment before accepting payments.

Without configuration, the paywall fails closed: premium APIs return 503,
protected pages redirect to pricing, and enrollment is shown as not open.
There is no unauthenticated fallback, automatic demo bypass, or shared password.

## Source of membership access

Stripe customers are linked to Clerk user IDs in server-only private metadata,
with distinct live/test customer IDs. Customer ownership is verified against
Stripe metadata, not email or data supplied by the browser. Only configured
MarketClarity prices qualify; unrelated subscriptions do not grant access.

Each protected request reads Stripe's current subscription state. Only active
or trialing subscriptions with an unexpired matching item qualify. Past-due,
unpaid, canceled, paused, expired, incomplete, and paused-collection subscriptions
do not. End-of-period cancellation remains active until that period ends.
There are no free trials created by this implementation.

Signed webhooks reconcile current subscription state into Clerk private metadata.
The handler verifies the raw-body signature, billing environment, customer owner,
and live/test linkage before updating anything. It checks the current Stripe
state on retries and out-of-order events rather than granting access from an old
payment event. Unpaid checkout completion is acknowledged without fulfillment.
Provider errors return 503 so Stripe can retry. The metadata snapshot is not an
authorization shortcut: protected requests still read current Stripe status.
The checkout return page does not trust success parameters. Provider failures
fail closed. This incurs Clerk/Stripe API calls for authorization.

Checkout and portal endpoints require a matching Origin and authenticated user.
Price IDs are an allowlist, payment customer IDs come from trusted server
metadata, and billing return destinations are restricted to research/radar.
Existing memberships cannot open another subscription checkout. Customer
creation is idempotent; open MarketClarity checkout sessions are reused or closed
when the requested plan changes.

## Launch prerequisites

Confirm the market-data provider permits commercial subscriber access. Protect
old public Vercel deployment URLs too: source changes secure only new builds.
AI usage quotas/rate limits are separate work and are not claimed by this paywall.
