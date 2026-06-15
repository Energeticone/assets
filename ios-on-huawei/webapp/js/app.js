/* iOS-on-Huawei — springboard + Messages SPA (vanilla JS). */
"use strict";

const API = "";                 // same origin
const $ = (s, r = document) => r.querySelector(s);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const esc = (s) => (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const state = {
  me: localStorage.getItem("handle") || "",
  socket: null,
  thread: null,           // {id, participants}
  threads: [],
  vapidPublicKey: "",
};

/* ---------------- networking ---------------- */
async function api(path, opts) {
  const r = await fetch(API + path, opts);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.json();
}

function connectSocket() {
  if (typeof io === "undefined") {     // realtime client unavailable -> poll
    startPolling();
    return;
  }
  state.socket = io();
  state.socket.on("message", (m) => onIncoming(m));
  state.socket.on("typing", (d) => {
    if (state.thread && d.thread_id === state.thread.id && d.sender !== state.me) {
      const t = $("#typing"); if (t) { t.textContent = "…"; clearTimeout(t._h); t._h = setTimeout(() => (t.textContent = ""), 1500); }
    }
  });
  // If the socket never connects, fall back to polling.
  state.socket.on("connect_error", () => { if (!state._polling) startPolling(); });
}

function startPolling() {
  state._polling = true;
  let lastSeen = 0;
  setInterval(async () => {
    if (!state.me) return;
    loadThreads();
    if (state.thread) {
      const msgs = await api(`/api/messages?thread_id=${state.thread.id}`).catch(() => []);
      for (const m of msgs) {
        if (m.created_at > lastSeen) { lastSeen = m.created_at; }
      }
      // re-render only if new tail message appeared
      const box = $("#bubbles");
      if (box && msgs.length && box.dataset.count != msgs.length) {
        box.innerHTML = ""; box.dataset.count = msgs.length;
        msgs.forEach(appendBubble); scrollBubbles();
      }
    }
  }, 3000);
}

function onIncoming(m) {
  // refresh thread list previews
  loadThreads();
  if (state.thread && m.thread_id === state.thread.id) {
    appendBubble(m);
    scrollBubbles();
  } else if (m.sender !== state.me) {
    // in-app notification when not viewing the thread
    inAppNotify(m.sender, m.body || "📷 Attachment");
    if (Notification && Notification.permission === "granted") {
      try { new Notification(m.sender, { body: m.body || "Attachment", icon: "icons/icon.svg" }); } catch (_) {}
    }
  }
}

/* ---------------- screens ---------------- */
function show(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  if (id) $("#" + id).classList.add("active");
}
function goHome() { show(null); state.thread = null; }

/* ---------------- Messages: thread list ---------------- */
async function loadThreads() {
  if (!state.me) return;
  state.threads = await api(`/api/threads?handle=${encodeURIComponent(state.me)}`).catch(() => []);
  renderThreadList();
  updateBadge();
}

function renderThreadList() {
  const list = $("#thread-list");
  list.innerHTML = "";
  if (!state.threads.length) {
    list.appendChild(el("div", "empty", "No conversations yet.<br>Tap the ✎ to start one."));
    return;
  }
  for (const t of state.threads) {
    const other = t.participants.filter((p) => p !== state.me).join(", ") || "You";
    const prev = t.last ? (t.last.body || "📷 Attachment") : "";
    const row = el("div", "thread");
    row.appendChild(el("div", "avatar", esc(other.slice(0, 1).toUpperCase())));
    const meta = el("div", "meta");
    meta.appendChild(el("div", "name", esc(other)));
    meta.appendChild(el("div", "preview", esc(prev)));
    row.appendChild(meta);
    row.appendChild(el("div", "time", t.last ? fmtTime(t.last.created_at) : ""));
    row.onclick = () => openThread(t);
    list.appendChild(row);
  }
}

/* ---------------- Messages: conversation ---------------- */
async function openThread(t) {
  state.thread = t;
  $("#convo-title").textContent = t.participants.filter((p) => p !== state.me).join(", ") || "You";
  show("messages");
  show("convo");
  state.socket && state.socket.emit("join", { thread_id: t.id });
  const msgs = await api(`/api/messages?thread_id=${t.id}`).catch(() => []);
  const box = $("#bubbles"); box.innerHTML = "";
  let lastDay = "";
  for (const m of msgs) {
    const day = new Date(m.created_at * 1000).toDateString();
    if (day !== lastDay) { box.appendChild(el("div", "daystamp", fmtDay(m.created_at))); lastDay = day; }
    appendBubble(m);
  }
  scrollBubbles();
}

function appendBubble(m) {
  const box = $("#bubbles");
  const mine = m.sender === state.me;
  const row = el("div", "row " + (mine ? "me" : "them"));
  const b = el("div", "bubble" + (m.service === "sms" ? " sms" : ""));
  if (m.media_id) {
    const img = el("img"); img.src = `/api/media/${m.media_id}`;
    img.onerror = () => { img.replaceWith(el("span", null, "📎 Attachment")); };
    b.appendChild(img);
    if (m.body) b.appendChild(el("div", null, esc(m.body)));
  } else {
    b.innerHTML = esc(m.body);
  }
  row.appendChild(b);
  box.appendChild(row);
}

function scrollBubbles() { const b = $("#bubbles"); b.scrollTop = b.scrollHeight; }

async function sendMessage() {
  const ta = $("#composer-input");
  const body = ta.value.trim();
  if (!body || !state.thread) return;
  ta.value = ""; ta.style.height = "auto"; updateSendBtn();
  await api("/api/send", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sender: state.me, participants: state.thread.participants, body }),
  }).catch((e) => inAppNotify("Failed", e.message));
}

async function sendMedia(file) {
  if (!file || !state.thread) return;
  const fd = new FormData(); fd.append("file", file);
  const up = await api("/api/upload", { method: "POST", body: fd }).catch((e) => { inAppNotify("Upload failed", e.message); return null; });
  if (!up) return;
  await api("/api/send", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sender: state.me, participants: state.thread.participants, media_id: up.media_id }),
  });
}

/* ---------------- new conversation ---------------- */
async function newConversation() {
  const who = prompt("New iMessage to (handle / phone / Apple ID):");
  if (!who) return;
  const parts = [state.me, who.trim()];
  const res = await api("/api/thread", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ participants: parts }),
  });
  await loadThreads();
  openThread({ id: res.id, participants: parts.sort() });
}

/* ---------------- helpers ---------------- */
function fmtTime(ts) {
  const d = new Date(ts * 1000), now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "numeric", day: "numeric" });
}
function fmtDay(ts) {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function updateSendBtn() { $("#send-btn").disabled = !$("#composer-input").value.trim(); }
function updateBadge() {
  const n = state.threads.length;  // simple: count of conversations
  const badge = $("#msg-badge");
  if (n > 0) { badge.textContent = n; badge.style.display = "flex"; } else badge.style.display = "none";
}
function inAppNotify(title, body) {
  const n = el("div", "", `<b>${esc(title)}</b> ${esc(body)}`);
  Object.assign(n.style, {
    position: "absolute", top: "calc(var(--safe-top) + 6px)", left: "10px", right: "10px",
    background: "rgba(40,40,40,.92)", color: "#fff", padding: "12px 16px", borderRadius: "16px",
    zIndex: 200, fontSize: "14px", backdropFilter: "blur(10px)",
  });
  $("#app").appendChild(n);
  setTimeout(() => n.remove(), 3200);
}
function clock() {
  const t = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  document.querySelectorAll(".clock").forEach((c) => (c.textContent = t));
}

/* ---------------- push notifications ---------------- */
async function enablePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    inAppNotify("Push", "Not supported on this browser"); return;
  }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return;
  const reg = await navigator.serviceWorker.ready;
  if (!state.vapidPublicKey) {
    inAppNotify("Notifications", "On while app is open. For background, configure VAPID keys on the server.");
    return;
  }
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlB64ToUint8(state.vapidPublicKey),
  });
  await api("/api/push/subscribe", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle: state.me, subscription: sub }),
  });
  inAppNotify("Notifications", "Background push enabled ✓");
}
function urlB64ToUint8(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const base = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base); return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/* ---------------- setup / identity ---------------- */
async function register(handle) {
  await api("/api/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle }),
  });
  state.me = handle; localStorage.setItem("handle", handle);
  $("#setup").style.display = "none";
  $("#settings-handle").textContent = handle;
  await loadThreads();
}

/* ---------------- UI wiring ---------------- */
function openApp(name) {
  if (name === "messages") { show("messages"); loadThreads(); }
  else if (name === "settings") { show("settings"); $("#settings-service").textContent = state.service || "app"; }
  else { $("#ph-title").textContent = name[0].toUpperCase() + name.slice(1);
         $("#ph-body").textContent = "This is the iOS-style shell. " + name + " isn't wired up — Messages is the working app."; show("placeholder"); }
}

function wireUI() {
  document.querySelectorAll(".app-icon").forEach((a) => (a.onclick = () => openApp(a.dataset.app)));
  document.querySelectorAll("[data-home]").forEach((b) => (b.onclick = goHome));
  document.querySelectorAll("[data-screen]").forEach((b) => (b.onclick = () => show(b.dataset.screen)));
  $("#new-convo").onclick = newConversation;
  $("#change-handle").onclick = () => { localStorage.removeItem("handle"); state.me = ""; $("#setup").style.display = "flex"; };
  $("#enable-push").onclick = enablePush;

  const ta = $("#composer-input");
  ta.addEventListener("input", () => {
    ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 100) + "px"; updateSendBtn();
    state.socket && state.thread && state.socket.emit("typing", { thread_id: state.thread.id, sender: state.me });
  });
  $("#send-btn").onclick = sendMessage;
  $("#file-input").addEventListener("change", (e) => { if (e.target.files[0]) sendMedia(e.target.files[0]); e.target.value = ""; });

  const go = () => { const v = $("#setup-handle").value.trim(); if (v) register(v); };
  $("#setup-go").onclick = go;
  $("#setup-handle").addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
}

/* ---------------- boot ---------------- */
async function boot() {
  wireUI();
  clock(); setInterval(clock, 10000);
  try { const c = await api("/api/config"); state.vapidPublicKey = c.vapidPublicKey; state.service = c.bridge === "imessage_relay" ? "iMessage" : "app"; } catch (_) {}
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  connectSocket();
  if (state.me) { $("#setup").style.display = "none"; $("#settings-handle").textContent = state.me; await loadThreads(); }
}

document.addEventListener("DOMContentLoaded", boot);
