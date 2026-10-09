// TipClip API as a single Vercel serverless function.
//
// vercel.json rewrites /api/* here. Keeping every endpoint in ONE function
// means one warm instance holds the in-memory store, so the functional demo
// loop (tip on one phone → dashboard updates on another) works with zero
// external services. State is also mirrored to /tmp to survive warm
// restarts; a cold start re-seeds the demo data. For production, swap the
// store for Postgres and the mock charge for a payment-gateway provider —
// in the UAE: Network International (N-Genius), Telr, PayTabs or
// Checkout.com, all supporting Apple Pay / Google Pay / Samsung Pay.
'use strict';

const fs = require('fs');

const TMP = '/tmp/tipclip-db.json';
const MIN_TIP = 100;
const MAX_TIP = 50000;

function seed() {
  const now = Date.now();
  return {
    wearers: {
      w_demo: {
        id: 'w_demo', name: 'Marcus', role: 'Valet · City Hospital', photo: '🧑‍✈️',
        phone: '+971550000001',
        payout: { provider: 'gateway_instant', label: 'Revolut ••4821', instant: true },
        presetsCents: [100, 200, 500, 1000, 2500],
      },
    },
    clips: { demo: { id: 'demo', wearerId: 'w_demo' } },
    tips: [2, 11, 26].map((hoursAgo, i) => ({
      id: 'tip_seed_' + i,
      clipId: 'demo', wearerId: 'w_demo',
      amountCents: [500, 200, 1000][i],
      feeCents: [55, 40, 80][i],
      netCents: [445, 160, 920][i],
      createdAt: new Date(now - hoursAgo * 3600e3).toISOString(),
    })),
  };
}

let db = null;
function load() {
  if (db) return db;
  try { db = JSON.parse(fs.readFileSync(TMP, 'utf8')); } catch { db = seed(); }
  return db;
}
function save() {
  try { fs.writeFileSync(TMP, JSON.stringify(db)); } catch { /* best effort */ }
}

const dollars = (c) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const rid = (p) => p + '_' + Math.random().toString(36).slice(2, 10);

function clipProfile(d, clipId) {
  const clip = d.clips[clipId];
  const w = clip && clip.wearerId && d.wearers[clip.wearerId];
  if (!w) return null;
  return {
    clipId,
    wearer: { id: w.id, name: w.name, role: w.role, photo: w.photo },
    presetsCents: w.presetsCents,
    instantPayout: Boolean(w.payout && w.payout.instant),
  };
}

function dashboard(d, wearerId) {
  const w = d.wearers[wearerId];
  if (!w) return null;
  const tips = d.tips.filter((t) => t.wearerId === wearerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 864e5).toISOString();
  const sum = (list) => list.reduce((s, t) => s + t.netCents, 0);
  return {
    wearer: { id: w.id, name: w.name, role: w.role, photo: w.photo, payout: w.payout },
    totals: {
      todayCents: sum(tips.filter((t) => t.createdAt >= dayStart)),
      weekCents: sum(tips.filter((t) => t.createdAt >= weekAgo)),
      allTimeCents: sum(tips),
      count: tips.length,
    },
    recent: tips.slice(0, 25).map((t) => ({ amountCents: t.amountCents, netCents: t.netCents, createdAt: t.createdAt })),
  };
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 64 * 1024) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
  });
}

module.exports = async (req, res) => {
  const d = load();
  const url = new URL(req.url, 'http://x');
  // Path arrives either as the original /api/... URL or via the rewrite's
  // ?path= query — support both.
  let path = url.pathname.replace(/^\/api\/?/, '');
  if (!path || path === 'index') path = (url.searchParams.get('path') || '').replace(/,/g, '/');
  const parts = path.split('/').filter(Boolean);
  const json = (code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };

  try {
    if (req.method === 'GET' && parts[0] === 'clip' && parts[1]) {
      const profile = clipProfile(d, parts[1]);
      return profile ? json(200, profile) : json(404, { error: 'Unknown or unclaimed clip' });
    }

    if (req.method === 'POST' && parts[0] === 'tip') {
      const { clipId, amountCents, tipperPhone } = await readBody(req);
      const profile = clipProfile(d, clipId);
      if (!profile) return json(404, { error: 'Unknown or unclaimed clip' });
      const amount = Math.round(Number(amountCents));
      if (!Number.isFinite(amount) || amount < MIN_TIP || amount > MAX_TIP) {
        return json(400, { error: `Tip must be between ${dollars(MIN_TIP)} and ${dollars(MAX_TIP)}` });
      }
      const fee = Math.min(amount, 30 + Math.round(amount * 0.05));
      const tip = {
        id: rid('tip'), clipId, wearerId: profile.wearer.id,
        amountCents: amount, feeCents: fee, netCents: amount - fee,
        createdAt: new Date().toISOString(),
      };
      d.tips.push(tip);
      save();
      const smsPreview = [
        `To ${profile.wearer.name}: you just received a ${dollars(amount)} tip 💸 — ${dollars(tip.netCents)} is on its way to your account now.`,
      ];
      if (tipperPhone) {
        smsPreview.push(`To you (${tipperPhone}): you tipped ${profile.wearer.name} ${dollars(amount)}. It'll appear on your statement as TIPCLIP *${profile.wearer.name.toUpperCase()}.`);
      }
      return json(200, { ok: true, tipId: tip.id, wearerName: profile.wearer.name, amountCents: amount, smsPreview });
    }

    if (req.method === 'GET' && parts[0] === 'wearer' && parts[1] && !parts[2]) {
      const data = dashboard(d, parts[1]);
      return data ? json(200, data) : json(404, { error: 'Unknown wearer' });
    }

    if (req.method === 'POST' && parts[0] === 'signup') {
      const { name, role, phone } = await readBody(req);
      if (!name) return json(400, { error: 'name required' });
      const wearerId = rid('w');
      const clipId = rid('c');
      d.wearers[wearerId] = {
        id: wearerId, name, role: role || '', photo: '🙂', phone: phone || '',
        payout: { provider: 'gateway_instant', label: 'not connected', instant: false },
        presetsCents: [100, 200, 500, 1000, 2500],
      };
      d.clips[clipId] = { id: clipId, wearerId: null };
      save();
      return json(200, { wearerId, clipId, tapUrl: `/t/${clipId}` });
    }

    if (req.method === 'POST' && parts[0] === 'wearer' && parts[1] && parts[2] === 'payout') {
      const { label, instant } = await readBody(req);
      const w = d.wearers[parts[1]];
      if (!w) return json(404, { error: 'Unknown wearer' });
      if (!label) return json(400, { error: 'label required' });
      w.payout = { ...w.payout, label, instant: Boolean(instant) };
      save();
      return json(200, { ok: true, payout: w.payout });
    }

    if (req.method === 'POST' && parts[0] === 'clip' && parts[1] && parts[2] === 'claim') {
      const { wearerId } = await readBody(req);
      const clip = d.clips[parts[1]];
      if (!clip) return json(404, { error: 'Unknown clip' });
      clip.wearerId = wearerId;
      save();
      return json(200, { ok: true });
    }

    return json(404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    return json(500, { error: 'Internal error' });
  }
};
