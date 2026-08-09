// TipClip prototype server — zero dependencies, Node 18+.
//
//   node server.js          → http://localhost:8787
//
// Routes:
//   GET  /t/:clipId              tap target (what the NFC tag opens) → tip page
//   GET  /api/clip/:clipId       public wearer profile + presets
//   POST /api/tip                {clipId, amountCents, tipperPhone?} → charge + SMS
//   GET  /api/wearer/:wearerId   dashboard data
//   POST /api/signup             {name, role, phone} → new wearer + unclaimed clip
//   POST /api/clip/:clipId/claim {wearerId}
//   GET  /*                      static files from ../public
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const store = require('./store');
const { getProvider } = require('./payments');
const { getSms } = require('./sms');

const PORT = process.env.PORT || 8787;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

const MIN_TIP_CENTS = 100;      // $1
const MAX_TIP_CENTS = 50000;    // $500 — abuse ceiling for the prototype

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 64 * 1024) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function dollars(cents) {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function clipProfile(clipId) {
  const clip = store.getClip(clipId);
  if (!clip || !clip.wearerId) return null;
  const w = store.getWearer(clip.wearerId);
  if (!w) return null;
  return {
    clipId,
    wearer: { id: w.id, name: w.name, role: w.role, photo: w.photo },
    presetsCents: w.presetsCents,
    instantPayout: Boolean(w.payout && w.payout.instant),
  };
}

async function handleTip(body) {
  const { clipId, amountCents, tipperPhone } = body;
  const clip = store.getClip(clipId);
  if (!clip || !clip.wearerId) return { code: 404, out: { error: 'Unknown or unclaimed clip' } };
  const amount = Math.round(Number(amountCents));
  if (!Number.isFinite(amount) || amount < MIN_TIP_CENTS || amount > MAX_TIP_CENTS) {
    return { code: 400, out: { error: `Tip must be between ${dollars(MIN_TIP_CENTS)} and ${dollars(MAX_TIP_CENTS)}` } };
  }
  const wearer = store.getWearer(clip.wearerId);

  const charge = await getProvider().chargeTip({ amountCents: amount, clipId, wearer });

  const tip = store.recordTip({
    id: 'tip_' + Math.random().toString(36).slice(2, 10),
    clipId,
    wearerId: wearer.id,
    amountCents: amount,
    feeCents: charge.feeCents,
    netCents: charge.netCents,
    chargeId: charge.chargeId,
    tipperPhone: tipperPhone || null,
    createdAt: new Date().toISOString(),
  });

  // Both sides get a text. Sender's charge shows on their bank statement via
  // the card rail; receiver's deposit shows on theirs via the payout rail.
  const sms = getSms();
  const settle = charge.instant ? 'is on its way to your account now' : 'will be deposited within 1–2 business days';
  await sms.send(wearer.phone, `TipClip: you just received a ${dollars(amount)} tip 💸 — ${dollars(charge.netCents)} ${settle}.`);
  if (tipperPhone) {
    await sms.send(tipperPhone, `TipClip: you tipped ${wearer.name} ${dollars(amount)}. It'll appear on your statement as TIPCLIP *${wearer.name.toUpperCase()}.`);
  }

  console.log(`💸 ${dollars(amount)} tip → ${wearer.name} (clip ${clipId}), net ${dollars(charge.netCents)} [${charge.chargeId}]`);
  return { code: 200, out: { ok: true, tipId: tip.id, wearerName: wearer.name, amountCents: amount, clientSecret: charge.clientSecret || null } };
}

function dashboard(wearerId) {
  const w = store.getWearer(wearerId);
  if (!w) return null;
  const tips = store.tipsForWearer(wearerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 864e5).toISOString();
  const sum = (list) => list.reduce((s, t) => s + t.netCents, 0);
  return {
    wearer: { id: w.id, name: w.name, role: w.role, photo: w.photo, payout: w.payout },
    totals: {
      todayCents: sum(tips.filter((t) => t.createdAt >= startOfDay)),
      weekCents: sum(tips.filter((t) => t.createdAt >= weekAgo)),
      allTimeCents: sum(tips),
      count: tips.length,
    },
    recent: tips.slice(0, 25).map((t) => ({ amountCents: t.amountCents, netCents: t.netCents, createdAt: t.createdAt })),
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean);

  try {
    // The NFC tap target: tag is encoded with /t/<clipId>
    if (req.method === 'GET' && parts[0] === 't' && parts[1]) {
      const html = fs.readFileSync(path.join(PUBLIC_DIR, 'tip.html'), 'utf8').replace(/__CLIP_ID__/g, parts[1]);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(html);
    }

    if (parts[0] === 'api') {
      if (req.method === 'GET' && parts[1] === 'clip' && parts[2]) {
        const profile = clipProfile(parts[2]);
        return profile ? json(res, 200, profile) : json(res, 404, { error: 'Unknown or unclaimed clip' });
      }
      if (req.method === 'POST' && parts[1] === 'tip') {
        const { code, out } = await handleTip(await readBody(req));
        return json(res, code, out);
      }
      if (req.method === 'GET' && parts[1] === 'wearer' && parts[2]) {
        const data = dashboard(parts[2]);
        return data ? json(res, 200, data) : json(res, 404, { error: 'Unknown wearer' });
      }
      if (req.method === 'POST' && parts[1] === 'signup') {
        const { name, role, phone } = await readBody(req);
        if (!name) return json(res, 400, { error: 'name required' });
        const { wearer, clipId } = store.createWearer({ name, role, phone });
        return json(res, 200, { wearerId: wearer.id, clipId, tapUrl: `/t/${clipId}` });
      }
      if (req.method === 'POST' && parts[1] === 'clip' && parts[2] && parts[3] === 'claim') {
        const { wearerId } = await readBody(req);
        const clip = store.claimClip(parts[2], wearerId);
        return clip ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Unknown clip' });
      }
      return json(res, 404, { error: 'Not found' });
    }

    // Static files
    const rel = url.pathname === '/' ? 'tip.html' : url.pathname.slice(1);
    const file = path.join(PUBLIC_DIR, path.normalize(rel));
    if (file.startsWith(PUBLIC_DIR) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      return res.end(fs.readFileSync(file));
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  } catch (err) {
    console.error(err);
    json(res, 500, { error: 'Internal error' });
  }
});

server.listen(PORT, () => {
  console.log(`TipClip server on http://localhost:${PORT}`);
  console.log(`  Tap the demo clip:   http://localhost:${PORT}/t/demo`);
  console.log(`  Wearer dashboard:    http://localhost:${PORT}/dashboard.html?wearer=w_demo`);
  console.log(`  Payments: ${getProvider().name} · SMS: ${getSms().name}`);
});
