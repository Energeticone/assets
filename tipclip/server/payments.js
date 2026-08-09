// Payment rail abstraction.
//
// Every provider implements:
//   chargeTip({ amountCents, clipId, wearer }) -> { chargeId, feeCents, netCents, instant }
//
// The platform fee model used throughout: $0.30 + 5% of the tip, and the net
// is pushed to the wearer's payout destination. With Stripe Instant Payouts
// the money lands on the wearer's debit card (Revolut cards included) in
// minutes; a plain bank account gets a standard 1-2 day payout.
'use strict';

const PLATFORM_FEE_FIXED_CENTS = 30;
const PLATFORM_FEE_RATE = 0.05;

function platformFee(amountCents) {
  return Math.min(amountCents, PLATFORM_FEE_FIXED_CENTS + Math.round(amountCents * PLATFORM_FEE_RATE));
}

// ---------------------------------------------------------------------------
// Mock provider — default. Instant success so the prototype runs end-to-end
// with no keys or network access.
// ---------------------------------------------------------------------------
const mockProvider = {
  name: 'mock',
  async chargeTip({ amountCents, clipId }) {
    const feeCents = platformFee(amountCents);
    return {
      chargeId: 'ch_mock_' + Math.random().toString(36).slice(2, 10),
      feeCents,
      netCents: amountCents - feeCents,
      instant: true,
      _note: `mock charge for clip ${clipId}`,
    };
  },
};

// ---------------------------------------------------------------------------
// Stripe Connect provider — the production v1 rail.
//
// Setup per wearer (done once during signup, not per tip):
//   1. POST /v1/accounts            type=express  -> acct_… stored on wearer
//   2. POST /v1/account_links       -> hosted KYC onboarding URL
//   3. Wearer adds a debit card     -> enables Instant Payouts (Revolut and
//      most bank debit cards are eligible; payout arrives in ~minutes).
//
// Per tip (below): a destination charge that routes amount-minus-fee to the
// wearer's connected account. The tipper pays with Apple Pay / Google Pay via
// Stripe Payment Element on the tip page.
// ---------------------------------------------------------------------------
const stripeProvider = {
  name: 'stripe',
  async chargeTip({ amountCents, wearer }) {
    const key = process.env.STRIPE_SECRET_KEY;
    const acct = wearer.payout.stripeAccountId;
    if (!key || !acct) throw new Error('Stripe not configured for this wearer');
    const feeCents = platformFee(amountCents);
    const body = new URLSearchParams({
      amount: String(amountCents),
      currency: 'usd',
      'automatic_payment_methods[enabled]': 'true',
      application_fee_amount: String(feeCents),
      'transfer_data[destination]': acct,
      description: `TipClip tip for ${wearer.name}`,
    });
    const res = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error(`Stripe error ${res.status}: ${await res.text()}`);
    const pi = await res.json();
    return {
      chargeId: pi.id,
      feeCents,
      netCents: amountCents - feeCents,
      instant: Boolean(wearer.payout.instant),
      clientSecret: pi.client_secret, // returned to the tip page to confirm with Apple Pay
    };
  },
};

// ---------------------------------------------------------------------------
// Revolut note: Revolut Business has a Merchant API, but the simplest way to
// give wearers "instant deposit to my Revolut" is Stripe Instant Payouts to
// their Revolut debit card — no extra integration. A native Revolut Merchant
// adapter would slot in here with the same chargeTip() signature.
// ---------------------------------------------------------------------------

function getProvider() {
  return process.env.STRIPE_SECRET_KEY ? stripeProvider : mockProvider;
}

module.exports = { getProvider, platformFee };
