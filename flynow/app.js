/* FLYNOW — a self-contained flight-booking demo.
 *
 * Search → departing flight → return flight → guests → extras → payment →
 * confirmation, with a persistent trip-summary rail. Everything (schedules,
 * prices, booking reference) is generated deterministically in the browser;
 * no network calls, no real airline, no real tickets.
 */
(() => {
  "use strict";

  /* ---------------- data ---------------- */

  const AIRPORTS = [
    { code: "AUH", city: "Abu Dhabi",  name: "Zayed Intl",          lat: 24.433,  lon: 54.651,  tz: 4 },
    { code: "DXB", city: "Dubai",      name: "Dubai Intl",          lat: 25.253,  lon: 55.365,  tz: 4 },
    { code: "SIN", city: "Singapore",  name: "Changi",              lat: 1.364,   lon: 103.991, tz: 8 },
    { code: "BKK", city: "Bangkok",    name: "Suvarnabhumi",        lat: 13.690,  lon: 100.750, tz: 7 },
    { code: "BOM", city: "Mumbai",     name: "Chhatrapati Shivaji", lat: 19.089,  lon: 72.868,  tz: 5.5 },
    { code: "MLE", city: "Malé",       name: "Velana Intl",         lat: 4.192,   lon: 73.529,  tz: 5 },
    { code: "IST", city: "Istanbul",   name: "Istanbul Airport",    lat: 41.275,  lon: 28.752,  tz: 3 },
    { code: "CAI", city: "Cairo",      name: "Cairo Intl",          lat: 30.122,  lon: 31.406,  tz: 3 },
    { code: "LHR", city: "London",     name: "Heathrow",            lat: 51.470,  lon: -0.454,  tz: 1 },
    { code: "CDG", city: "Paris",      name: "Charles de Gaulle",   lat: 49.010,  lon: 2.548,   tz: 2 },
    { code: "GVA", city: "Geneva",     name: "Genève Aéroport",     lat: 46.238,  lon: 6.109,   tz: 2 },
    { code: "JFK", city: "New York",   name: "John F. Kennedy",     lat: 40.641,  lon: -73.778, tz: -4 },
    { code: "NRT", city: "Tokyo",      name: "Narita",              lat: 35.772,  lon: 140.393, tz: 9 },
    { code: "SYD", city: "Sydney",     name: "Kingsford Smith",     lat: -33.946, lon: 151.177, tz: 10 },
  ];
  const AP = Object.fromEntries(AIRPORTS.map(a => [a.code, a]));

  const CABINS = {
    economy:  { label: "Economy",  mult: 1 },
    business: { label: "Business", mult: 3.05 },
    first:    { label: "First",    mult: 5.3 },
  };

  const FARES = {
    economy: [
      { tier: "Basic",   mult: 1,    perk: "23 kg bag · seat for a fee" },
      { tier: "Comfort", mult: 1.18, perk: "30 kg bag · standard seat" },
      { tier: "Deluxe",  mult: 1.42, perk: "35 kg bag · any seat · flexible" },
    ],
    business: [
      { tier: "Basic",  mult: 1,    perk: "40 kg bag · lounge access" },
      { tier: "Deluxe", mult: 1.42, perk: "40 kg bag · lounge + chauffeur" },
    ],
    first: [
      { tier: "Deluxe", mult: 1.42, perk: "50 kg bag · suite · chauffeur" },
    ],
  };

  const PERKS = {
    economy:  ["🍽 Dining on board", "📶 Wi-Fi chat plan", "🧳 Checked baggage", "🎬 Entertainment"],
    business: ["🚗 Airport chauffeur", "🛋 Lounge access", "🧳 Priority baggage", "🛂 Fast track", "📶 Wi-Fi", "💺 Lie-flat seat"],
    first:    ["👨‍👩‍👧 Family check-in", "🚗 Airport chauffeur", "🧳 Priority baggage", "🛂 Fast track", "📶 Wi-Fi", "💺 Private suite"],
  };
  const PERK_ICON = s => s.split(" ")[0];

  const EXTRAS = [
    { id: "bags",      icon: "🧳", art: "#5b6d7e", title: "Extra baggage",    desc: "More bags, more savings.",          price: 340, per: "per direction", scope: "direction" },
    { id: "meet",      icon: "🤝", art: "#a8853d", title: "Meet & Assist",    desc: "Effortless airport experience.",    price: 520, per: "per direction", scope: "direction", cta: "Opt-in" },
    { id: "insurance", icon: "🛡", art: "#37a3a0", title: "Travel Insurance", desc: "Protection for every journey.",     price: 89,  per: "per guest",     scope: "guest" },
    { id: "chauffeur", icon: "🚘", art: "#22313f", title: "Chauffeur",        desc: "Door-to-door, both ends of every flight.", price: 380, per: "per direction", scope: "direction" },
  ];

  const TAX_RATE = 0.12;
  const FEE_PER_GUEST_LEG = 165;

  /* ---------------- helpers ---------------- */

  const $ = sel => document.querySelector(sel);
  const flowEl = $("#flow"), railEl = $("#rail"), stepperEl = $("#stepper");

  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const fmt = n => "AED " + Math.round(n).toLocaleString("en-US");

  function haversine(a, b) {
    const R = 6371, r = Math.PI / 180;
    const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // Deterministic RNG so a given route + date always shows the same schedule.
  function seeded(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return () => {
      h = Math.imul(h ^ (h >>> 15), 2246822519);
      h = Math.imul(h ^ (h >>> 13), 3266489917);
      return ((h ^= h >>> 16) >>> 0) / 4294967296;
    };
  }

  const pad2 = n => String(n).padStart(2, "0");
  const hm = min => { const m = ((min % 1440) + 1440) % 1440; return pad2(Math.floor(m / 60)) + ":" + pad2(m % 60); };

  function dateLabel(iso) {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  }
  function isoPlusDays(base, days) {
    const d = base ? new Date(base + "T12:00:00") : new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function flightsFor(from, to, dateIso) {
    const a = AP[from], b = AP[to];
    const dist = haversine(a, b);
    const durMin = Math.round((dist / 860 + 0.67) * 12) * 5; // block time, 5-min steps
    const rng = seeded(from + to + dateIso);
    const count = 3;
    const flights = [];
    for (let i = 0; i < count; i++) {
      const depMin = Math.round((rng() * 1300 + 60) / 5) * 5;
      const arrAbs = depMin + durMin + (b.tz - a.tz) * 60;
      const arrMin = ((arrAbs % 1440) + 1440) % 1440;
      const jitter = 0.92 + rng() * 0.16; // ±8% price spread between departures
      flights.push({
        id: from + to + dateIso + "#" + i,
        no: "FN" + (100 + Math.floor(rng() * 880)),
        from, to, dateIso, dist, durMin,
        dep: hm(depMin),
        arr: hm(arrMin),
        plusDays: Math.floor(arrAbs / 1440),
        base: (220 + dist * 0.32) * jitter, // economy Basic, per adult, one-way
      });
    }
    flights.sort((x, y) => x.dep.localeCompare(y.dep));
    return flights;
  }

  const durLabel = m => Math.floor(m / 60) + "h" + (m % 60 ? " " + (m % 60) + "m" : "");

  function farePP(flight, cabin, tier) {
    const f = FARES[cabin].find(t => t.tier === tier);
    return flight.base * CABINS[cabin].mult * f.mult;
  }

  /* ---------------- state ---------------- */

  const S = {
    step: "search",
    from: "AUH", to: "SIN",
    depart: isoPlusDays(null, 10), ret: isoPlusDays(null, 19),
    roundTrip: true,
    adults: 2, children: 1,
    browseCabin: "first",
    out: null,   // {flight, cabin, tier}
    back: null,
    guests: [],
    extras: { bags: false, meet: false, insurance: false, chauffeur: false },
    ref: null,
    toast: null,
    open: {},    // expanded rail rows
  };

  const guestCount = () => S.adults + S.children;
  const legs = () => [S.out, S.back].filter(Boolean);
  const directions = () => (S.roundTrip ? 2 : 1);

  function chauffeurIncluded() {
    return legs().some(l =>
      (l.cabin === "first") || (l.cabin === "business" && l.tier === "Deluxe"));
  }

  function fareTotal() {
    let t = 0;
    for (const l of legs()) t += farePP(l.flight, l.cabin, l.tier) * (S.adults + S.children * 0.75);
    return t;
  }
  function taxesTotal() {
    return fareTotal() * TAX_RATE + FEE_PER_GUEST_LEG * guestCount() * legs().length;
  }
  function extrasTotal() {
    let t = 0;
    for (const x of EXTRAS) {
      if (!S.extras[x.id]) continue;
      if (x.id === "chauffeur" && chauffeurIncluded()) continue;
      t += x.scope === "guest" ? x.price * guestCount() : x.price * directions();
    }
    return t;
  }
  const grandTotal = () => fareTotal() + taxesTotal() + extrasTotal();

  /* ---------------- rendering: shell ---------------- */

  const STEPS = [
    ["outbound", "Departing flight"],
    ["return",   "Return flight"],
    ["guests",   "Guests"],
    ["extras",   "Extras"],
    ["pay",      "Payment"],
  ];

  function render() {
    renderStepper();
    renderFlow();
    renderRail();
    window.scrollTo({ top: 0 });
  }

  function renderStepper() {
    const order = STEPS.filter(([k]) => k !== "return" || S.roundTrip);
    const idx = order.findIndex(([k]) => k === S.step);
    const show = idx >= 0;
    stepperEl.hidden = !show;
    if (!show) return;
    stepperEl.innerHTML = order.map(([k, label], i) => {
      const cls = i < idx ? "is-done" : i === idx ? "is-active" : "";
      const dot = i < idx ? "✓" : i + 1;
      return `<span class="step ${cls}"><span class="dot">${dot}</span>${label}</span>`;
    }).join("");
  }

  function renderRail() {
    const hasRail = S.step !== "search" && legs().length > 0;
    railEl.hidden = !hasRail;
    document.querySelector(".layout").classList.toggle("no-rail", !hasRail);
    if (hasRail) railEl.innerHTML = railHTML();
  }

  /* ---------------- rendering: steps ---------------- */

  function renderFlow() {
    switch (S.step) {
      case "search":    return renderSearch();
      case "outbound":  return renderFlights("outbound");
      case "return":    return renderFlights("return");
      case "guests":    return renderGuests();
      case "extras":    return renderExtras();
      case "pay":       return renderPay();
      case "confirmed": return renderConfirmed();
    }
  }

  function airportOptions(sel) {
    return AIRPORTS.map(a =>
      `<option value="${a.code}" ${a.code === sel ? "selected" : ""}>${a.city} (${a.code})</option>`).join("");
  }

  function renderSearch() {
    flowEl.innerHTML = `
      <div class="hero">
        <h1>Where to next?</h1>
        <p>Fly the world in comfort — pick a route and we'll take care of the rest.</p>
        <form id="searchForm">
          <div class="search-grid">
            <label class="field"><span>From</span>
              <select name="from">${airportOptions(S.from)}</select></label>
            <label class="field"><span>To</span>
              <select name="to">${airportOptions(S.to)}</select></label>
            <label class="field"><span>Departing</span>
              <input type="date" name="depart" value="${S.depart}" min="${isoPlusDays(null, 1)}"></label>
            <label class="field"><span>Returning</span>
              <input type="date" name="ret" value="${S.roundTrip ? S.ret : ""}" min="${isoPlusDays(null, 1)}"></label>
            <label class="field"><span>Adults</span>
              <select name="adults">${[1,2,3,4,5,6].map(n => `<option ${n===S.adults?"selected":""}>${n}</option>`).join("")}</select></label>
            <label class="field"><span>Children</span>
              <select name="children">${[0,1,2,3,4].map(n => `<option ${n===S.children?"selected":""}>${n}</option>`).join("")}</select></label>
            <label class="field"><span>Cabin</span>
              <select name="cabin">${Object.entries(CABINS).map(([k, c]) =>
                `<option value="${k}" ${k===S.browseCabin?"selected":""}>${c.label}</option>`).join("")}</select></label>
            <div class="swap-row"><button type="button" class="swap-btn" id="swapBtn" title="Swap origin and destination">⇄ Swap</button></div>
          </div>
          <p class="form-error" id="searchError"></p>
          <div class="search-actions">
            <button class="btn btn-gold" type="submit">Search flights</button>
          </div>
        </form>
      </div>`;

    $("#swapBtn").onclick = () => {
      const f = $("#searchForm");
      [f.from.value, f.to.value] = [f.to.value, f.from.value];
    };
    $("#searchForm").onsubmit = e => {
      e.preventDefault();
      const f = e.target;
      const err = $("#searchError");
      if (f.from.value === f.to.value) {
        err.textContent = "Pick two different airports."; err.classList.add("show"); return;
      }
      if (f.ret.value && f.ret.value < f.depart.value) {
        err.textContent = "The return date is before the departure date."; err.classList.add("show"); return;
      }
      Object.assign(S, {
        from: f.from.value, to: f.to.value,
        depart: f.depart.value, ret: f.ret.value,
        roundTrip: !!f.ret.value,
        adults: +f.adults.value, children: +f.children.value,
        browseCabin: f.cabin.value,
        out: null, back: null, ref: null,
        extras: { bags: false, meet: false, insurance: false, chauffeur: false },
        step: "outbound",
      });
      render();
    };
  }

  function renderFlights(which) {
    const [from, to, dateIso] = which === "outbound"
      ? [S.from, S.to, S.depart] : [S.to, S.from, S.ret];
    const flights = flightsFor(from, to, dateIso);
    const cabin = S.browseCabin;

    flowEl.innerHTML = `
      <div class="card">
        <div class="route-head">
          <h2>${which === "outbound" ? "Choose your departing flight" : "Choose your return flight"}</h2>
          <span class="date">${AP[from].city} → ${AP[to].city} · ${dateLabel(dateIso)}</span>
        </div>
        <p class="sub">Showing <strong>${CABINS[cabin].label}</strong> fares, per guest each way.
          ${Object.keys(CABINS).filter(k => k !== cabin).map(k =>
            `<button class="linklike cabin-switch" data-cabin="${k}">See ${CABINS[k].label}</button>`).join(" · ")}
        </p>
        ${flights.map(fl => `
          <div class="flight">
            <div class="flight-times">
              <div class="ft-col"><div class="t">${fl.dep}</div><div class="a">${fl.from}</div></div>
              <div class="ft-mid">
                <div class="ft-line">✈</div>
                Non-stop ${durLabel(fl.durMin)}
                ${fl.plusDays ? `<div class="plus-day">+${fl.plusDays} day${fl.plusDays > 1 ? "s" : ""}</div>` : ""}
                <div class="flight-no">${fl.no}</div>
              </div>
              <div class="ft-col"><div class="t">${fl.arr}</div><div class="a">${fl.to}</div></div>
            </div>
            <div class="fares">
              ${FARES[cabin].map(t => `
                <button class="fare" data-flight="${fl.id}" data-cabin="${cabin}" data-tier="${t.tier}">
                  <span class="cabin">${CABINS[cabin].label}</span>
                  <span class="tier">${t.tier}</span>
                  <span class="perk">${t.perk}</span>
                  <span class="price">${fmt(farePP(fl, cabin, t.tier))} <small>/ guest</small></span>
                </button>`).join("")}
            </div>
          </div>`).join("")}
        <p style="margin:18px 0 0"><button class="linklike" id="backBtn">‹ Back</button></p>
      </div>`;

    flowEl.querySelectorAll(".cabin-switch").forEach(b => b.onclick = () => {
      S.browseCabin = b.dataset.cabin; render();
    });
    flowEl.querySelectorAll(".fare").forEach(b => b.onclick = () => {
      const fl = flights.find(x => x.id === b.dataset.flight);
      const pick = { flight: fl, cabin: b.dataset.cabin, tier: b.dataset.tier };
      if (which === "outbound") {
        S.out = pick;
        S.step = S.roundTrip ? "return" : "guests";
      } else {
        S.back = pick;
        S.step = "guests";
      }
      render();
    });
    $("#backBtn").onclick = () => {
      S.step = which === "outbound" ? "search" : "outbound";
      if (which === "return") S.back = null; else S.out = null;
      render();
    };
  }

  function renderGuests() {
    if (S.guests.length !== guestCount()) {
      S.guests = [
        ...Array.from({ length: S.adults },   (_, i) => ({ type: "Adult", n: i + 1, title: "Mr", first: "", last: "" })),
        ...Array.from({ length: S.children }, (_, i) => ({ type: "Child", n: i + 1, title: "Miss", first: "", last: "" })),
      ];
    }
    flowEl.innerHTML = `
      <div class="card">
        <h2>Who's travelling?</h2>
        <p class="sub">Names as they appear on each guest's passport.</p>
        <form id="guestForm" class="guest-form">
          ${S.guests.map((g, i) => `
            <div class="guest-block">
              <h3>${g.type} ${g.n}</h3>
              <div class="guest-grid">
                <select name="title${i}">
                  ${["Mr", "Mrs", "Ms", "Miss", "Mstr"].map(t => `<option ${t===g.title?"selected":""}>${t}</option>`).join("")}
                </select>
                <input name="first${i}" placeholder="First name" value="${esc(g.first)}" required>
                <input name="last${i}"  placeholder="Last name"  value="${esc(g.last)}"  required>
              </div>
            </div>`).join("")}
          <div class="actions-row">
            <button class="linklike" type="button" id="backBtn">‹ Back</button>
            <button class="btn btn-slate" type="submit">Continue to extras</button>
          </div>
        </form>
      </div>`;

    $("#backBtn").onclick = () => { S.step = S.roundTrip ? "return" : "outbound"; render(); };
    $("#guestForm").onsubmit = e => {
      e.preventDefault();
      const f = e.target;
      S.guests.forEach((g, i) => {
        g.title = f["title" + i].value;
        g.first = f["first" + i].value.trim();
        g.last  = f["last" + i].value.trim();
      });
      S.step = "extras";
      render();
    };
  }

  function extraCardHTML(x, { post } = {}) {
    const included = x.id === "chauffeur" && chauffeurIncluded();
    const added = S.extras[x.id];
    const priceLine = included
      ? `<span class="x-price">Complimentary with your fare</span>`
      : `<span class="x-price">${fmt(x.price)} ${x.per}</span>`;
    const label = included ? "Included"
      : added ? "✓ Added — remove"
      : (x.cta || "Add");
    return `
      <div class="extra">
        <div class="extra-art" style="background:${x.art}">${x.icon}</div>
        <div>
          <h3>${x.title}</h3>
          <p>${x.desc}</p>
          ${priceLine}
        </div>
        ${included
          ? `<span class="chip">Included</span>`
          : `<button class="gold-link ${added ? "added" : ""}" data-extra="${x.id}" data-post="${post ? 1 : 0}">${label}</button>`}
      </div>`;
  }

  function bindExtraButtons() {
    flowEl.querySelectorAll("[data-extra]").forEach(b => b.onclick = () => {
      const id = b.dataset.extra;
      S.extras[id] = !S.extras[id];
      if (b.dataset.post === "1" && S.extras[id]) {
        toast(`${EXTRAS.find(x => x.id === id).title} added to your booking.`);
      }
      render();
    });
  }

  function renderExtras() {
    flowEl.innerHTML = `
      <div class="card">
        <h2>Extras</h2>
        <p class="sub">Enhance your travel experience.</p>
        <div class="extras-grid">
          ${EXTRAS.map(x => extraCardHTML(x)).join("")}
        </div>
        <div class="actions-row" style="margin-top:22px">
          <button class="linklike" id="backBtn">‹ Back</button>
          <button class="btn btn-slate" id="toPay">Continue to payment</button>
        </div>
      </div>`;
    bindExtraButtons();
    $("#backBtn").onclick = () => { S.step = "guests"; render(); };
    $("#toPay").onclick = () => { S.step = "pay"; render(); };
  }

  function payRowsHTML() {
    const rows = [];
    for (const l of legs()) {
      const dirn = `${AP[l.flight.from].city} → ${AP[l.flight.to].city}`;
      rows.push([`${CABINS[l.cabin].label} ${l.tier} · ${dirn}
        <span class="muted">(${S.adults} adult${S.adults > 1 ? "s" : ""}${S.children ? `, ${S.children} child${S.children > 1 ? "ren" : ""}` : ""})</span>`,
        farePP(l.flight, l.cabin, l.tier) * (S.adults + S.children * 0.75)]);
    }
    for (const x of EXTRAS) {
      if (!S.extras[x.id]) continue;
      if (x.id === "chauffeur" && chauffeurIncluded()) continue;
      const qty = x.scope === "guest" ? guestCount() : directions();
      rows.push([`${x.title} <span class="muted">× ${qty}</span>`, x.price * qty]);
    }
    rows.push([`Taxes, fees & surcharges`, taxesTotal()]);
    return rows.map(([label, amt]) =>
      `<tr><td>${label}</td><td>${fmt(amt)}</td></tr>`).join("");
  }

  function renderPay() {
    flowEl.innerHTML = `
      <div class="card">
        <h2>Payment</h2>
        <p class="sub">Review your trip, then pay to confirm. (Demo — no card is charged, so any details work.)</p>
        <table class="pay-table">
          ${payRowsHTML()}
          <tr class="total"><td>Total (including taxes)</td><td>${fmt(grandTotal())}</td></tr>
        </table>
        <form id="payForm">
          <div class="pay-form">
            <input name="card" placeholder="Card number" value="4111 1111 1111 1111" required>
            <input name="exp"  placeholder="MM/YY" value="12/28" required>
            <input name="cvv"  placeholder="CVV" value="123" required>
          </div>
          <p class="pay-note">Payments are simulated locally. Nothing leaves your browser.</p>
          <div class="actions-row" style="margin-top:18px">
            <button class="linklike" type="button" id="backBtn">‹ Back</button>
            <button class="btn btn-gold" type="submit">Pay ${fmt(grandTotal())}</button>
          </div>
        </form>
      </div>`;
    $("#backBtn").onclick = () => { S.step = "extras"; render(); };
    $("#payForm").onsubmit = e => {
      e.preventDefault();
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      S.ref = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
      S.step = "confirmed";
      render();
    };
  }

  function seatsFor(legIndex) {
    const l = legs()[legIndex];
    const rng = seeded("seats" + (S.ref || "") + l.flight.id);
    const row = l.cabin === "first" ? 1 + Math.floor(rng() * 3)
      : l.cabin === "business" ? 4 + Math.floor(rng() * 8)
      : 14 + Math.floor(rng() * 30);
    return S.guests.map((_, i) => row + "" + "ACDFGH"[i % 6]);
  }

  function renderConfirmed() {
    const pending = EXTRAS.filter(x =>
      !S.extras[x.id] && !(x.id === "chauffeur" && chauffeurIncluded()) && x.id !== "chauffeur");
    flowEl.innerHTML = `
      <div class="card">
        <div class="confirm-head">
          <div class="check">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5L19.5 7"/></svg>
          </div>
          <div>
            <h1>Your booking is confirmed</h1>
            <p class="lede">Your flights are booked, you will receive a confirmation email to your booking details.</p>
            <p class="confirm-meta">Booking reference number: <strong>${S.ref}</strong></p>
            <p class="confirm-meta">Total price (including taxes): <strong>${fmt(grandTotal())}</strong></p>
            <div class="confirm-links">
              <button class="linklike" id="shareBtn">Share flight details</button>
              <span class="sep">|</span>
              <button class="linklike" id="manageBtn">Manage your booking</button>
            </div>
          </div>
        </div>
      </div>

      <button class="banner-row" id="chauffeurRow">
        <span style="font-size:26px">🚘</span>
        ${chauffeurIncluded()
          ? "FLYNOW Chauffeur — included with your fare"
          : S.extras.chauffeur ? "FLYNOW Chauffeur — booked ✓" : "Book FLYNOW Chauffeur"}
        <span class="chev">›</span>
      </button>

      ${pending.length ? `
      <div class="card">
        <h2>Extras</h2>
        <p class="sub">Enhance your travel experience.</p>
        <div class="extras-grid">
          ${pending.map(x => extraCardHTML(x, { post: true })).join("")}
        </div>
      </div>` : ""}

      <div class="card">
        <button class="rail-line" id="payToggle" aria-expanded="${S.open.pay ? "true" : "false"}" style="font-size:19px;font-weight:600;color:var(--ink)">
          Payment summary <span class="chev">⌄</span>
        </button>
        ${S.open.pay ? `<table class="pay-table" style="margin-top:12px">
          ${payRowsHTML()}
          <tr class="total"><td>Total paid</td><td>${fmt(grandTotal())}</td></tr>
        </table>` : ""}
      </div>

      <p><button class="btn btn-ghost" id="newSearch">Book another trip</button></p>
      ${S.toast ? `<p class="confirm-meta" style="color:var(--green);font-weight:600">${esc(S.toast)}</p>` : ""}`;

    bindExtraButtons();
    $("#payToggle").onclick = () => { S.open.pay = !S.open.pay; render(); };
    $("#chauffeurRow").onclick = () => {
      if (chauffeurIncluded()) { toast("Chauffeur is already included with your fare — we'll be in touch to schedule pick-up."); return; }
      S.extras.chauffeur = !S.extras.chauffeur;
      toast(S.extras.chauffeur ? "Chauffeur added to your booking." : "Chauffeur removed.");
      render();
    };
    $("#manageBtn").onclick = () =>
      toast("This is a demo booking — there's nothing real to manage, but your imaginary seats are excellent.");
    $("#shareBtn").onclick = async () => {
      const lines = legs().map(l =>
        `${l.flight.from} → ${l.flight.to} · ${dateLabel(l.flight.dateIso)} · dep ${l.flight.dep} arr ${l.flight.arr}` +
        ` · ${CABINS[l.cabin].label} ${l.tier} (${l.flight.no})`);
      const text = `FLYNOW demo booking ${S.ref}\n${lines.join("\n")}\nTotal ${fmt(grandTotal())}`;
      try { await navigator.clipboard.writeText(text); toast("Flight details copied to clipboard."); }
      catch { toast(text); }
    };
    $("#newSearch").onclick = () => { S.step = "search"; S.toast = null; render(); };
  }

  function toast(msg) {
    S.toast = msg;
    render();
  }

  /* ---------------- rendering: summary rail ---------------- */

  function segHTML(l) {
    const fl = l.flight;
    return `
      <div class="seg">
        <div class="seg-top">
          <span>${dateLabel(fl.dateIso)}</span>
          ${fl.plusDays ? `<span>+${fl.plusDays} day${fl.plusDays > 1 ? "s" : ""}</span>` : ""}
        </div>
        <div class="seg-main">
          <div><div class="t">${fl.dep}</div><div class="a">${fl.from}</div></div>
          <div class="seg-mid"><div class="dots"><span class="plane">✈</span></div>Non-stop ${durLabel(fl.durMin)}</div>
          <div style="text-align:right"><div class="t">${fl.arr}</div><div class="a">${fl.to}</div></div>
        </div>
        <div class="seg-cabin"><span class="dot"></span>${CABINS[l.cabin].label} <strong>${l.tier}</strong></div>
        ${S.open["fd" + fl.id] ? `<div class="rail-line-detail">Flight ${fl.no} · ${AP[fl.from].name} → ${AP[fl.to].name} · ${Math.round(fl.dist).toLocaleString()} km</div>` : ""}
      </div>`;
  }

  function railToggle(key, label, detail, extraRight = "") {
    const open = !!S.open[key];
    return `
      <button class="rail-line" data-toggle="${key}" aria-expanded="${open}">
        <span>${label}</span><span>${extraRight}<span class="chev" style="margin-left:10px">⌄</span></span>
      </button>
      ${open ? `<div class="rail-line-detail">${detail}</div>` : ""}`;
  }

  function railHTML() {
    const bestCabin = legs().reduce((acc, l) =>
      (["economy", "business", "first"].indexOf(l.cabin) > ["economy", "business", "first"].indexOf(acc) ? l.cabin : acc), "economy");
    const confirmed = S.step === "confirmed";

    const namesOf = type => {
      const list = S.guests.filter(g => g.type === type && g.first);
      return list.length
        ? list.map(g => `${g.title} ${esc(g.first)} ${esc(g.last)}`.trim()).join("<br>")
        : "Names added at the guests step.";
    };

    const extrasSections = legs().map((l, i) => {
      const dirn = `${AP[l.flight.from].city} to ${AP[l.flight.to].city}`;
      const seatDetail = confirmed
        ? seatsFor(i).map((s, gi) => `${S.guests[gi] ? esc((S.guests[gi].first || S.guests[gi].type + " " + S.guests[gi].n)) : "Guest"} — seat ${s}`).join("<br>")
        : "Seats are assigned at confirmation.";
      return `
        <div class="rail-section">
          <h3 style="font-size:15.5px">${dirn}</h3>
          ${railToggle("seat" + i, `Seat (${guestCount()})`, seatDetail)}
        </div>`;
    }).join("");

    return `
      <div class="rail-card">
        <div class="rail-head">
          <h2>Summary</h2>
          <button class="gold-link" id="fdBtn">Flight details</button>
        </div>
        ${legs().map(segHTML).join("")}

        <div class="rail-section">
          <h3>Guests</h3>
          ${S.adults ? railToggle("gA", `Adult (${S.adults})`, namesOf("Adult")) : ""}
          ${S.children ? railToggle("gC", `Child (${S.children})`, namesOf("Child")) : ""}
        </div>

        <div class="rail-section">
          ${railToggle("comp",
            `<strong style="color:var(--ink)">Complimentary</strong>`,
            PERKS[bestCabin].join("<br>"),
            `<span class="chip">Included</span>`)}
          <div class="perk-icons">${PERKS[bestCabin].map(PERK_ICON).map(i => `<span>${i}</span>`).join("")}</div>
        </div>

        <div class="rail-section">
          <h3>Extras</h3>
          ${extrasSections || `<div class="rail-line-detail">Pick your flights to see extras.</div>`}
          ${EXTRAS.filter(x => S.extras[x.id] && !(x.id === "chauffeur" && chauffeurIncluded()))
            .map(x => `<div class="rail-line" style="cursor:default">${x.title}<span>${fmt(x.scope === "guest" ? x.price * guestCount() : x.price * directions())}</span></div>`).join("")}
        </div>

        <div class="rail-total">
          <span>${confirmed ? "Total paid" : "Total (incl. taxes)"}</span>
          <span>${fmt(grandTotal())}</span>
        </div>
      </div>`;
  }

  railEl.addEventListener("click", e => {
    const t = e.target.closest("[data-toggle]");
    if (t) { S.open[t.dataset.toggle] = !S.open[t.dataset.toggle]; render(); return; }
    if (e.target.closest("#fdBtn")) {
      const anyOpen = legs().some(l => S.open["fd" + l.flight.id]);
      for (const l of legs()) S.open["fd" + l.flight.id] = !anyOpen;
      render();
    }
  });

  $("#brandHome").onclick = e => {
    e.preventDefault();
    S.step = "search"; S.toast = null;
    render();
  };

  render();
})();
