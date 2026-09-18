// JSON-file persistence for the prototype. Every mutation rewrites the file,
// which is fine for a demo and trivially swappable for Postgres later — the
// rest of the codebase only talks to the exported functions.
'use strict';

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'db.json');

const SEED = {
  wearers: {
    w_demo: {
      id: 'w_demo',
      name: 'Marcus',
      role: 'Valet · St. Mary’s Hospital',
      photo: '🧑‍✈️',
      phone: '+15550100', // wearer's SMS number (mock)
      payout: {
        provider: 'stripe_instant',      // stripe_instant | bank
        label: 'Revolut ••4821',
        instant: true,
      },
      presetsCents: [100, 200, 500, 1000, 2500], // $1 $2 $5 $10 $25 (+ custom in UI)
    },
  },
  clips: {
    // A physical clip. `demo` is pre-claimed so the prototype works instantly.
    demo: { id: 'demo', wearerId: 'w_demo', claimedAt: '2026-08-01T12:00:00Z' },
  },
  tips: [], // { id, clipId, wearerId, amountCents, feeCents, netCents, chargeId, tipperPhone, createdAt }
};

let db = null;

function load() {
  if (db) return db;
  try {
    db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    db = structuredClone(SEED);
    save();
  }
  return db;
}

function save() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function getClip(clipId) {
  return load().clips[clipId] || null;
}

function getWearer(wearerId) {
  return load().wearers[wearerId] || null;
}

function createWearer({ name, role, phone }) {
  const d = load();
  const id = 'w_' + Math.random().toString(36).slice(2, 10);
  const clipId = 'c_' + Math.random().toString(36).slice(2, 10);
  d.wearers[id] = {
    id, name, role: role || '', photo: '🙂', phone: phone || '',
    payout: { provider: 'stripe_instant', label: 'not connected', instant: false },
    presetsCents: [100, 200, 500, 1000, 2500],
  };
  d.clips[clipId] = { id: clipId, wearerId: null, claimedAt: null, mintedFor: id };
  save();
  return { wearer: d.wearers[id], clipId };
}

function claimClip(clipId, wearerId) {
  const d = load();
  const clip = d.clips[clipId];
  if (!clip) return null;
  clip.wearerId = wearerId;
  clip.claimedAt = new Date().toISOString();
  save();
  return clip;
}

function updateWearerPayout(wearerId, payout) {
  const d = load();
  const w = d.wearers[wearerId];
  if (!w) return null;
  w.payout = { ...w.payout, ...payout };
  save();
  return w;
}

function recordTip(tip) {
  const d = load();
  d.tips.push(tip);
  save();
  return tip;
}

function tipsForWearer(wearerId) {
  return load().tips.filter((t) => t.wearerId === wearerId);
}

module.exports = { getClip, getWearer, createWearer, claimClip, updateWearerPayout, recordTip, tipsForWearer };
