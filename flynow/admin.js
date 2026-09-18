/* FLYNOW staff portal — demo login gate + operations dashboard.
 *
 * Sign in with admin / 0000. Everything is generated in the browser by the
 * same date-seeded generator the booking site uses, so the departures board
 * here matches the flights customers can book. Demo only: the credential
 * check is client-side and gates nothing real.
 */
(() => {
  "use strict";

  /* ---- shared with app.js (kept identical so schedules line up) ---- */

  const AIRPORTS = [
    { code: "AUH", city: "Abu Dhabi",  lat: 24.433,  lon: 54.651,  tz: 4 },
    { code: "DXB", city: "Dubai",      lat: 25.253,  lon: 55.365,  tz: 4 },
    { code: "SIN", city: "Singapore",  lat: 1.364,   lon: 103.991, tz: 8 },
    { code: "BKK", city: "Bangkok",    lat: 13.690,  lon: 100.750, tz: 7 },
    { code: "BOM", city: "Mumbai",     lat: 19.089,  lon: 72.868,  tz: 5.5 },
    { code: "MLE", city: "Malé",       lat: 4.192,   lon: 73.529,  tz: 5 },
    { code: "IST", city: "Istanbul",   lat: 41.275,  lon: 28.752,  tz: 3 },
    { code: "CAI", city: "Cairo",      lat: 30.122,  lon: 31.406,  tz: 3 },
    { code: "LHR", city: "London",     lat: 51.470,  lon: -0.454,  tz: 1 },
    { code: "CDG", city: "Paris",      lat: 49.010,  lon: 2.548,   tz: 2 },
    { code: "GVA", city: "Geneva",     lat: 46.238,  lon: 6.109,   tz: 2 },
    { code: "JFK", city: "New York",   lat: 40.641,  lon: -73.778, tz: -4 },
    { code: "NRT", city: "Tokyo",      lat: 35.772,  lon: 140.393, tz: 9 },
    { code: "SYD", city: "Sydney",     lat: -33.946, lon: 151.177, tz: 10 },
  ];
  const AP = Object.fromEntries(AIRPORTS.map(a => [a.code, a]));

  function haversine(a, b) {
    const R = 6371, r = Math.PI / 180;
    const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

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
  const fmt = n => "AED " + Math.round(n).toLocaleString("en-US");
  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function flightsFor(from, to, dateIso) {
    const a = AP[from], b = AP[to];
    const dist = haversine(a, b);
    const durMin = Math.round((dist / 860 + 0.67) * 12) * 5;
    const rng = seeded(from + to + dateIso);
    const flights = [];
    for (let i = 0; i < 3; i++) {
      const depMin = Math.round((rng() * 1300 + 60) / 5) * 5;
      const arrAbs = depMin + durMin + (b.tz - a.tz) * 60;
      rng(); // price jitter draw — keep the stream aligned with app.js
      flights.push({
        no: "FN" + (100 + Math.floor(rng() * 880)),
        from, to, depMin, dep: hm(depMin), arr: hm(((arrAbs % 1440) + 1440) % 1440),
        plusDays: Math.floor(arrAbs / 1440), durMin, dist,
      });
    }
    flights.sort((x, y) => x.depMin - y.depMin);
    return flights;
  }

  /* ---------------- demo data for today ---------------- */

  const todayIso = new Date().toISOString().slice(0, 10);
  const CABINS = { economy: "Economy", business: "Business", first: "First" };
  const FIRST_NAMES = ["Kerry", "Noor", "Marta", "Yusuf", "Priya", "Chen", "Amara", "Diego", "Lena", "Tariq", "Sofia", "Hiro", "Fatima", "Omar", "Ingrid", "Ravi"];
  const LAST_NAMES  = ["Adler", "Haddad", "Silva", "Tan", "Okafor", "Novak", "Rahman", "Kimura", "Costa", "Berg", "Mansour", "Iyer", "Weber", "Nasser", "Olsen", "Khan"];
  const AIRCRAFT = ["A350-1000", "787-9", "787-10", "A321LR"];

  function departuresToday() {
    const routes = ["SIN", "LHR", "BKK", "JFK", "BOM", "CDG", "NRT", "SYD", "IST", "MLE"];
    const rows = routes.map(to => flightsFor("AUH", to, todayIso)[0]);
    const rng = seeded("ops" + todayIso);
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    for (const f of rows) {
      f.aircraft = AIRCRAFT[Math.floor(rng() * AIRCRAFT.length)];
      f.load = Math.round(62 + rng() * 36);
      const delayed = rng() < 0.15;
      f.status = delayed ? ["warn", "Delayed"]
        : f.depMin < nowMin - 10 ? ["plain", "Departed"]
        : f.depMin < nowMin + 45 ? ["good", "Boarding"]
        : ["good", "On time"];
    }
    rows.sort((x, y) => x.depMin - y.depMin);
    return rows;
  }

  function bookingFrom(rng, ref) {
    const dests = ["SIN", "LHR", "BKK", "JFK", "BOM", "CDG", "NRT", "SYD", "IST", "MLE", "GVA", "CAI"];
    const to = dests[Math.floor(rng() * dests.length)];
    const cabinKey = ["economy", "economy", "economy", "business", "business", "first"][Math.floor(rng() * 6)];
    const guests = 1 + Math.floor(rng() * 4);
    const dist = haversine(AP.AUH, AP[to]);
    const mult = { economy: 1, business: 3.05, first: 5.3 }[cabinKey];
    const total = (220 + dist * 0.32) * mult * 1.2 * guests * 2 * 1.12;
    const status = rng() < 0.72 ? ["good", "Confirmed"] : rng() < 0.75 ? ["plain", "Checked-in"] : ["bad", "Refunded"];
    return {
      ref,
      name: FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)] + " " + LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)],
      route: "AUH ⇄ " + to,
      cabin: CABINS[cabinKey],
      guests,
      total,
      time: hm(Math.floor(rng() * 1440)),
      status,
    };
  }

  function bookingsToday() {
    const rng = seeded("bookings" + todayIso);
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length: 9 }, () => {
      const ref = Array.from({ length: 6 }, () => chars[Math.floor(rng() * chars.length)]).join("");
      return bookingFrom(rng, ref);
    }).sort((a, b) => b.time.localeCompare(a.time));
  }

  /* ---------------- rendering ---------------- */

  const $ = sel => document.querySelector(sel);
  const statusHTML = ([cls, label]) => `<span class="status ${cls}"><span class="s-dot"></span>${label}</span>`;

  function renderDash() {
    const deps = departuresToday();
    const books = bookingsToday();
    const rng = seeded("kpi" + todayIso);

    $("#todayLabel").textContent = new Date().toLocaleDateString("en-GB",
      { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + " · Abu Dhabi hub · all figures demo-generated";

    const totalBookings = 80 + Math.floor(rng() * 90);
    const avgTicket = books.reduce((t, b) => t + b.total, 0) / books.length;
    const revenue = avgTicket * totalBookings;
    const load = Math.round(deps.reduce((t, f) => t + f.load, 0) / deps.length);
    const onTime = deps.filter(f => f.status[1] !== "Delayed").length;

    $("#tiles").innerHTML = [
      ["Bookings today", totalBookings, `latest ${books.length} shown below`],
      ["Revenue today", fmt(revenue), "gross, incl. taxes"],
      ["Average load factor", load + "%", `across ${deps.length} departures`],
      ["On-time departures", `${onTime} / ${deps.length}`, deps.length - onTime ? `${deps.length - onTime} delayed` : "clean board"],
    ].map(([label, value, sub]) => `
      <div class="tile">
        <div class="t-label">${label}</div>
        <div class="t-value">${value}</div>
        <div class="t-sub">${sub}</div>
      </div>`).join("");

    $("#depTable").innerHTML = `
      <tr><th>Flight</th><th>To</th><th>Dep</th><th>Arr</th><th>Aircraft</th><th class="num">Load</th><th>Status</th></tr>
      ${deps.map(f => `
        <tr>
          <td><strong>${f.no}</strong></td>
          <td>${AP[f.to].city} (${f.to})</td>
          <td>${f.dep}</td>
          <td>${f.arr}${f.plusDays ? " +1" : ""}</td>
          <td>${f.aircraft}</td>
          <td class="num">${f.load}%</td>
          <td>${statusHTML(f.status)}</td>
        </tr>`).join("")}`;

    $("#bookTable").innerHTML = `
      <tr><th>Ref</th><th>Lead guest</th><th>Route</th><th>Cabin</th><th class="num">Guests</th><th class="num">Total</th><th>Status</th></tr>
      ${books.map(b => `
        <tr>
          <td><strong>${b.ref}</strong></td>
          <td>${esc(b.name)}</td>
          <td>${b.route}</td>
          <td>${b.cabin}</td>
          <td class="num">${b.guests}</td>
          <td class="num">${fmt(b.total)}</td>
          <td>${statusHTML(b.status)}</td>
        </tr>`).join("")}`;
  }

  $("#lookupForm").onsubmit = e => {
    e.preventDefault();
    const ref = e.target.ref.value.trim().toUpperCase();
    if (!ref) { $("#lookupResult").innerHTML = ""; return; }
    const b = bookingFrom(seeded("lookup" + ref), ref);
    $("#lookupResult").innerHTML = `
      <div class="lookup-card">
        <div class="lc-head"><strong>${esc(ref)}</strong> ${statusHTML(b.status)}</div>
        <div>${esc(b.name)} · ${b.route} · ${b.cabin} · ${b.guests} guest${b.guests > 1 ? "s" : ""}</div>
        <div>Total ${fmt(b.total)} <span class="muted">· demo record generated from the reference you typed</span></div>
      </div>`;
  };

  /* ---------------- auth gate (demo) ---------------- */

  const KEY = "flynow-staff";

  function show(loggedIn) {
    $("#loginView").hidden = loggedIn;
    $("#dashView").hidden = !loggedIn;
    document.title = loggedIn ? "FLYNOW Staff — operations" : "FLYNOW Staff — sign in";
    if (loggedIn) {
      $("#whoAmI").textContent = "Signed in as " + (sessionStorage.getItem(KEY) || "admin");
      renderDash();
    }
  }

  $("#loginForm").onsubmit = e => {
    e.preventDefault();
    const f = e.target;
    if (f.user.value.trim().toLowerCase() === "admin" && f.pass.value === "0000") {
      sessionStorage.setItem(KEY, f.user.value.trim().toLowerCase());
      $("#loginError").classList.remove("show");
      show(true);
    } else {
      $("#loginError").classList.add("show");
      const card = $(".login-card");
      card.classList.remove("shake");
      void card.offsetWidth; // restart the animation
      card.classList.add("shake");
    }
  };

  $("#signOut").onclick = () => {
    sessionStorage.removeItem(KEY);
    $("#loginForm").reset();
    show(false);
  };

  show(!!sessionStorage.getItem(KEY));
})();
