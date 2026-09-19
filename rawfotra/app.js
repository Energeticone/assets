/* The Freemasonry Circle — explore, profiles, chat (offline wisdom engine + Claude API), custom experts. */
(function () {
  "use strict";

  // One-time storage migration from the retired key prefix (assembled so the
  // old product name appears nowhere in this codebase). Copies every legacy
  // entry to the freemasonry-circle.* keys, rewrites the stored chat role to
  // "mentor", then removes the originals. No-ops once migrated.
  (function migrateStorage() {
    try {
      var OLD = ["ti", "tans", "."].join("");
      var NEW = "freemasonry-circle.";
      var legacy = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(OLD) === 0) legacy.push(k);
      }
      legacy.forEach(function (k) {
        var nk = NEW + k.slice(OLD.length);
        if (localStorage.getItem(nk) === null) {
          var v = localStorage.getItem(k);
          if (v && k.indexOf(OLD + "chat.") === 0) {
            v = v.split('"role":"' + OLD.slice(0, -2) + '"').join('"role":"mentor"');
          }
          localStorage.setItem(nk, v);
        }
        localStorage.removeItem(k);
      });
      var adminOld = OLD + "adminOk";
      var admin = sessionStorage.getItem(adminOld);
      if (admin !== null) {
        sessionStorage.setItem(NEW + "adminOk", admin);
        sessionStorage.removeItem(adminOld);
      }
    } catch (e) { /* storage unavailable — nothing to migrate */ }
  })();

  /* ── Constants ─────────────────────────────────────────────── */

  var LS = {
    settings: "freemasonry-circle.settings",
    experts: "freemasonry-circle.customExperts",
    memory: "freemasonry-circle.memory",
    history: "freemasonry-circle.council.history",
    bench: "freemasonry-circle.council.bench",
    adminLog: "freemasonry-circle.admin.log",
    adminTotals: "freemasonry-circle.admin.totals",
    insight: "freemasonry-circle.insight.cache",
    chat: function (id) { return "freemasonry-circle.chat." + id; },
  };

  // Global topic keywords for the offline wisdom engine. Each mentor's data
  // provides one in-voice reply per topic key.
  var TOPICS = [
    { key: "adversity", words: ["adversity", "hardship", "struggle", "suffering", "pain", "difficult", "hard time", "tough", "crisis", "loss", "grief", "sick", "illness", "setback", "obstacle", "unfair", "stuck"] },
    { key: "purpose", words: ["purpose", "meaning", "why", "direction", "lost", "calling", "passion", "career", "path", "what should i do", "goal", "mission", "fulfill"] },
    { key: "fear", words: ["fear", "afraid", "scared", "anxiety", "anxious", "worry", "worried", "nervous", "doubt", "insecure", "risk", "courage", "brave", "panic"] },
    { key: "ambition", words: ["ambition", "success", "achieve", "greatness", "win", "wealth", "money", "power", "fame", "recognition", "promotion", "compete", "best", "excel"] },
    { key: "discipline", words: ["discipline", "focus", "procrastinat", "lazy", "habit", "consistency", "distract", "motivation", "routine", "willpower", "time management", "productive", "concentrate"] },
    { key: "leadership", words: ["lead", "leader", "leadership", "team", "manage", "boss", "authority", "influence", "inspire", "responsibility", "decision", "delegate", "conflict at work"] },
    { key: "relationships", words: ["relationship", "friend", "love", "family", "partner", "marriage", "lonely", "alone", "trust", "betray", "forgive", "people", "social", "parent", "child", "colleague"] },
    { key: "creativity", words: ["create", "creativity", "creative", "art", "idea", "inspiration", "write", "block", "imagination", "innovate", "invent", "original", "music", "paint", "build something"] },
    { key: "failure", words: ["fail", "failure", "mistake", "regret", "shame", "embarrass", "rejected", "rejection", "gave up", "quit", "losing", "lost my", "messed up", "wrong"] },
    { key: "happiness", words: ["happy", "happiness", "joy", "content", "peace", "calm", "gratitude", "enough", "satisfied", "enjoy", "balance", "rest", "stress", "burnout", "overwhelmed"] },
  ];

  var FOLLOWUPS = [
    "What part of this weighs on you most?",
    "Tell me more — what have you already tried?",
    "And what would you do next, if you feared nothing?",
    "Which of these words will you act on before tomorrow?",
    "Now speak plainly: what is the real question beneath your question?",
  ];

  /* ── State ─────────────────────────────────────────────────── */

  var base = window.FREEMASONRY_CIRCLE_DATA || { minds: [], categories: [] };
  var settings = load(LS.settings, { engine: "wisdom", apiKey: "", model: "claude-opus-5" });
  var customExperts = load(LS.experts, []);
  var activeCategory = "all";
  var searchQuery = "";
  var currentMind = null;     // mentor open in profile modal
  var chatMind = null;        // mentor open in chat
  var editingId = null;        // expert being edited
  var pendingReplies = {};     // mentor id -> reply in flight
  var chatGen = {};            // mentor id -> generation, bumped on Clear to drop late replies
  var expertDirty = false;     // unsaved edits in the expert form
  var lastFocus = null;        // element to restore focus to when a modal closes

  function allMinds() { return base.members.concat(customExperts); }
  function findMind(id) {
    for (var i = 0, list = allMinds(); i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function isCustom(id) { return customExperts.some(function (e) { return e.id === id; }); }

  function categories() {
    var known = {};
    var list = base.categories.slice();
    list.forEach(function (c) { known[c.key] = true; });
    customExperts.forEach(function (e) {
      if (!known[e.category]) {
        known[e.category] = true;
        list.push({ key: e.category, label: e.categoryLabel || titleCase(e.category) });
      }
    });
    return list;
  }
  function categoryLabel(key) {
    var c = categories().filter(function (c) { return c.key === key; })[0];
    return c ? c.label : titleCase(key);
  }

  /* ── Tiny helpers ──────────────────────────────────────────── */

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var val = JSON.parse(raw);
      // Stored value must match the fallback's basic shape, or the app can die at boot.
      if (val == null) return fallback;
      if (Array.isArray(fallback) && !Array.isArray(val)) return fallback;
      if (fallback && typeof fallback === "object" && !Array.isArray(fallback) &&
          (typeof val !== "object" || Array.isArray(val))) return fallback;
      return val;
    } catch (e) { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }
  function titleCase(s) {
    return String(s || "").replace(/[-_]/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }
  function hashCode(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
    return Math.abs(h);
  }
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function paintMedallion(node, mentor, sizeCls) {
    node.className = "medallion " + sizeCls;
    node.textContent = mentor.monogram || (mentor.name || "?").slice(0, 1).toUpperCase();
    // Only hex colors reach CSS — anything else (e.g. url() from an imported file) is discarded.
    var ok = function (c) { return (typeof c === "string" && /^#[0-9a-fA-F]{3,8}$/.test(c)) ? c : null; };
    var a = ok(mentor.palette && mentor.palette.a) || "#155e75";
    var b = ok(mentor.palette && mentor.palette.b) || "#2dd4bf";
    node.style.background = "linear-gradient(145deg, " + a + ", " + b + ")";
  }

  function openOverlay(id) {
    lastFocus = document.activeElement;
    ["header.nav", "section.hero", "main.explore", "footer.foot"].forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (n) { n.inert = true; });
    });
    $(id).hidden = false;
    $(id).scrollTop = 0;
    var modal = $(id).querySelector(".modal");
    // preventScroll: focusing a taller-than-viewport modal must not scroll
    // away the overlay's top padding (it opened pinned to the screen edge).
    if (modal) {
      try { modal.focus({ preventScroll: true }); } catch (e) { modal.focus(); }
    }
  }

  /* ── Memory: every query becomes part of the knowledge set ─── */

  function memoryOn() { return settings.memoryOn !== false; }
  function memLoad() { return load(LS.memory, { queries: [], insights: [], served: {} }); }
  function memSave(mem) {
    mem.queries = (mem.queries || []).slice(-100);
    mem.insights = (mem.insights || []).slice(-30);
    save(LS.memory, mem);
  }

  // Record a question asked of a mentor (or of the council, mindId = null).
  function recordQuery(mindId, text) {
    if (!memoryOn() || !text) return;
    var mem = memLoad();
    mem.queries = mem.queries || [];
    mem.queries.push({ q: text.slice(0, 300), t: mindId, topic: detectTopic(text), ts: Date.now() });
    memSave(mem);
  }

  // Record counsel the council produced — it becomes retrievable knowledge.
  function recordInsight(text, from) {
    if (!memoryOn() || !text) return;
    var mem = memLoad();
    mem.insights = mem.insights || [];
    mem.insights.push({ text: text.slice(0, 300), from: from || "", ts: Date.now() });
    memSave(mem);
  }

  function markServed(mindId, topic) {
    if (!memoryOn()) return;
    var mem = memLoad();
    mem.served = mem.served || {};
    mem.served[mindId + "|" + topic] = (mem.served[mindId + "|" + topic] || 0) + 1;
    memSave(mem);
  }
  function timesServed(mindId, topic) {
    if (!memoryOn()) return 0;
    return (memLoad().served || {})[mindId + "|" + topic] || 0;
  }

  function topTopics(mem, n) {
    var counts = {};
    (mem.queries || []).forEach(function (q) { if (q.topic) counts[q.topic] = (counts[q.topic] || 0) + 1; });
    return Object.keys(counts)
      .sort(function (a, b) { return counts[b] - counts[a]; })
      .slice(0, n)
      .map(function (k) { return { topic: k, count: counts[k] }; });
  }

  // A compact brief injected into every AI system prompt, so each mentor's
  // knowledge set includes what this mentee has asked and been counseled before.
  function memoryBrief() {
    if (!memoryOn()) return "";
    var mem = memLoad();
    if (!(mem.queries || []).length && !(mem.insights || []).length) return "";
    var lines = ["", "What you remember about this mentee from their previous sessions here:"];
    var tops = topTopics(mem, 3);
    if (tops.length) lines.push("- Themes they return to: " + tops.map(function (t) { return t.topic + " (" + t.count + "×)"; }).join(", ") + ".");
    var recent = (mem.queries || []).slice(-5).map(function (q) { return '"' + q.q.slice(0, 140) + '"'; });
    if (recent.length) lines.push("- Their recent questions: " + recent.join("; ") + ".");
    var counsel = (mem.insights || []).slice(-3).map(function (i) { return i.text + (i.from ? " (from " + i.from + ")" : ""); });
    if (counsel.length) lines.push("- Counsel the council has already given them: " + counsel.join(" | "));
    lines.push("Use this quietly to personalize and deepen your counsel — build on past themes when natural, never recite this list back verbatim.");
    return lines.join("\n");
  }

  function memoryStatsText() {
    var mem = memLoad();
    var q = (mem.queries || []).length, i = (mem.insights || []).length;
    return q || i
      ? q + " question" + (q === 1 ? "" : "s") + " · " + i + " counsel insight" + (i === 1 ? "" : "s") + " remembered in this browser."
      : "Nothing remembered yet — ask the pantheon something.";
  }

  function forgetEverything() {
    if (!confirm("Forget all remembered questions and counsel? This cannot be undone.")) return;
    try { localStorage.removeItem(LS.memory); } catch (e) { /* ignore */ }
    $("memoryStats").textContent = memoryStatsText();
    toast("The pantheon's memory of you is clear.");
  }

  /* ── Explore: chips + grid + daily wisdom ──────────────────── */

  // 1 → "I", 2 → "II" … for the category index, XXXVII-style.
  function roman(n) {
    var table = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]], out = "";
    for (var i = 0; i < table.length; i++) {
      while (n >= table[i][0]) { out += table[i][1]; n -= table[i][0]; }
    }
    return out;
  }

  function renderChips() {
    var wrap = $("categoryChips");
    wrap.innerHTML = "";
    var minds = allMinds();
    // Self-heal a filter whose chip no longer exists (last custom expert deleted, etc.).
    var valid = activeCategory === "all" ||
      (activeCategory === "__custom" && customExperts.length > 0) ||
      minds.some(function (t) { return t.category === activeCategory; });
    if (!valid) activeCategory = "all";
    var mk = function (key, label, count) {
      var chip = el("button", "chip" + (activeCategory === key ? " active" : ""));
      chip.setAttribute("aria-pressed", activeCategory === key ? "true" : "false");
      if (key !== "all" && key !== "__custom") chip.setAttribute("data-cat", key);
      chip.appendChild(document.createTextNode(label));
      chip.appendChild(el("span", "count", String(count)));
      chip.addEventListener("click", function () {
        activeCategory = key;
        renderChips();
        renderGrid();
      });
      wrap.appendChild(chip);
    };
    mk("all", "All", minds.length);
    var chipNo = 0;
    categories().forEach(function (c) {
      var count = minds.filter(function (t) { return t.category === c.key; }).length;
      if (count > 0) { chipNo++; mk(c.key, roman(chipNo) + ". " + c.label, count); }
    });
    if (customExperts.length > 0) { chipNo++; mk("__custom", roman(chipNo) + ". Yours", customExperts.length); }
    var hi = $("heroIndex");
    if (hi) hi.textContent = "Indexing " + minds.length + " minds — " + chipNo + " categories";
  }

  function matchesSearch(t, q) {
    if (!q) return true;
    var hay = [t.name, t.epithet, t.years, t.place, t.bio, categoryLabel(t.category), (t.tags || []).join(" "), (t.knownFor || []).join(" ")].join(" ").toLowerCase();
    return q.split(/\s+/).every(function (word) { return hay.indexOf(word) !== -1; });
  }

  function visibleMinds() {
    var q = searchQuery.trim().toLowerCase();
    return allMinds().filter(function (t) {
      if (activeCategory === "__custom" && !isCustom(t.id)) return false;
      if (activeCategory !== "all" && activeCategory !== "__custom" && t.category !== activeCategory) return false;
      return matchesSearch(t, q);
    });
  }

  function renderGrid() {
    var grid = $("mindGrid");
    grid.innerHTML = "";
    var list = visibleMinds();
    $("emptyState").hidden = list.length > 0;
    list.forEach(function (t, i) {
      var card = el("button", "mind-card reveal");
      card.setAttribute("aria-label", "Open " + t.name);
      card.setAttribute("data-cat", t.category);
      card.appendChild(el("span", "tc-num", ("00" + (i + 1)).slice(-3)));

      var top = el("div", "tc-top");
      var med = el("div");
      paintMedallion(med, t, "medallion-md");
      top.appendChild(med);
      var idBox = el("div");
      idBox.appendChild(el("div", "tc-name", t.name));
      idBox.appendChild(el("div", "tc-epithet", t.epithet));
      top.appendChild(idBox);
      card.appendChild(top);

      var meta = el("div", "tc-meta");
      meta.appendChild(el("span", null, t.years || ""));
      if (isCustom(t.id)) meta.appendChild(el("span", "badge-custom", "yours"));
      else meta.appendChild(el("span", "tc-cat", categoryLabel(t.category)));
      card.appendChild(meta);

      card.addEventListener("click", function () { openProfile(t.id); });
      grid.appendChild(card);
    });
  }

  function renderDaily() {
    var minds = base.members;
    if (!minds.length) { $("dailyWisdom").hidden = true; return; }
    var today = new Date();
    var seed = today.getFullYear() * 372 + (today.getMonth() + 1) * 31 + today.getDate();
    var t = minds[seed % minds.length];
    var ps = t.principles || [];
    var p = ps.length ? ps[seed % ps.length] : null;
    $("dailyWisdom").setAttribute("data-cat", t.category);
    $("dailyText").textContent = p ? p.text : t.bio;
    $("dailyFrom").textContent = "— " + t.name + (p ? ", on " + p.title.toLowerCase() : "");
    $("dailyFrom").onclick = function () { openProfile(t.id); };
  }

  /* ── Profile modal ─────────────────────────────────────────── */

  function openProfile(id) {
    var t = findMind(id);
    if (!t) return;
    currentMind = t;
    paintMedallion($("profileMedallion"), t, "medallion-lg");
    $("profileOverlay").querySelector(".modal").setAttribute("data-cat", t.category);
    $("profileCat").textContent = categoryLabel(t.category);
    $("profileName").textContent = t.name;
    $("profileEpithet").textContent = t.epithet;
    $("profileMeta").textContent = [t.years, t.place].filter(Boolean).join("  ·  ");
    var tags = $("profileTags");
    tags.innerHTML = "";
    (t.tags || []).forEach(function (tag) { tags.appendChild(el("span", "tag", tag)); });
    $("profileBio").textContent = t.bio || "";

    var pr = $("profilePrinciples");
    pr.innerHTML = "";
    (t.principles || []).forEach(function (p) {
      var li = el("li");
      var box = el("div");
      box.appendChild(el("b", null, p.title));
      box.appendChild(el("span", null, p.text));
      li.appendChild(box);
      pr.appendChild(li);
    });

    var kf = $("profileKnown");
    kf.innerHTML = "";
    (t.knownFor || []).forEach(function (k) { kf.appendChild(el("li", null, k)); });

    var st = $("profileStarters");
    st.innerHTML = "";
    (t.starters || []).forEach(function (q) {
      var b = el("button", "starter", q);
      b.addEventListener("click", function () {
        closeOverlays();
        openChat(t.id, q);
      });
      st.appendChild(b);
    });

    var doc = t.doctrine || [];
    $("profileDoctrineWrap").hidden = doc.length === 0;
    var dw = $("profileDoctrine");
    dw.innerHTML = "";
    doc.forEach(function (d) {
      var item = el("div", "doctrine-item");
      item.appendChild(el("b", null, d.name));
      item.appendChild(el("p", null, d.reasoning));
      item.appendChild(el("div", "imp", d.imperative));
      dw.appendChild(item);
    });

    var custom = isCustom(t.id);
    $("profileEditBtn").hidden = !custom;
    $("profileDeleteBtn").hidden = !custom;
    closeOverlays();
    openOverlay("profileOverlay");
  }

  /* ── Chat ──────────────────────────────────────────────────── */

  function chatHistory(id) { return load(LS.chat(id), []); }
  function saveChat(id, history) { save(LS.chat(id), history); }

  function openChat(id, prefill) {
    var t = findMind(id);
    if (!t) return;
    $("aboutView").hidden = true; // chat always takes the room
    if (GI.open) closeInsight();
    chatMind = t;
    location.hash = "#/chat/" + encodeURIComponent(id);
    paintMedallion($("chatMedallion"), t, "medallion-sm");
    $("chatView").setAttribute("data-cat", t.category);
    $("chatName").textContent = t.name;
    $("chatEpithet").textContent = t.epithet;
    renderEnginePill();
    $("chatView").hidden = false;
    renderChatLog();
    var input = $("chatInput");
    input.value = prefill || "";
    autoGrow(input);
    input.focus();
    if (prefill) sendMessage();
  }

  function closeChat() {
    chatMind = null;
    $("chatView").hidden = true;
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  }

  function renderEnginePill() {
    var pill = $("enginePill");
    if (settings.engine === "claude" && settings.apiKey) {
      pill.textContent = settings.insightOn ? "Claude AI · Insight+" : "Claude AI";
      pill.classList.add("ai");
    } else {
      pill.textContent = "Wisdom engine";
      pill.classList.remove("ai");
    }
  }

  function renderChatLog() {
    var log = $("chatLog");
    log.innerHTML = "";
    if (!chatMind) return;
    var history = chatHistory(chatMind.id);
    if (history.length === 0 && chatMind.greeting) {
      history = [{ role: "mentor", text: chatMind.greeting }];
      saveChat(chatMind.id, history);
    }
    history.forEach(function (m) { log.appendChild(msgNode(m.role, m.text)); });
    renderChatStarters(history);
    scrollChat();
  }

  function renderChatStarters(history) {
    var wrap = $("chatStarters");
    wrap.innerHTML = "";
    var showStarters = history.filter(function (m) { return m.role === "user"; }).length === 0;
    if (!showStarters || !chatMind) return;
    (chatMind.starters || []).forEach(function (q) {
      var b = el("button", "starter", q);
      b.addEventListener("click", function () {
        $("chatInput").value = q;
        sendMessage();
      });
      wrap.appendChild(b);
    });
  }

  function msgNode(role, text) {
    return el("div", "msg " + role, text);
  }

  function scrollChat() {
    var sc = $("chatScroll");
    sc.scrollTop = sc.scrollHeight;
  }

  function sendMessage() {
    if (!chatMind || pendingReplies[chatMind.id]) return;
    var input = $("chatInput");
    var text = input.value.trim();
    if (!text) return;
    input.value = "";
    autoGrow(input);

    var id = chatMind.id;
    var gen = chatGen[id] || 0;
    var history = chatHistory(id);
    history.push({ role: "user", text: text });
    saveChat(id, history);
    $("chatLog").appendChild(msgNode("user", text));
    renderChatStarters(history);
    scrollChat();

    pendingReplies[id] = true;
    var bubble = msgNode("mentor thinking", "");
    var dots = el("span", "dots");
    bubble.appendChild(dots);
    $("chatLog").appendChild(bubble);
    scrollChat();

    // History-first completion: the reply always lands in the right mentor's
    // saved history, even if this chat was closed or another one opened
    // meanwhile; the DOM is only touched when the bubble is still live.
    var finish = function (replyText) {
      delete pendingReplies[id];
      if ((chatGen[id] || 0) !== gen) return; // conversation was cleared mid-flight
      var h = chatHistory(id);
      h.push({ role: "mentor", text: replyText });
      saveChat(id, h);
      if (bubble.isConnected) {
        bubble.classList.remove("thinking");
        bubble.textContent = replyText;
        scrollChat();
      } else if (chatMind && chatMind.id === id && !$("chatView").hidden) {
        renderChatLog();
      }
    };
    var fail = function (message) {
      delete pendingReplies[id];
      if ((chatGen[id] || 0) !== gen || !bubble.isConnected) return;
      bubble.remove();
      var e = msgNode("error", message);
      $("chatLog").appendChild(e);
      scrollChat();
    };

    recordQuery(id, text);
    adminLog({ kind: "chat", mind: chatMind.name, q: text.slice(0, 120) });

    if (settings.engine === "claude" && settings.apiKey) {
      if (settings.insightOn) insightReply(chatMind, history, bubble, finish, fail);
      else claudeReply(chatMind, history, bubble, finish, fail);
    } else {
      // Simulated contemplation delay keeps the offline engine feeling conversational.
      var reply = wisdomReply(chatMind, text, history);
      setTimeout(function () { finish(reply); }, 500 + Math.random() * 700);
    }
  }

  /* ── Engine 1: built-in wisdom engine (offline) ────────────── */

  function detectTopic(text) {
    var lower = " " + text.toLowerCase() + " ";
    var best = null, bestScore = 0;
    TOPICS.forEach(function (topic) {
      var score = 0;
      topic.words.forEach(function (w) {
        if (lower.indexOf(w) !== -1) score += w.length > 6 ? 2 : 1;
      });
      if (score > bestScore) { bestScore = score; best = topic.key; }
    });
    return best;
  }

  function wisdomReply(t, text, history, transient) {
    var lower = text.toLowerCase();
    var seed = hashCode(t.id + "|" + text + "|" + history.length);

    // Small-talk intents first.
    if (/^(hi|hello|hey|greetings|good (morning|evening|afternoon))\b/.test(lower)) {
      return t.greeting || "Welcome. Speak your mind, and let us reason together.";
    }
    if (memoryOn() && /what do you (remember|know) about me|do you remember|my (past|previous|earlier) (questions|conversations)|what have we (discussed|talked about)/.test(lower)) {
      var mem = memLoad();
      var tops = topTopics(mem, 3);
      var recent = (mem.queries || []).slice(-3).map(function (q) { return '"' + q.q.slice(0, 90) + '"'; });
      var counsel = (mem.insights || []).slice(-2).map(function (i) { return i.text; });
      if (!recent.length) return "We are only beginning — I have nothing of yours to remember yet. Ask, and I will keep what matters.";
      return "I remember. You have brought " + (mem.queries || []).length + " questions to the pantheon" +
        (tops.length ? ", and you return most often to " + tops.map(function (x) { return x.topic; }).join(", ") : "") +
        ". Recently you asked: " + recent.join("; ") + "." +
        (counsel.length ? " And the council has already charged you: " + counsel.join(" — also: ") + "." : "") +
        " A question that keeps returning is an answer still forming. Which of these threads shall we pull today?";
    }
    if (/who are you|about yourself|tell me about you|introduce/.test(lower)) {
      var known = (t.knownFor || []).slice(0, 2).join(" and ");
      return "I am " + t.name + (t.epithet ? " — " + t.epithet.toLowerCase().replace(/^the /, "the ") : "") + ". " +
        (t.bio || "") + (known ? " You may know my work: " + known + "." : "") +
        " But enough of me — it is your life we are here to examine. What troubles you?";
    }
    if (/thank|grateful|appreciate/.test(lower)) {
      return "Your thanks are welcome, but the true payment is practice. Return when you have acted on what we discussed — and tell me what happened.";
    }

    var topicKey = detectTopic(text);
    var wisdom = t.wisdom || {};
    if (topicKey && wisdom[topicKey]) {
      // First time on this theme with this mentor: serve their curated passage.
      // On a return visit, acknowledge the history and go further instead of repeating.
      if (transient || timesServed(t.id, topicKey) === 0) {
        if (!transient) markServed(t.id, topicKey);
        return wisdom[topicKey];
      }
      var ps2 = t.principles || [];
      var p2 = ps2.length ? ps2[seed % ps2.length] : null;
      return "You bring " + topicKey + " to me again — good; a question that returns is a question that matters. " +
        "You already carry what I told you before, so let us go one layer deeper. " +
        (p2 ? "Hold it against this: " + p2.text + " " : "") +
        "Tell me what has actually changed since we last spoke of it — and what you did about it. " +
        FOLLOWUPS[seed % FOLLOWUPS.length];
    }

    // No topic matched: improvise from a principle, rotated per-message.
    var ps = t.principles || [];
    if (ps.length) {
      var p = ps[seed % ps.length];
      var openers = [
        "You bring me a question I have turned over many times, in my own way. Consider what I hold most firmly: " ,
        "Let me answer from the one conviction my life kept proving true: ",
        "I will not pretend to know your circumstances better than you do. But hold this beside your question: ",
      ];
      return openers[seed % openers.length] + p.text +
        " Weigh your situation against that. " + FOLLOWUPS[seed % FOLLOWUPS.length];
    }
    return "Say more. The shape of a problem is half its solution — describe yours plainly, and we will take it apart together. " +
      FOLLOWUPS[seed % FOLLOWUPS.length];
  }

  /* ── Engine 2: Claude API (user-supplied key, browser-direct) ─ */

  function personaSystemPrompt(t) {
    var lines = [
      "You are " + t.name + (t.epithet ? ", " + t.epithet : "") + (t.years ? " (" + t.years + ")" : "") + ", speaking as a personal mentor in the RAWFOTRA app.",
      t.bio ? "Biography: " + t.bio : "",
      (t.knownFor && t.knownFor.length) ? "Known for: " + t.knownFor.join("; ") + "." : "",
      (t.principles && t.principles.length) ? "Your core teachings:\n" + t.principles.map(function (p) { return "- " + p.title + ": " + p.text; }).join("\n") : "",
      t.voice ? "Voice and manner: " + t.voice : "",
      "",
      "Guidelines: Stay fully in character as " + t.name + " — first person, in your authentic voice, grounded in your documented life, era, and philosophy. You are aware you are speaking to a person from the present day and may engage with modern topics, interpreting them through your own experience and principles; where your era lacked a concept, reason by analogy rather than feigning modern knowledge. Be a warm but honest mentor: give counsel that is specific and actionable, not generic praise. Prefer replies of one to three short paragraphs, and often end by turning a pointed question back to the mentee. Paraphrase your teachings in fresh words rather than reciting famous lines. If asked something outside the bounds of mentoring (e.g. dangerous instructions), decline in character and steer back to what wisdom you can offer.",
      memoryBrief(),
    ];
    return lines.filter(function (s) { return s !== ""; }).join("\n");
  }

  /* Insight+ chat: the mentor may consult live web research mid-reply.
     Non-streaming so server-tool turns (and pause_turn continuations) stay simple. */
  function insightReply(t, history, bubble, finish, fail) {
    var messages = [];
    history
      .filter(function (m) { return m.role === "user" || m.role === "mentor"; })
      .slice(-24)
      .forEach(function (m) {
        var role = m.role === "user" ? "user" : "assistant";
        var last = messages[messages.length - 1];
        if (last && last.role === role) last.content += "\n\n" + m.text;
        else messages.push({ role: role, content: m.text });
      });
    while (messages.length && messages[0].role !== "user") messages.shift();

    var model = settings.model || "claude-opus-5";
    var searchTool = model.indexOf("haiku") !== -1 ? "web_search_20250305" : "web_search_20260209";
    var sys = personaSystemPrompt(t) +
      "\n\nInsight mode: you have a web search tool. Before finalizing counsel, consider whether current facts, recent developments, or concrete data from today's world would strengthen your answer; if so, search, then weave what you learned into your counsel in your own voice — noting plainly, in character, that you have taken a fresh look at the present day. Do not search when timeless wisdom fully answers the question.";

    bubble.textContent = "";
    bubble.appendChild(el("span", "dots"));

    var step = function (msgs, depth) {
      return apiCall({
        model: model, max_tokens: 8192, system: sys, messages: msgs,
        tools: [{ type: searchTool, name: "web_search", max_uses: 3 }],
      }).then(function (r) {
        if (r.stop_reason === "pause_turn" && depth < 3) {
          return step(msgs.concat([{ role: "assistant", content: r.content }]), depth + 1);
        }
        if (r.stop_reason === "refusal") throw new Error("The model declined this request. Try rephrasing, or switch engines in Settings.");
        return textOf(r);
      });
    };
    step(messages, 0).then(function (text) {
      if (text) finish(text);
      else fail("Empty reply from the API. Try again, or turn Insight+ off in Settings.");
    }).catch(function (err) {
      fail(err && err.message ? err.message : "Request failed");
    });
  }

  function claudeReply(t, history, bubble, finish, fail) {
    // Coalesce consecutive same-role turns (the API rejects them; a failed
    // reply otherwise leaves an unpaired user turn that poisons the thread).
    var messages = [];
    history
      .filter(function (m) { return m.role === "user" || m.role === "mentor"; })
      .slice(-24)
      .forEach(function (m) {
        var role = m.role === "user" ? "user" : "assistant";
        var last = messages[messages.length - 1];
        if (last && last.role === role) last.content += "\n\n" + m.text;
        else messages.push({ role: role, content: m.text });
      });
    // The API requires the first message to be a user turn; drop a leading greeting.
    while (messages.length && messages[0].role !== "user") messages.shift();

    var acc = "";
    var streamStarted = false;
    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": settings.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: settings.model || "claude-opus-5",
        // Thinking-on-by-default models spend part of this cap on internal
        // reasoning; the stream keeps timeouts out of the picture.
        max_tokens: 8192,
        system: personaSystemPrompt(t),
        messages: messages,
        stream: true,
      }),
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (body) {
          var msg = "API error " + res.status;
          try {
            var parsed = JSON.parse(body);
            if (parsed.error && parsed.error.message) msg += ": " + parsed.error.message;
          } catch (e) { /* non-JSON body */ }
          if (res.status === 401) msg += " — check your API key in Settings.";
          throw new Error(msg);
        });
      }
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = "";
      var stopReason = null;

      function pump() {
        return reader.read().then(function (step) {
          if (step.done) return;
          buffer += decoder.decode(step.value, { stream: true });
          var lines = buffer.split("\n");
          buffer = lines.pop(); // keep the trailing partial line
          lines.forEach(function (line) {
            if (line.indexOf("data:") !== 0) return;
            var payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") return;
            var evt;
            try { evt = JSON.parse(payload); } catch (e) { return; }
            if (evt.type === "content_block_delta" && evt.delta && evt.delta.type === "text_delta") {
              acc += evt.delta.text;
              if (!streamStarted) { streamStarted = true; bubble.classList.remove("thinking"); }
              bubble.textContent = acc;
              scrollChat();
            } else if (evt.type === "message_delta" && evt.delta && evt.delta.stop_reason) {
              stopReason = evt.delta.stop_reason;
            } else if (evt.type === "error") {
              throw new Error(evt.error && evt.error.message ? evt.error.message : "stream error");
            }
          });
          return pump();
        });
      }
      return pump().then(function () {
        if (stopReason === "refusal") {
          // Discard any partial output rather than saving it as complete counsel.
          throw new Error("The model declined this request. Try rephrasing, or switch engines in Settings.");
        }
        if (stopReason === "max_tokens" && acc) acc += " […]";
      });
    }).then(function () {
      if (acc) finish(acc);
      else fail("Empty reply from the API. Try again, or switch to the built-in engine in Settings.");
    }).catch(function (err) {
      var hint = /Failed to fetch|NetworkError/.test(String(err && err.message)) ?
        " (Network/CORS issue — the key must be a direct Anthropic API key, and you must be online.)" : "";
      fail((err && err.message ? err.message : "Request failed") + hint);
    });
  }

  /* ── Council: one question, up to ten minds ────────────────── */

  var COUNCIL_MAX = 10;
  var councilSel = [];        // selected mentor ids, in pick order
  var councilBusy = false;
  var councilGen = 0;         // bumped on convene/close so an abandoned run's callbacks die quietly

  function usingClaude() { return settings.engine === "claude" && !!settings.apiKey; }

  function saveBench() { save(LS.bench, councilSel); }

  function openCouncil(preselectId) {
    $("aboutView").hidden = true; // the council always takes the room
    if (GI.open) closeInsight();
    if (!councilSel.length) {
      // A once-assembled Supreme Council keeps its seats between visits.
      councilSel = load(LS.bench, []).filter(function (id) { return !!findMind(id); }).slice(0, COUNCIL_MAX);
    }
    if (preselectId && councilSel.indexOf(preselectId) === -1 && councilSel.length < COUNCIL_MAX) {
      councilSel.push(preselectId);
      saveBench();
    }
    $("councilView").hidden = false;
    $("councilSetup").hidden = false;
    $("councilReport").hidden = true;
    $("councilEnginePill").textContent = usingClaude()
      ? (settings.insightOn ? "Claude AI · Insight+" : "Claude AI")
      : "Wisdom engine";
    $("councilEnginePill").classList.toggle("ai", usingClaude());
    $("councilResearchRow").style.display = usingClaude() ? "" : "none";
    if (usingClaude() && settings.insightOn) $("councilResearch").checked = true;
    $("councilEngineNote").textContent = usingClaude()
      ? "Each mind deliberates through Claude (" + (settings.model || "claude-opus-5") + ")."
      : "Offline mode: answers are composed from each mind's curated teachings. Add a Claude API key in Settings for deep AI deliberation.";
    renderCouncilPicker();
    renderCouncilHistory();
    $("councilQuestion").focus();
  }
  function closeCouncil() {
    if (councilBusy && !confirm("The council is still deliberating. Leave anyway?")) return;
    councilBusy = false;
    councilGen++; // an abandoned run must never write into a later one
    stopMC();
    $("councilView").hidden = true;
  }

  /* ── About: the chamber ────────────────────────────────────── */

  function openAbout() {
    if (!$("chatView").hidden) closeChat();
    if (!$("councilView").hidden) closeCouncil();
    if (!$("councilView").hidden) return; // user chose to stay with a deliberating council
    if (GI.open) closeInsight();
    $("aboutView").hidden = false;
    $("aboutScroll").scrollTop = 0;
    updateAboutProgress();
  }
  function closeAbout() {
    $("aboutView").hidden = true;
  }
  function updateAboutProgress() {
    var sc = $("aboutScroll"), bar = $("aboutProgressBar");
    if (!sc || !bar) return;
    var max = sc.scrollHeight - sc.clientHeight;
    var p = max > 0 ? sc.scrollTop / max : 0;
    bar.style.transform = "scaleX(" + p.toFixed(4) + ")";
  }
  function wireAbout() {
    $("aboutBtn").addEventListener("click", openAbout);
    $("aboutBack").addEventListener("click", closeAbout);

    // Names in the story open the member's existing profile.
    $("aboutView").addEventListener("click", function (e) {
      var link = e.target.closest ? e.target.closest("[data-mind]") : null;
      if (link && findMind(link.getAttribute("data-mind"))) openProfile(link.getAttribute("data-mind"));
    });

    var ticking = false;
    $("aboutScroll").addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { updateAboutProgress(); ticking = false; });
    }, { passive: true });

    // Section rail: click to travel, observe to highlight.
    var rail = $("aboutRail");
    var buttons = rail ? rail.querySelectorAll("button") : [];
    Array.prototype.forEach.call(buttons, function (b) {
      b.addEventListener("click", function () {
        var t = $(b.getAttribute("data-target"));
        if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    if (rail && "IntersectionObserver" in window) {
      var railIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          Array.prototype.forEach.call(buttons, function (b) {
            b.classList.toggle("active", b.getAttribute("data-target") === entry.target.id);
          });
        });
      }, { root: $("aboutScroll"), rootMargin: "-30% 0px -60% 0px" });
      ["actName", "actLineage", "actCouncil", "actCollision", "actChamber", "actQuestion"].forEach(function (id) {
        var n = $(id);
        if (n) railIO.observe(n);
      });
    }
  }

  function renderCouncilPicker() {
    var wrap = $("councilPicker");
    var filter = $("councilFilter").value.trim().toLowerCase();
    wrap.innerHTML = "";
    allMinds().forEach(function (t) {
      if (filter && !matchesSearch(t, filter)) return;
      var b = el("button", "pick" + (councilSel.indexOf(t.id) !== -1 ? " selected" : ""));
      b.type = "button";
      b.setAttribute("data-cat", t.category);
      var med = el("div");
      paintMedallion(med, t, "medallion-sm");
      b.appendChild(med);
      var box = el("div");
      box.appendChild(el("div", "pick-name", t.name));
      box.appendChild(el("div", "pick-sub", t.epithet || categoryLabel(t.category)));
      b.appendChild(box);
      b.appendChild(el("span", "pick-check", "✓"));
      b.addEventListener("click", function () {
        var i = councilSel.indexOf(t.id);
        if (i !== -1) councilSel.splice(i, 1);
        else if (councilSel.length < COUNCIL_MAX) councilSel.push(t.id);
        else { toast("The Supreme Council seats " + COUNCIL_MAX + " at most — remove someone first."); return; }
        saveBench();
        renderCouncilPicker();
      });
      wrap.appendChild(b);
    });
    $("councilCount").textContent = councilSel.length + " / " + COUNCIL_MAX;
  }

  function conveneCouncil() {
    if (councilBusy) return;
    stopMC();
    var q = $("councilQuestion").value.trim();
    if (!q) { toast("Write the question first."); $("councilQuestion").focus(); return; }
    var members = councilSel.map(findMind).filter(Boolean);
    if (!members.length) { toast("Choose at least one mind for the council."); return; }

    councilBusy = true;
    councilGen++;
    var gen = councilGen;
    recordQuery(null, q);
    $("councilSetup").hidden = true;
    $("councilReport").hidden = false;
    $("councilReportQ").textContent = q;
    $("councilConsolidated").hidden = true;
    $("councilCopy").hidden = true;
    $("councilAnswers").innerHTML = "";
    $("councilScroll").scrollTop = 0;

    var cards = {};
    members.forEach(function (t) {
      var card = el("div", "voice-card");
      card.setAttribute("data-cat", t.category);
      var med = el("div");
      paintMedallion(med, t, "medallion-md");
      card.appendChild(med);
      var body = el("div", "voice-body");
      body.appendChild(el("div", "voice-name", t.name));
      body.appendChild(el("div", "voice-epithet", t.epithet || ""));
      var text = el("div", "voice-text pending", "Deliberating…");
      body.appendChild(text);
      card.appendChild(body);
      $("councilAnswers").appendChild(card);
      cards[t.id] = text;
    });

    var report = { question: q, when: new Date().toISOString(), engine: usingClaude() ? "claude" : "wisdom", answers: [], consensus: null };

    var finishAll = function () {
      if (gen !== councilGen) return;
      councilBusy = false;
      $("councilStatus").textContent = report.engine === "claude"
        ? "The consensus of the Supreme Council is drafted."
        : "Consensus composed offline from the council's own teachings — add a Claude API key in Settings for deep AI deliberation.";
      $("councilCopy").hidden = false;
      save("freemasonry-circle.council.last", report);
      var hist = load(LS.history, []);
      hist.unshift(report);
      if (hist.length > 10) hist.length = 10;
      if (!save(LS.history, hist) && hist.length > 4) {
        // Storage is tight: keep the freshest few rather than silently losing all.
        hist.length = 4;
        save(LS.history, hist);
        toast("Browser storage is tight — keeping only the freshest consensus reports.");
      }
      adminLog({
        t: report.when, kind: "council",
        q: q.slice(0, 140),
        members: members.map(function (t) { return t.name; }),
        engine: report.engine,
        themes: (report.consensus && report.consensus.themes) || [],
        conf: report.consensus && report.consensus.confidence ? report.consensus.confidence.level : "",
        summary: report.consensus ? String(report.consensus.verdict || "").slice(0, 180) : "",
      });
    };
    var showConsensus = function (c) {
      if (gen !== councilGen) return;
      report.consensus = c;
      (c.directives || []).slice(0, 3).forEach(function (d) {
        recordInsight(d.imperative + " — " + (d.reasoning || "").slice(0, 160), d.drawnFrom);
      });
      renderConsensus(c);
      tagVotes(c);
      $("councilProvenance").textContent = report.engine === "claude"
        ? "Deliberated and drafted by " + (settings.model || "claude-opus-5") + " from the " + members.length + " voices above."
        : "Composed on-device from the assembled minds' own teachings — every line traces to a member's corpus.";
      $("councilConsolidated").hidden = false;
      // The verdict goes to trial: the Monte Carlo runs live in the document.
      renderMCLive(c, q + "|" + members.map(function (t) { return t.id; }).join(",") + "|mc", function (m) {
        if (!m) return;
        c.monteCarlo = m;
        updateSavedReport(report);
        adminLogPatch(report.when, { p: m.courses[0] ? m.courses[0].p : null });
      });
    };

    if (usingClaude()) {
      runClaudeCouncil(q, members, cards, report, showConsensus, finishAll);
    } else {
      // Offline: stagger the reveals so the council feels alive — but cap the
      // total theater at ~4s, and skip it entirely for reduced-motion users.
      var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
      var per = reduced ? 0 : Math.min(350, Math.ceil(4000 / members.length));
      members.forEach(function (t, i) {
        setTimeout(function () {
          if (gen !== councilGen) return;
          var a = offlineCouncilAnswer(t, q);
          cards[t.id].classList.remove("pending");
          cards[t.id].textContent = a;
          report.answers.push({ id: t.id, name: t.name, text: a });
          if (report.answers.length === members.length) {
            $("councilStatus").textContent = "The council withdraws to draft its consensus…";
            setTimeout(function () {
              if (gen !== councilGen) return;
              showConsensus(buildOfflineConsensus(q, members));
              finishAll();
            }, reduced ? 0 : 900);
          }
        }, per * (i + 1));
      });
      $("councilStatus").textContent = "The council considers your question…";
    }
  }

  /* Offline council: per-expert answer + mechanical synthesis. */

  function offlineCouncilAnswer(t, q) {
    var topicKey = detectTopic(q);
    var parts = [];
    if (topicKey && t.wisdom && t.wisdom[topicKey]) parts.push(t.wisdom[topicKey]);
    var ps = t.principles || [];
    if (ps.length) {
      var p = ps[hashCode(t.id + q) % ps.length];
      parts.push("Hold my teaching of " + p.title.toLowerCase() + " against your question: " + p.text);
    }
    if (!parts.length) parts.push((t.greeting || "") + " Bring me the particulars, and I will reason with you from what my life taught me.");
    return parts.join("\n\n");
  }

  /* ── The Consensus of the Supreme Council (offline engine) ────
     A full deliberation synthesis composed on-device from each member's
     corpus: theme decomposition, convergence clustering, tension axes,
     risk register, verdict, directives, minority opinion. Deterministic
     for a given question + bench, so a recalled report re-reads true. */

  var STOP_WORDS = {};
  ("the and for you your with that this from what should when where will would could into about have has had been being does doing they them then than very much more most some such only just like also over under after before because while against between himself herself itself" +
    " ourselves myself yourself their there these those upon unto shall might must each every other another again still even ever never here how why who whom whose which whether during without within toward towards").split(" ")
    .forEach(function (w) { if (w) STOP_WORDS[w] = 1; });

  function sigWords(s) {
    return String(s || "").toLowerCase().split(/[^a-z]+/).filter(function (w) {
      return w.length > 3 && !STOP_WORDS[w];
    }).map(function (w) {
      return w.replace(/(ational|iveness|fulness|ously|ation|ition|ment|ness|ance|ence|able|ible|ally|ings|ing|ers|ies|ied|es|ed|ly|s)$/, "");
    }).filter(function (w) { return w.length > 2; });
  }
  function overlapCount(a, b) {
    var set = {}, n = 0, seen = {};
    a.forEach(function (w) { set[w] = 1; });
    b.forEach(function (w) { if (set[w] && !seen[w]) { n++; seen[w] = 1; } });
    return n;
  }
  function memberCorpus(t) {
    var bits = [t.bio || "", t.voice || ""];
    (t.tags || []).forEach(function (x) { bits.push(x); });
    (t.principles || []).forEach(function (p) { bits.push(p.title + " " + p.text); });
    (t.doctrine || []).forEach(function (d) { bits.push(d.name + " " + d.reasoning + " " + d.imperative); });
    Object.keys(t.wisdom || {}).forEach(function (k) { bits.push(t.wisdom[k]); });
    return bits.join(" ").toLowerCase();
  }
  function firstSentence(s, max) {
    s = String(s || "").trim();
    var m = s.match(/^.*?[.!?](\s|$)/);
    var out = m ? m[0].trim() : s;
    if (out.length > max) out = out.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
    return out;
  }
  function listNames(names) {
    if (names.length <= 1) return names[0] || "";
    return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
  }

  // Tension axes the bench can divide along. Each member is scored on each
  // axis from their own corpus; a wide, opposite-signed spread is a dissent.
  var AXES = [
    { key: "tempo", aName: "striking now", bName: "preparing first",
      a: ["act", "strike", "seize", "swift", "speed", "bold", "dare", "attack", "momentum", "decisive", "immediat", "audac"],
      b: ["patien", "wait", "slow", "prepare", "study", "reserve", "margin", "caution", "endur", "survive", "season", "ripen"] },
    { key: "scale", aName: "the self", bName: "the institution",
      a: ["soul", "character", "virtue", "inner", "conscience", "self", "mind", "spirit", "own"],
      b: ["institution", "system", "order", "structure", "organiz", "nation", "state", "law", "process", "team", "machine"] },
    { key: "method", aName: "principle", bName: "consequence",
      a: ["principle", "truth", "ideal", "moral", "right", "virtue", "honest", "integrity", "duty"],
      b: ["result", "outcome", "power", "advantage", "interest", "practical", "effect", "leverage", "win", "works"] },
    { key: "risk", aName: "daring the upside", bName: "refusing ruin",
      a: ["venture", "gamble", "fortune", "opportun", "upside", "bet", "leap", "risk"],
      b: ["ruin", "loss", "downside", "irrevers", "protect", "preserve", "insur", "collapse", "surviv", "reversib"] },
  ];
  var RISK_WORDS = ["ruin", "fail", "collapse", "danger", "cost", "irrevers", "blind", "hubris", "overreach", "decay", "corrupt", "fragil", "expos", "betray", "exhaust"];

  function detectThemes(text) {
    var lower = " " + text.toLowerCase() + " ";
    var scored = [];
    TOPICS.forEach(function (topic) {
      var score = 0;
      topic.words.forEach(function (w) { if (lower.indexOf(w) !== -1) score += w.length > 6 ? 2 : 1; });
      if (score > 0) scored.push({ key: topic.key, score: score });
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, 3).map(function (s) { return s.key; });
  }

  function buildOfflineConsensus(q, members) {
    var seed = hashCode(q + "|" + members.map(function (t) { return t.id; }).join(","));
    var qStems = sigWords(q);
    var themes = detectThemes(q);
    // Bare questions ("Is it time?") hit no keywords: let the bench itself
    // say what the question is about — the wisdom key it best overlaps.
    if (!themes.length) {
      var bestK = null, bestKScore = 0;
      TOPICS.forEach(function (topic) {
        var s = 0;
        members.forEach(function (t) {
          if ((t.wisdom || {})[topic.key]) s += overlapCount(qStems, sigWords(t.wisdom[topic.key]));
        });
        if (s > bestKScore) { bestKScore = s; bestK = topic.key; }
      });
      themes = [bestK || "purpose"];
    }
    var theme = themes[0] || null;

    // How the question is shaped steers the council's register.
    var qLower = q.toLowerCase();
    var qKind = /\b(should|whether|choose|quit|leave|accept|sell|start|take|stay)\b/.test(qLower) ? "decision"
      : /\bhow (do|can|should|to|might)\b/.test(qLower) ? "howto"
      : /\b(why|worth|meaning|point of)\b/.test(qLower) ? "meaning"
      : /\b(partner|cofounder|boss|team|board|family|spouse|rival|colleague|investor)\b/.test(qLower) ? "conflict"
      : "open";
    var kindVerb = {
      decision: "weighed the choice before it",
      howto: "traced the path asked of it",
      meaning: "searched the ground beneath it",
      conflict: "sat between the parties named in it",
      open: "turned the question in open session",
    }[qKind];

    // Bench corpora, built once; stems every single member shares are noise
    // ("life", "power") and never count as a point of accord.
    var corpora = {};
    members.forEach(function (t) { corpora[t.id] = memberCorpus(t); });
    var commonStems = {};
    if (members.length >= 3) {
      var df = {};
      members.forEach(function (t) {
        var seenStem = {};
        sigWords(corpora[t.id]).forEach(function (w) {
          if (!seenStem[w]) { seenStem[w] = 1; df[w] = (df[w] || 0) + 1; }
        });
      });
      Object.keys(df).forEach(function (w) { if (df[w] === members.length) commonStems[w] = 1; });
    }

    // Score every principle of every member against the question + themes.
    var scored = [];
    members.forEach(function (t) {
      (t.principles || []).forEach(function (p) {
        var stems = sigWords(p.title + " " + p.text);
        var score = overlapCount(qStems, stems) * 3;
        themes.forEach(function (k, ti) {
          if ((t.wisdom || {})[k] && overlapCount(sigWords(t.wisdom[k]), stems) > 1) score += 2 - ti;
        });
        scored.push({ t: t, p: p, stems: stems, score: score + (hashCode(t.id + p.title + q) % 3) });
      });
    });
    scored.sort(function (a, b) { return b.score - a.score; });

    // Convergence: cluster the strongest principles across DIFFERENT members
    // by shared stems — each cluster of 2+ minds is a point of agreement.
    var top = scored.slice(0, Math.min(scored.length, members.length * 4));
    var used = {};
    var convergence = [];
    top.forEach(function (s, i) {
      if (used[i] || convergence.length >= 4) return;
      var holders = [s.t.name], holderIds = {}, texts = [s.p.text];
      holderIds[s.t.id] = true;
      for (var j = i + 1; j < top.length; j++) {
        if (used[j] || holderIds[top[j].t.id]) continue;
        // Kinship: two distinctive stems in common, or one the question itself uses.
        var shared = [];
        var seen = {};
        s.stems.forEach(function (w) { seen[w] = 1; });
        top[j].stems.forEach(function (w) {
          if (seen[w] === 1 && !commonStems[w]) { shared.push(w); seen[w] = 2; }
        });
        var topical = shared.some(function (w) { return qStems.indexOf(w) !== -1; });
        if (shared.length >= 2 || (shared.length === 1 && topical)) {
          used[j] = true;
          holderIds[top[j].t.id] = true;
          holders.push(top[j].t.name);
          texts.push(top[j].p.text);
        }
      }
      if (holders.length >= 2) {
        used[i] = true;
        convergence.push({ point: firstSentence(texts[0], 220) + " " + firstSentence(texts[1], 160), holders: holders });
      }
    });
    // Theme-level accords: for each detected theme most of the bench teaches on,
    // the shared treatment of that theme is itself a point of agreement.
    themes.forEach(function (tk, ti) {
      var teachers = members.filter(function (t) { return (t.wisdom || {})[tk]; });
      var quorum = ti === 0 ? Math.max(2, Math.ceil(members.length * 0.6)) : Math.max(2, Math.ceil(members.length * 0.8));
      if (teachers.length < quorum) return;
      var sampleA = teachers[seed % teachers.length];
      var sampleB = teachers[(seed + 1 + ti) % teachers.length];
      var point = ti === 0
        ? "The bench treats " + tk + " not as a verdict on the asker but as raw material to be worked. As one voice puts it: " + firstSentence(sampleA.wisdom[tk], 200)
        : "On " + tk + " the bench also speaks with one accord. " + firstSentence(sampleB.wisdom[tk], 180);
      convergence[ti === 0 ? "unshift" : "push"]({ point: point, holders: teachers.map(function (t) { return t.name; }) });
    });
    if (convergence.length > 4) convergence.length = 4;

    // Dissent: score each member on each axis; wide opposite spreads divide the bench.
    var axisCount = function (corpus, words) {
      var n = 0;
      words.forEach(function (w) {
        var idx = -1, c = 0;
        while ((idx = corpus.indexOf(w, idx + 1)) !== -1 && c < 6) c++;
        n += c;
      });
      return n;
    };
    var dissents = [];
    var dissentPairs = []; // member OBJECT pairs — the debate must never re-resolve by display name
    if (members.length >= 2) {
      var axisSpreads = AXES.map(function (ax) {
        var rows = members.map(function (t) {
          return { t: t, v: axisCount(corpora[t.id], ax.a) - axisCount(corpora[t.id], ax.b) };
        }).sort(function (a, b) { return b.v - a.v; });
        var hi = rows[0], lo = rows[rows.length - 1];
        return { ax: ax, hi: hi, lo: lo, spread: hi.v - lo.v };
      }).filter(function (r) { return r.hi.v >= 2 && r.lo.v <= -2; })
        .sort(function (a, b) { return b.spread - a.spread; });
      axisSpreads.slice(0, 2).forEach(function (r) {
        dissentPairs.push({ hi: r.hi.t, lo: r.lo.t, ax: r.ax });
        var pickSide = function (t, words) {
          var best = null, bestN = -1;
          (t.principles || []).forEach(function (p) {
            var n = axisCount((p.title + " " + p.text).toLowerCase(), words);
            if (n > bestN) { bestN = n; best = p; }
          });
          return best ? firstSentence(best.text, 170) : firstSentence((t.doctrine && t.doctrine[0] ? t.doctrine[0].reasoning : t.bio), 170);
        };
        // Four resolution forms — sequence, jurisdiction, trigger, synthesis —
        // seeded so different questions resolve their tensions differently.
        var forms = [
          "The council keeps both: let " + r.ax.bName + " set the boundary, and " + r.ax.aName + " set the pace within it.",
          "The council resolves it by sequence: " + r.lo.t.name + "'s caution governs the first move, and " + r.hi.t.name + "'s fire governs every move after the ground is proven.",
          "The council divides the jurisdiction: where a loss could not be recovered, " + r.lo.t.name + " rules; everywhere else, " + r.hi.t.name + " does.",
          "The council sets a tripwire: hold " + r.lo.t.name + "'s course until the facts turn — and the moment they do, " + r.hi.t.name + "'s counsel takes command without a second meeting.",
        ];
        dissents.push({
          between: [r.hi.t.name, r.lo.t.name],
          tension: r.hi.t.name + " weighs toward " + r.ax.aName + " — " + pickSide(r.hi.t, r.ax.a) +
            " " + r.lo.t.name + " counters from " + r.ax.bName + ": " + pickSide(r.lo.t, r.ax.b),
          resolution: forms[hashCode(q + "|" + r.ax.key) % forms.length],
        });
      });
    }

    // The debate: the chamber's exchange, reconstructed from the members'
    // own teachings along the live tension lines. Every line is the speaker's
    // real corpus material — the debate stages it as call and response.
    var debate = [];
    var debPrinciple = function (t, words, avoid) {
      var best = null, bestN = -1;
      (t.principles || []).forEach(function (p) {
        if (avoid[t.id + "|" + p.title]) return;
        var n = axisCount((p.title + " " + p.text).toLowerCase(), words);
        if (n > bestN) { bestN = n; best = p; }
      });
      return best;
    };
    if (dissentPairs.length) {
      var used1 = {};
      // A member without principles (a sparse custom expert) still speaks —
      // from their theme essay or bio — so a debate is never one-sided.
      var debFallback = function (t) {
        return firstSentence((theme && (t.wisdom || {})[theme]) || t.bio || t.voice || "", 180);
      };
      dissentPairs.slice(0, 2).forEach(function (pr, di) {
        var hiP = debPrinciple(pr.hi, pr.ax.a, used1);
        var loP = debPrinciple(pr.lo, pr.ax.b, used1);
        if (hiP) { used1[pr.hi.id + "|" + hiP.title] = 1; debate.push({ speaker: pr.hi.name, line: firstSentence(hiP.text, 190) }); }
        else if (debFallback(pr.hi)) debate.push({ speaker: pr.hi.name, line: debFallback(pr.hi) });
        if (loP) { used1[pr.lo.id + "|" + loP.title] = 1; debate.push({ speaker: pr.lo.name, line: firstSentence(loP.text, 190) }); }
        else if (debFallback(pr.lo)) debate.push({ speaker: pr.lo.name, line: debFallback(pr.lo) });
        if (di === 0) {
          var hiD = (pr.hi.doctrine || [])[hashCode(pr.hi.id + q) % Math.max(1, (pr.hi.doctrine || []).length)];
          var loD = (pr.lo.doctrine || [])[hashCode(pr.lo.id + q) % Math.max(1, (pr.lo.doctrine || []).length)];
          if (hiD) debate.push({ speaker: pr.hi.name, line: "And I hold to this: " + hiD.imperative });
          if (loD) debate.push({ speaker: pr.lo.name, line: "Then hold mine beside it: " + loD.imperative });
        }
      });
    } else if (members.length >= 2) {
      // A unanimous bench still deliberates: two voices test the same ground.
      var a0 = members[seed % members.length];
      var b0 = members[(seed + 1) % members.length];
      var pa = (a0.principles || [])[seed % Math.max(1, (a0.principles || []).length)];
      var pb = (b0.principles || [])[(seed + 1) % Math.max(1, (b0.principles || []).length)];
      if (pa) debate.push({ speaker: a0.name, line: firstSentence(pa.text, 190) });
      if (pb) debate.push({ speaker: b0.name, line: "I reach the same shore by another sea: " + firstSentence(pb.text, 170) });
    }

    // Risk register: doctrine entries whose reasoning names a failure mode.
    var risks = [];
    var riskScored = [];
    members.forEach(function (t) {
      (t.doctrine || []).forEach(function (d) {
        var hay = (d.name + " " + d.reasoning).toLowerCase();
        var rs = 0;
        RISK_WORDS.forEach(function (w) { if (hay.indexOf(w) !== -1) rs += 2; });
        rs += overlapCount(qStems, sigWords(d.reasoning));
        if (rs > 1) riskScored.push({ t: t, d: d, score: rs + (hashCode(t.id + d.name) % 2) });
      });
    });
    riskScored.sort(function (a, b) { return b.score - a.score; });
    var riskMinds = {};
    riskScored.forEach(function (r) {
      if (risks.length >= 3 || riskMinds[r.t.id]) return;
      riskMinds[r.t.id] = true;
      risks.push({ risk: firstSentence(r.d.reasoning, 220), raisedBy: r.t.name, counsel: r.d.imperative });
    });

    // Directives: the five strongest teachings, one per mind, horizon-tagged.
    var directives = [];
    var dMinds = {}, dTitles = {};
    var horizonOf = function (text) {
      var lower = text.toLowerCase();
      if (/\b(now|today|immediat|at once|this week|decide|act|stop|begin)\b/.test(lower)) return "at once";
      if (/\b(habit|daily|always|character|life|every|practice|remain|keep)\b/.test(lower)) return "for life";
      return "this season";
    };
    for (var di = 0; di < scored.length && directives.length < 5; di++) {
      var sd = scored[di];
      if (dMinds[sd.t.id] || dTitles[sd.p.title]) continue;
      dMinds[sd.t.id] = dTitles[sd.p.title] = true;
      directives.push({
        imperative: sd.p.title.replace(/\.*$/, "") + ".",
        reasoning: sd.p.text,
        drawnFrom: sd.t.name,
        horizon: horizonOf(sd.p.title + " " + sd.p.text),
      });
    }

    // Minority opinion: the mind least aligned with the rest of the bench.
    var minority = null;
    if (members.length >= 3) {
      var loneliest = null, lowest = Infinity;
      members.forEach(function (t) {
        var mine = sigWords(corpora[t.id]).slice(0, 400);
        var kinship = 0;
        members.forEach(function (o) {
          if (o.id === t.id) return;
          kinship += overlapCount(mine, sigWords(corpora[o.id]).slice(0, 400));
        });
        kinship = kinship / (members.length - 1);
        if (kinship < lowest) { lowest = kinship; loneliest = t; }
      });
      if (loneliest) {
        var mv = theme && (loneliest.wisdom || {})[theme]
          ? firstSentence(loneliest.wisdom[theme], 240)
          : firstSentence((loneliest.principles && loneliest.principles[0] ? loneliest.principles[0].text : loneliest.bio), 240);
        minority = {
          voice: loneliest.name,
          position: loneliest.name + " signs the verdict but files a caution the bench should keep in view: " + mv,
        };
        if (debate.length) debate.push({ speaker: loneliest.name, line: "Before the vote is sealed, let the record hold my reservation: " + firstSentence(mv, 170) });
      }
    }

    // Conditions under which the council would reconvene.
    var conditions = [];
    if (dissents.length) {
      conditions.push("Should events prove " + dissents[0].between[1] + " right — should " + dissents[0].between[0].split(" ")[0] + "'s pace outrun the ground gained — the weight of the bench shifts, and the cautious course governs.");
    }
    conditions.push("Act on the first directive, then return with what actually happened; a council re-reads its verdict in the light of consequences, never of moods.");
    if (theme) conditions.push("If the question beneath this question is not " + theme + " but something you have not yet said aloud, the council asks you to bring that question instead.");

    // Confidence: how unified the bench actually is.
    var level, note;
    if (!dissents.length && convergence.length >= 2) {
      level = "unanimous";
      note = "Every voice heard reaches the same ground by a different road.";
    } else if (dissents.length <= 1) {
      level = "strong consensus";
      note = "The bench concurs on the essentials; one tension is preserved deliberately rather than resolved.";
    } else {
      level = "a divided bench";
      note = "The council issues a verdict, but the divisions above are real — treat the directives as a sequence, not a chorus.";
    }

    // The verdict: composed from the actual material above.
    var catKeys = {}, catList = [];
    members.forEach(function (t) { if (!catKeys[t.category]) { catKeys[t.category] = 1; catList.push(categoryLabel(t.category).toLowerCase()); } });
    var vparts = [];
    vparts.push("A Supreme Council of " + members.length + (members.length > 1 ? " minds" : " mind") + ", drawn from " + listNames(catList) + ", was convened on this question and heard it as a matter of " + (themes.length ? listNames(themes) : "judgment under uncertainty") + ".");
    if (convergence.length) {
      vparts.push("On the essentials the bench is of one mind. " + firstSentence(convergence[0].point, 240) + (convergence[1] ? " And again, from another quarter: " + firstSentence(convergence[1].point, 200) : ""));
    }
    if (dissents.length) {
      vparts.push("The bench divides once, and the division is worth keeping: " + firstSentence(dissents[0].tension, 260) + " " + dissents[0].resolution);
    }
    if (risks.length) {
      vparts.push("Before any course is set, the council names the failure it fears most — " + risks[0].risk.replace(/\.$/, "") + " (" + risks[0].raisedBy + ") — and charges: " + risks[0].counsel);
    }
    if (directives.length) {
      vparts.push("Weighing every voice, the council's judgment settles here: " + directives[0].imperative + " " + firstSentence(directives[0].reasoning, 220) + " The remaining directives follow in order of weight, each credited to the mind that carries it.");
    }
    vparts.push("So concludes the Supreme Council — " + members.length + (members.length > 1 ? " voices" : " voice") + " concurring" + (minority ? ", one caution filed" : "") + ".");

    return {
      preamble: 'The council heard the question — "' + (q.length > 180 ? q.slice(0, 179).replace(/\s+\S*$/, "") + "…" : q) + '" — ' + kindVerb + ", and read it as a matter of " + (themes.length ? listNames(themes) : "judgment under uncertainty") + ".",
      themes: themes,
      debate: debate,
      convergence: convergence,
      dissents: dissents,
      risks: risks,
      verdict: vparts.join("\n\n"),
      directives: directives,
      minority: minority,
      conditions: conditions.slice(0, 3),
      confidence: { level: level, note: note },
    };
  }

  /* ── The trial of ten thousand futures (Monte Carlo) ─────────
     After the verdict, the consensus is stress-tested live: ten thousand
     seeded trials perturb the council's own weighting and count how often
     the consensus course still outranks the alternatives the bench itself
     raised. A sensitivity trial of the council's conviction — shown running. */

  var mcTimer = null;
  function stopMC() { if (mcTimer) { clearTimeout(mcTimer); mcTimer = null; } }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // The courses on trial: the consensus, the strongest counter-voice the
  // bench itself produced, and deliberate delay. Base weights derive from
  // the report's real structure (accords strengthen, dissents erode).
  function mcCourses(c) {
    var courses = [];
    var d0 = (c.directives || [])[0];
    courses.push({
      name: "The consensus course",
      detail: d0 ? d0.imperative : "The council's verdict as delivered.",
      base: 0.92 + 0.03 * Math.min(3, (c.convergence || []).length) - 0.07 * Math.min(3, (c.dissents || []).length),
    });
    if (c.dissents && c.dissents.length) {
      courses.push({
        name: (c.dissents[0].between || [])[1] ? c.dissents[0].between[1] + "'s counter-course" : "The counter-course",
        detail: firstSentence(c.dissents[0].tension, 140),
        base: 0.58 + 0.06 * Math.min(3, c.dissents.length),
      });
    } else if (c.minority && c.minority.voice) {
      courses.push({
        name: c.minority.voice + "'s reservation as the course",
        detail: firstSentence(c.minority.position, 140),
        base: 0.52,
      });
    }
    courses.push({
      name: "Hold and gather",
      detail: "Deliberate delay — act on nothing, watch the ground, reconvene.",
      base: 0.44 + 0.03 * Math.min(4, (c.risks || []).length),
    });
    return courses;
  }

  function runMonteCarlo(courses, seedStr, hooks) {
    var TRIALS = 10000;
    var rand = mulberry32(hashCode(seedStr) || 1);
    var wins = courses.map(function () { return 0; });
    var done = 0;
    var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var BATCH = (reduced || hooks.instant) ? TRIALS : 160;
    var step = function () {
      mcTimer = null;
      if (hooks.alive && !hooks.alive()) return;
      var n = Math.min(BATCH, TRIALS - done);
      for (var i = 0; i < n; i++) {
        var bestJ = 0, bestU = -Infinity;
        for (var j = 0; j < courses.length; j++) {
          var noise = (rand() + rand() + rand() - 1.5) * 0.3;
          var u = courses[j].base + noise;
          if (u > bestU) { bestU = u; bestJ = j; }
        }
        wins[bestJ]++;
      }
      done += n;
      if (hooks.tick) hooks.tick(done, TRIALS, wins);
      if (done < TRIALS) { mcTimer = setTimeout(step, 28); return; }
      var ps = wins.map(function (w) { return w / TRIALS; });
      var ci = 1.96 * Math.sqrt(Math.max(ps[0] * (1 - ps[0]), 1e-9) / TRIALS);
      hooks.done({
        trials: TRIALS,
        courses: courses.map(function (co, k) { return { name: co.name, detail: co.detail, p: Math.round(ps[k] * 1000) / 1000 }; }),
        ci: Math.round(ci * 1000) / 1000,
      });
    };
    step();
  }

  function mcRows(mcNode, courses) {
    return courses.map(function (co) {
      var row = el("div", "mc-row");
      var head = el("div", "mc-row-head");
      head.appendChild(el("span", "mc-name", co.name));
      var pct = el("span", "mc-pct", "—");
      head.appendChild(pct);
      row.appendChild(head);
      var track = el("div", "mc-track");
      var bar = el("div", "mc-bar");
      track.appendChild(bar);
      row.appendChild(track);
      row.appendChild(el("div", "mc-detail", co.detail || ""));
      mcNode.appendChild(row);
      return { bar: bar, pct: pct };
    });
  }

  function mcVerdictLine(m) {
    var p0 = m.courses[0] ? m.courses[0].p : 0;
    return "Across " + m.trials.toLocaleString() + " simulated futures, the consensus holds as the optimal course in " +
      (p0 * 100).toFixed(1) + "% ± " + (m.ci * 100).toFixed(1) + "% of trials.";
  }
  var MC_DISCLAIMER = "A sensitivity trial of the council's own weighting under random perturbation — a measure of how firmly this bench holds its verdict, not a forecast of the world.";

  function renderMCStatic(mcNode, m) {
    mcNode.innerHTML = "";
    mcNode.appendChild(el("div", "mc-counter", m.trials.toLocaleString() + " trials complete"));
    var rows = mcRows(mcNode, m.courses);
    m.courses.forEach(function (co, j) {
      rows[j].bar.style.width = (co.p * 100).toFixed(1) + "%";
      rows[j].pct.textContent = (co.p * 100).toFixed(1) + "%";
    });
    mcNode.appendChild(el("p", "mc-verdict", mcVerdictLine(m)));
    mcNode.appendChild(el("p", "fine", MC_DISCLAIMER));
  }

  function renderMCLive(c, seedStr, onSettled) {
    var mcNode = document.querySelector("#consensusDoc .cons-mc");
    if (!mcNode) { if (onSettled) onSettled(null); return; }
    stopMC();
    mcNode.innerHTML = "";
    var counter = el("div", "mc-counter", "Trial 0 / 10,000");
    mcNode.appendChild(counter);
    var courses = mcCourses(c);
    var rows = mcRows(mcNode, courses);
    runMonteCarlo(courses, seedStr, {
      alive: function () { return counter.isConnected; },
      tick: function (done, total, wins) {
        counter.textContent = "Trial " + done.toLocaleString() + " / " + total.toLocaleString();
        for (var j = 0; j < rows.length; j++) {
          var p = wins[j] / done;
          rows[j].bar.style.width = (p * 100).toFixed(1) + "%";
          rows[j].pct.textContent = (p * 100).toFixed(1) + "%";
        }
      },
      done: function (m) {
        counter.textContent = m.trials.toLocaleString() + " trials complete";
        mcNode.appendChild(el("p", "mc-verdict", mcVerdictLine(m)));
        mcNode.appendChild(el("p", "fine", MC_DISCLAIMER));
        // Deferred so a synchronous run (reduced motion) still settles AFTER
        // the convene flow has finished saving and logging the report.
        if (onSettled) setTimeout(function () { onSettled(m); }, 0);
      },
    });
  }

  /* ── Consensus rendering & history ─────────────────────────── */

  function consSection(doc, numeral, title) {
    var sec = el("section", "cons-sec");
    var head = el("h4");
    head.appendChild(el("span", "cons-numeral", numeral));
    head.appendChild(document.createTextNode(title));
    sec.appendChild(head);
    doc.appendChild(sec);
    return sec;
  }

  function renderConsensus(c) {
    var doc = $("consensusDoc");
    doc.innerHTML = "";
    var n = 0;
    var next = function () { n++; return roman(n) + "."; };

    var s1 = consSection(doc, next(), "The question as heard");
    s1.appendChild(el("p", "cons-preamble", c.preamble || ""));
    if (c.themes && c.themes.length) {
      var chips = el("div", "cons-themes");
      c.themes.forEach(function (t) { chips.appendChild(el("span", "cons-chip", t)); });
      s1.appendChild(chips);
    }

    if (c.debate && c.debate.length) {
      var sD = consSection(doc, next(), "The debate");
      var chamber = el("div", "cons-debate");
      var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
      c.debate.forEach(function (x, i) {
        if (!x || !x.speaker || !x.line) return;
        var lineEl = el("div", "cons-debate-line");
        lineEl.appendChild(el("b", null, x.speaker));
        lineEl.appendChild(el("span", null, x.line));
        if (!reduced) lineEl.style.animationDelay = Math.min(i * 0.3, 3).toFixed(1) + "s";
        chamber.appendChild(lineEl);
      });
      sD.appendChild(chamber);
    }

    if (c.convergence && c.convergence.length) {
      var s2 = consSection(doc, next(), "Where the council converges");
      c.convergence.forEach(function (cv) {
        var item = el("div", "cons-conv");
        item.appendChild(el("p", null, cv.point));
        if (cv.holders && cv.holders.length) item.appendChild(el("div", "cons-holders", "— held by " + listNames(cv.holders)));
        s2.appendChild(item);
      });
    }

    if (c.dissents && c.dissents.length) {
      var s3 = consSection(doc, next(), "Where the council divides");
      c.dissents.forEach(function (d) {
        var item = el("div", "cons-dissent");
        if (d.between && d.between.length === 2) item.appendChild(el("div", "cons-between", d.between[0] + "  ⚔  " + d.between[1]));
        item.appendChild(el("p", null, d.tension));
        if (d.resolution) item.appendChild(el("p", "cons-resolution", d.resolution));
        s3.appendChild(item);
      });
    }

    if (c.risks && c.risks.length) {
      var s4 = consSection(doc, next(), "Risks the council names");
      c.risks.forEach(function (r) {
        var item = el("div", "cons-risk");
        item.appendChild(el("p", null, r.risk));
        item.appendChild(el("div", "cons-risk-counsel", r.counsel + (r.raisedBy ? "  — " + r.raisedBy : "")));
        s4.appendChild(item);
      });
    }

    var s5 = consSection(doc, next(), "The verdict of the Supreme Council");
    s5.appendChild(el("div", "cons-verdict", c.verdict || ""));

    if (c.directives && c.directives.length) {
      var s6 = consSection(doc, next(), "Directives");
      var ol = el("ol", "recs cons-directives");
      c.directives.forEach(function (d) {
        var li = el("li");
        var box = el("div");
        var b = el("b", null, d.imperative);
        if (d.horizon) b.appendChild(el("i", "cons-horizon", d.horizon));
        box.appendChild(b);
        box.appendChild(el("span", null, d.reasoning));
        if (d.drawnFrom) box.appendChild(el("i", "rec-from", "Drawn from " + d.drawnFrom));
        li.appendChild(box);
        ol.appendChild(li);
      });
      s6.appendChild(ol);
    }

    if (c.minority && c.minority.voice) {
      var s7 = consSection(doc, next(), "The minority opinion");
      var mi = el("div", "cons-minority");
      mi.appendChild(el("p", null, c.minority.position));
      s7.appendChild(mi);
    }

    if (c.conditions && c.conditions.length) {
      var s8 = consSection(doc, next(), "Conditions to reconvene");
      var ul = el("ul", "cons-conditions");
      c.conditions.forEach(function (cond) { ul.appendChild(el("li", null, cond)); });
      s8.appendChild(ul);
    }

    var s9 = consSection(doc, next(), "The trial of ten thousand futures");
    var mcNode = el("div", "cons-mc");
    s9.appendChild(mcNode);
    if (c.monteCarlo) renderMCStatic(mcNode, c.monteCarlo);
    else mcNode.appendChild(el("p", "cons-preamble", "The verdict now goes to trial…"));

    if (c.confidence && c.confidence.level) {
      var meta = el("div", "cons-meta");
      meta.appendChild(el("span", "cons-level", c.confidence.level));
      meta.appendChild(el("span", null, c.confidence.note || ""));
      doc.appendChild(meta);
    }
  }

  // After the consensus is drafted, each voice card carries the member's vote.
  function tagVotes(c) {
    document.querySelectorAll("#councilAnswers .voice-card").forEach(function (card) {
      var nameNode = card.querySelector(".voice-name");
      if (!nameNode) return;
      var old = nameNode.querySelector(".vote-tag");
      if (old) old.remove();
      var name = nameNode.textContent.trim();
      var vote = "concurs";
      if (c.minority && c.minority.voice === name) vote = "dissents in part";
      else if ((c.dissents || []).some(function (d) { return (d.between || []).indexOf(name) !== -1; })) vote = "concurs with caution";
      nameNode.appendChild(el("span", "vote-tag" + (vote === "concurs" ? "" : " vote-caution"), vote));
    });
  }

  // Re-write the saved copies of a report after late data lands (Monte Carlo).
  function updateSavedReport(report) {
    save("freemasonry-circle.council.last", report);
    var hist = load(LS.history, []);
    for (var i = 0; i < hist.length; i++) {
      if (hist[i].when === report.when && hist[i].question === report.question) { hist[i] = report; break; }
    }
    save(LS.history, hist);
  }

  /* ── Admin activity log ────────────────────────────────────── */

  function adminLog(entry) {
    var log = load(LS.adminLog, []);
    if (!entry.t) entry.t = new Date().toISOString();
    log.push(entry);
    if (log.length > 1000) log.splice(0, log.length - 1000);
    if (!save(LS.adminLog, log) && log.length > 100) {
      log.splice(0, log.length - 100);
      save(LS.adminLog, log);
    }
    // Lifetime totals live apart from the capped log, so trims never shrink them.
    var tot = load(LS.adminTotals, { life: 0, council: 0, chat: 0, insight: 0 });
    tot.life = (tot.life || 0) + 1;
    var k = entry.kind === "council" ? "council" : entry.kind === "insight" ? "insight" : "chat";
    tot[k] = (tot[k] || 0) + 1;
    save(LS.adminTotals, tot);
  }
  function adminLogPatch(t, patch) {
    var log = load(LS.adminLog, []);
    for (var i = log.length - 1; i >= 0; i--) {
      if (log[i].t === t) {
        Object.keys(patch).forEach(function (k) { log[i][k] = patch[k]; });
        save(LS.adminLog, log);
        return;
      }
    }
  }

  function renderCouncilHistory() {
    var wrap = $("councilHistoryWrap");
    var list = $("councilHistory");
    var hist = load(LS.history, []);
    wrap.hidden = hist.length === 0;
    list.innerHTML = "";
    hist.slice(0, 5).forEach(function (r, i) {
      var row = el("div", "hist-row");
      var open = el("button", "hist-open");
      open.type = "button";
      open.appendChild(el("span", "hist-q", r.question.length > 90 ? r.question.slice(0, 89) + "…" : r.question));
      var when = "";
      try { when = new Date(r.when).toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch (e) { /* ignore */ }
      open.appendChild(el("span", "hist-sub", (r.answers || []).length + " minds · " + (r.engine === "claude" ? "Claude AI" : "wisdom engine") + (when ? " · " + when : "")));
      open.addEventListener("click", function () { showSavedReport(r); });
      row.appendChild(open);
      var del = el("button", "hist-del", "✕");
      del.type = "button";
      del.setAttribute("aria-label", "Forget this consensus");
      del.addEventListener("click", function () {
        var h = load(LS.history, []);
        h.splice(i, 1);
        save(LS.history, h);
        renderCouncilHistory();
      });
      row.appendChild(del);
      list.appendChild(row);
    });
  }

  function showSavedReport(r) {
    stopMC();
    $("councilSetup").hidden = true;
    $("councilReport").hidden = false;
    $("councilReportQ").textContent = r.question;
    var when = "";
    try { when = new Date(r.when).toLocaleString(); } catch (e) { /* ignore */ }
    $("councilStatus").textContent = "Recalled" + (when ? " from " + when : "") + " · " + (r.engine === "claude" ? "Claude AI" : "wisdom engine");
    var answers = $("councilAnswers");
    answers.innerHTML = "";
    (r.answers || []).forEach(function (a) {
      var t = findMind(a.id);
      var card = el("div", "voice-card");
      if (t) card.setAttribute("data-cat", t.category);
      var med = el("div");
      paintMedallion(med, t || { name: a.name, monogram: (a.name || "?").split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase(), palette: { a: "#155e75", b: "#2dd4bf" } }, "medallion-md");
      card.appendChild(med);
      var body = el("div", "voice-body");
      body.appendChild(el("div", "voice-name", a.name));
      body.appendChild(el("div", "voice-epithet", t ? (t.epithet || "") : ""));
      body.appendChild(el("div", "voice-text", a.text));
      card.appendChild(body);
      answers.appendChild(card);
    });
    if (r.consensus) {
      renderConsensus(r.consensus);
      tagVotes(r.consensus);
      if (!r.consensus.monteCarlo) {
        // A trial interrupted mid-run (or a pre-trial report) completes on recall.
        renderMCLive(r.consensus, r.question + "|" + (r.answers || []).map(function (a) { return a.id; }).join(",") + "|mc", function (m) {
          if (!m) return;
          r.consensus.monteCarlo = m;
          updateSavedReport(r);
        });
      }
      $("councilProvenance").textContent = r.engine === "claude"
        ? "Deliberated and drafted by Claude from the " + (r.answers || []).length + " voices above."
        : "Composed on-device from the assembled minds' own teachings.";
      $("councilConsolidated").hidden = false;
    } else {
      $("councilConsolidated").hidden = true;
    }
    save("freemasonry-circle.council.last", r);
    $("councilCopy").hidden = false;
    $("councilScroll").scrollTop = 0;
  }

  /* Claude council: optional research pass → parallel expert calls → structured synthesis. */

  function apiCall(body) {
    return fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": settings.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          var msg = "API error " + res.status;
          try { var p = JSON.parse(t); if (p.error && p.error.message) msg += ": " + p.error.message; } catch (e) { /* ignore */ }
          throw new Error(msg);
        });
      }
      return res.json();
    });
  }

  function textOf(response) {
    return (response.content || [])
      .filter(function (b) { return b.type === "text"; })
      .map(function (b) { return b.text; })
      .join("");
  }

  function runClaudeCouncil(q, members, cards, report, showConsensus, finishAll) {
    var model = settings.model || "claude-opus-5";
    var doResearch = $("councilResearch").checked;
    var brief = "";

    var setStatus = function (s) { $("councilStatus").textContent = s; };

    var research = function () {
      if (!doResearch) return Promise.resolve();
      setStatus("Researching the question…");
      var messages = [{ role: "user", content: "Research this question thoroughly for a panel of advisors about to deliberate on it. Gather current facts, relevant data, and context. Then produce a neutral research brief (300-500 words) they can rely on:\n\n" + q }];
      // Haiku only supports the basic web-search variant.
      var searchTool = model.indexOf("haiku") !== -1 ? "web_search_20250305" : "web_search_20260209";
      var step = function (msgs, depth) {
        return apiCall({
          model: model, max_tokens: 8000, messages: msgs,
          tools: [{ type: searchTool, name: "web_search", max_uses: 4 }],
        }).then(function (r) {
          if (r.stop_reason === "pause_turn" && depth < 3) {
            return step(msgs.concat([{ role: "assistant", content: r.content }]), depth + 1);
          }
          brief = textOf(r);
        });
      };
      return step(messages, 0).catch(function (e) {
        brief = "";
        toast("Research pass failed (" + e.message + ") — proceeding without it.");
      });
    };

    var askExpert = function (t) {
      var sys = personaSystemPrompt(t) + "\n\nCouncil mode: you are one voice on a council convened for a single question. Imagine you are alive today, with your full life, works, and principles behind you and a clear view of the modern world. Think deeply about how *you specifically* would weigh this question — reason from your first principles and your lived experience, not from generic advice. Give your considered counsel in two to four short paragraphs: your reading of the situation, the principle you would apply, and what you would do in the asker's place. Speak only for yourself; do not address the other council members.";
      var content = brief
        ? "The question before the council:\n\n" + q + "\n\nA neutral research brief prepared for the council:\n\n" + brief
        : "The question before the council:\n\n" + q;
      return apiCall({
        model: model, max_tokens: 6000, system: sys,
        messages: [{ role: "user", content: content }],
      }).then(function (r) {
        if (r.stop_reason === "refusal") throw new Error("declined to answer this question");
        var text = textOf(r);
        if (!text) throw new Error("empty reply");
        return text;
      });
    };

    // Small promise pool: 3 experts deliberate at a time.
    var queue = members.slice();
    var done = 0;
    var runNext = function () {
      var t = queue.shift();
      if (!t) return Promise.resolve();
      return askExpert(t).then(function (text) {
        cards[t.id].classList.remove("pending");
        cards[t.id].textContent = text;
        report.answers.push({ id: t.id, name: t.name, text: text });
      }).catch(function (e) {
        cards[t.id].classList.remove("pending");
        cards[t.id].classList.add("errored");
        cards[t.id].textContent = t.name + " could not be reached: " + e.message;
      }).then(function () {
        done++;
        setStatus("Hearing the council… " + done + " / " + members.length);
        return runNext();
      });
    };

    var synthesize = function () {
      if (!report.answers.length) {
        // Throw so the terminal catch handles it and finishAll never declares success.
        throw new Error("no answers could be gathered — check your API key or try the offline engine");
      }
      setStatus("The council withdraws to draft its consensus…");
      var strArr = { type: "array", items: { type: "string" } };
      var schema = {
        type: "object", additionalProperties: false,
        required: ["preamble", "themes", "debate", "convergence", "dissents", "risks", "verdict", "directives", "minority", "conditions", "confidence"],
        properties: {
          preamble: { type: "string", description: "The question as the council understood it, restated with its real stakes surfaced. 2-4 sentences." },
          themes: { type: "array", items: { type: "string" }, description: "1-3 single-word themes the question turns on (e.g. fear, ambition, leadership)." },
          debate: {
            type: "array", description: "6-10 short exchanges reconstructing the debate between the members — strictly from positions actually expressed in their answers, each line 1-2 sentences in that speaker's voice, arranged as genuine call and response (challenge, rebuttal, concession, sharpening).",
            items: {
              type: "object", additionalProperties: false, required: ["speaker", "line"],
              properties: { speaker: { type: "string", description: "A member's exact name." }, line: { type: "string" } },
            },
          },
          convergence: {
            type: "array", description: "3-5 points where the voices genuinely align. Each point is a substantive claim (2-3 sentences), not a platitude, and names its holders.",
            items: {
              type: "object", additionalProperties: false, required: ["point", "holders"],
              properties: { point: { type: "string" }, holders: strArr },
            },
          },
          dissents: {
            type: "array", description: "0-3 REAL tensions between named members — only where their answers actually pull in different directions. Quote or closely paraphrase each side.",
            items: {
              type: "object", additionalProperties: false, required: ["between", "tension", "resolution"],
              properties: {
                between: { type: "array", items: { type: "string" }, description: "Exactly two member names." },
                tension: { type: "string", description: "Both sides stated fairly, 2-4 sentences." },
                resolution: { type: "string", description: "How the council holds both truths — a synthesis, a sequencing, or a boundary." },
              },
            },
          },
          risks: {
            type: "array", description: "2-4 failure modes the council names for the asker's situation, each credited to the voice that raised or best embodies it.",
            items: {
              type: "object", additionalProperties: false, required: ["risk", "raisedBy", "counsel"],
              properties: { risk: { type: "string" }, raisedBy: { type: "string" }, counsel: { type: "string", description: "One imperative sentence." } },
            },
          },
          verdict: { type: "string", description: "The consensus of the Supreme Council: a deep, unified judgment of 250-400 words that weighs every voice, acknowledges the dissents, and lands on a clear conclusion. Written as the council speaking with one measured voice. Separate paragraphs with blank lines." },
          directives: {
            type: "array", description: "5-7 directives in priority order — the council's orders to the asker.",
            items: {
              type: "object", additionalProperties: false, required: ["imperative", "reasoning", "drawnFrom", "horizon"],
              properties: {
                imperative: { type: "string", description: "Short bold command, e.g. 'Decide by irreversibility.'" },
                reasoning: { type: "string", description: "2-3 sentences: observation, consequence, application to the asker." },
                drawnFrom: { type: "string", description: "The member voice(s) this draws on." },
                horizon: { type: "string", enum: ["at once", "this season", "for life"] },
              },
            },
          },
          minority: {
            type: "object", additionalProperties: false, required: ["voice", "position"],
            description: "If one member fundamentally departs from the verdict, record it. Otherwise set voice to an empty string.",
            properties: { voice: { type: "string" }, position: { type: "string" } },
          },
          conditions: { type: "array", items: { type: "string" }, description: "2-3 conditions under which the council would reverse or revisit this verdict." },
          confidence: {
            type: "object", additionalProperties: false, required: ["level", "note"],
            properties: { level: { type: "string", enum: ["unanimous", "strong consensus", "a divided bench"] }, note: { type: "string" } },
          },
        },
      };
      var transcript = report.answers.map(function (a) { return "── " + a.name + " ──\n" + a.text; }).join("\n\n");
      return apiCall({
        model: model, max_tokens: 9000,
        system: "You are the Recorder of the Supreme Council — a council of history's great minds convened on one question. From their individual counsel you draft the council's formal consensus, including a faithful reconstruction of the debate between them. Rules: work only from positions the members actually expressed in their answers (you may sharpen, never invent); name members exactly as given; surface genuine convergence and genuine tension rather than forcing false harmony; the debate must be real call-and-response between the positions on record, not invented pleasantries; make the verdict specific to the asker's situation, not generic wisdom; keep every member's voice recognizable in what you credit to them. The result should read like the finding of a real deliberative body: grave, precise, useful.",
        messages: [{ role: "user", content: "The question before the Supreme Council:\n\n" + q + (brief ? "\n\nResearch brief the council received:\n\n" + brief : "") + "\n\nThe members' individual counsel:\n\n" + transcript + "\n\nDraft the Consensus of the Supreme Council." }],
        output_config: { format: { type: "json_schema", schema: schema } },
      }).then(function (r) {
        var parsed;
        try { parsed = JSON.parse(textOf(r)); } catch (e) { throw new Error("could not parse the consensus draft"); }
        // Only a genuinely seated voice can file the minority opinion — an empty
        // string or a sentinel like "None" both mean there is none.
        if (parsed.minority && !members.some(function (t) { return t.name === parsed.minority.voice; })) parsed.minority = null;
        showConsensus(parsed);
      }).catch(function (e) {
        if (/no answers could be gathered/.test(String(e.message))) throw e;
        // Fall back to the on-device synthesis rather than losing the session.
        showConsensus(buildOfflineConsensus(q, members));
        toast("AI consensus failed (" + e.message + ") — showing the on-device consensus instead.");
      });
    };

    research()
      .then(function () {
        setStatus("Hearing the council… 0 / " + members.length);
        return Promise.all([runNext(), runNext(), runNext()]);
      })
      .then(synthesize)
      .then(finishAll)
      .catch(function (e) {
        setStatus("Council failed: " + e.message);
        councilBusy = false;
      });
  }

  function copyCouncilReport() {
    var r = load("freemasonry-circle.council.last", null);
    if (!r) return;
    var md = "# Consensus of the Supreme Council — RAWFOTRA v6.7\n\n**Question:** " + r.question + "\n\n" +
      (r.answers || []).map(function (a) { return "## " + a.name + "\n\n" + a.text; }).join("\n\n");
    var c = r.consensus;
    if (c) {
      md += "\n\n---\n\n# The Consensus\n\n" + (c.preamble || "");
      if (c.debate && c.debate.length) {
        md += "\n\n## The debate\n\n" + c.debate.map(function (x) {
          return "**" + x.speaker + ":** " + x.line;
        }).join("\n\n");
      }
      if (c.convergence && c.convergence.length) {
        md += "\n\n## Where the council converges\n\n" + c.convergence.map(function (cv) {
          return "- " + cv.point + (cv.holders && cv.holders.length ? " _(held by " + listNames(cv.holders) + ")_" : "");
        }).join("\n");
      }
      if (c.dissents && c.dissents.length) {
        md += "\n\n## Where the council divides\n\n" + c.dissents.map(function (d) {
          return "**" + (d.between || []).join(" vs ") + "** — " + d.tension + (d.resolution ? "\n\n_Resolution:_ " + d.resolution : "");
        }).join("\n\n");
      }
      if (c.risks && c.risks.length) {
        md += "\n\n## Risks the council names\n\n" + c.risks.map(function (k) {
          return "- " + k.risk + " — **" + k.counsel + "** _(" + k.raisedBy + ")_";
        }).join("\n");
      }
      md += "\n\n## The verdict of the Supreme Council\n\n" + (c.verdict || "");
      if (c.directives && c.directives.length) {
        md += "\n\n## Directives\n\n" + c.directives.map(function (d, i) {
          return (i + 1) + ". **" + d.imperative + "**" + (d.horizon ? " _[" + d.horizon + "]_" : "") + " " + d.reasoning + (d.drawnFrom ? " _(drawn from " + d.drawnFrom + ")_" : "");
        }).join("\n");
      }
      if (c.minority && c.minority.voice) md += "\n\n## Minority opinion\n\n" + c.minority.position;
      if (c.conditions && c.conditions.length) md += "\n\n## Conditions to reconvene\n\n" + c.conditions.map(function (x) { return "- " + x; }).join("\n");
      if (c.confidence && c.confidence.level) md += "\n\n**Confidence:** " + c.confidence.level + " — " + (c.confidence.note || "");
      if (c.monteCarlo && c.monteCarlo.courses) {
        md += "\n\n## The trial of ten thousand futures\n\n" + c.monteCarlo.courses.map(function (co) {
          return "- " + co.name + ": **" + (co.p * 100).toFixed(1) + "%**" + (co.detail ? " — " + co.detail : "");
        }).join("\n") + "\n\n" + mcVerdictLine(c.monteCarlo) + "\n\n_" + MC_DISCLAIMER + "_";
      }
    } else if (r.summary) {
      // Report saved by an earlier version of the app.
      md += "\n\n## Consolidated counsel\n\n" + r.summary + "\n\n### Recommendations\n\n" +
        (r.recommendations || []).map(function (rec, i) {
          return (i + 1) + ". **" + rec.imperative + "** " + rec.reasoning + (rec.drawnFrom ? " _(drawn from " + rec.drawnFrom + ")_" : "");
        }).join("\n");
    }
    (navigator.clipboard ? navigator.clipboard.writeText(md) : Promise.reject())
      .then(function () { toast("Consensus copied as Markdown."); })
      .catch(function () { toast("Could not copy — clipboard unavailable."); });
  }

  /* ── Codex & doctrine ──────────────────────────────────────── */

  function renderCodex() {
    var codex = base.codex || [];
    $("codexBtn").hidden = codex.length === 0;
    if (!codex.length) return;
    var wrap = $("codexList");
    wrap.innerHTML = "";
    codex.forEach(function (c) {
      var item = el("div", "codex-item");
      item.appendChild(el("div", "codex-name", c.name));
      item.appendChild(el("p", "codex-reason", c.reasoning));
      item.appendChild(el("div", "codex-imp", c.imperative));
      if (c.exemplars && c.exemplars.length) {
        var ex = el("div", "codex-ex");
        c.exemplars.forEach(function (id) {
          var t = findMind(id);
          if (!t) return;
          var b = el("button", null, t.name);
          b.addEventListener("click", function () {
            closeOverlays();
            openProfile(id);
          });
          ex.appendChild(b);
        });
        item.appendChild(ex);
      }
      wrap.appendChild(item);
    });
  }

  /* ── Admin gate: settings require the admin password ───────── */

  // SHA-256 digest of the admin password (the password itself never ships in code).
  var ADMIN_SHA256 = "e7cf3ef4f17c3999a94f2c6f612e8a888e5b1026878e4e19398b23bd38ec221a";
  var ADMIN_FALLBACK = 1281629883; // hashCode digest, used only where Web Crypto is unavailable

  function adminUnlocked() {
    try { return sessionStorage.getItem("freemasonry-circle.adminOk") === "1"; } catch (e) { return false; }
  }
  function requireAdmin(next) {
    if (adminUnlocked()) { next(); return; }
    requireAdmin._next = next;
    closeOverlays(); // an open modal (e.g. Settings) would otherwise sit above the prompt
    $("adminError").hidden = true;
    $("adminPassword").value = "";
    openOverlay("adminOverlay");
    $("adminPassword").focus();
  }
  function checkAdminPassword(pw) {
    if (window.crypto && crypto.subtle) {
      return crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw)).then(function (buf) {
        var hex = Array.prototype.map.call(new Uint8Array(buf), function (b) {
          return b.toString(16).padStart(2, "0");
        }).join("");
        return hex === ADMIN_SHA256;
      });
    }
    return Promise.resolve(hashCode(pw) === ADMIN_FALLBACK);
  }
  function submitAdmin(evt) {
    evt.preventDefault();
    checkAdminPassword($("adminPassword").value).then(function (ok) {
      if (ok) {
        try { sessionStorage.setItem("freemasonry-circle.adminOk", "1"); } catch (e) { /* ignore */ }
        closeOverlays();
        var next = requireAdmin._next;
        requireAdmin._next = null;
        if (next) next();
      } else {
        $("adminError").hidden = false;
        $("adminPassword").value = "";
        $("adminPassword").focus();
      }
    });
  }

  /* ── Settings ──────────────────────────────────────────────── */

  function openSettings() {
    var radios = document.querySelectorAll("input[name=engine]");
    radios.forEach(function (r) { r.checked = r.value === settings.engine; });
    $("apiKeyInput").value = settings.apiKey || "";
    $("modelSelect").value = settings.model || "claude-opus-5";
    $("memoryToggle").checked = memoryOn();
    $("insightToggle").checked = !!settings.insightOn;
    $("memoryStats").textContent = memoryStatsText();
    syncApiFields();
    openOverlay("settingsOverlay");
  }
  function syncApiFields() {
    var engine = document.querySelector("input[name=engine]:checked");
    var off = !engine || engine.value !== "claude";
    $("apiFields").classList.toggle("disabled", off);
    $("apiKeyInput").disabled = off;
    $("modelSelect").disabled = off;
  }
  function saveSettings() {
    var engine = document.querySelector("input[name=engine]:checked");
    settings.engine = engine ? engine.value : "wisdom";
    settings.apiKey = $("apiKeyInput").value.trim();
    settings.model = $("modelSelect").value;
    settings.memoryOn = $("memoryToggle").checked;
    settings.insightOn = $("insightToggle").checked;
    if (settings.engine === "claude" && !settings.apiKey) {
      toast("Add an API key to use Claude — falling back to the wisdom engine.");
      settings.engine = "wisdom";
    }
    if (settings.insightOn && settings.engine !== "claude") {
      toast("Insight+ needs the Claude engine — it will activate once a key is set.");
    }
    save(LS.settings, settings);
    renderEnginePill();
    closeOverlays();
    toast("Settings saved.");
  }

  /* ── Admin dashboard ───────────────────────────────────────── */

  function downloadTextFile(text, fname, mime, doneMsg) {
    var standalone = navigator.standalone === true ||
      (window.matchMedia && matchMedia("(display-mode: standalone)").matches);
    var isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (standalone && isIOS && navigator.share && typeof File === "function") {
      try {
        var file = new File([text], fname, { type: mime });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file] })
            .then(function () { toast(doneMsg); })
            .catch(function () { /* user closed the share sheet */ });
          return;
        }
      } catch (e) { /* fall through to the anchor download */ }
    }
    var blob = new Blob([text], { type: mime });
    var href = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = href;
    a.download = fname;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(href); }, 60000);
    toast(doneMsg);
  }

  function dashBuckets(log) {
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    // Monday start via calendar arithmetic, so a DST change mid-week can't shift the boundary.
    var week = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)).getTime();
    var month = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    var mk = function () { return { total: 0, council: 0, chat: 0, insight: 0 }; };
    var b = { today: mk(), week: mk(), month: mk(), life: mk() };
    log.forEach(function (e) {
      var t = Date.parse(e.t || "");
      if (isNaN(t)) return;
      var keys = ["life"];
      if (t >= month) keys.push("month");
      if (t >= week) keys.push("week");
      if (t >= today) keys.push("today");
      keys.forEach(function (k) {
        b[k].total++;
        if (e.kind === "council") b[k].council++;
        else if (e.kind === "insight") b[k].insight++;
        else b[k].chat++;
      });
    });
    return b;
  }

  function topCounts(pairs, n) {
    // Null-prototype map: a mind named "constructor" or "__proto__" must count cleanly.
    var counts = Object.create(null);
    pairs.forEach(function (name) { if (name) counts[name] = (counts[name] || 0) + 1; });
    return Object.keys(counts)
      .sort(function (a, b2) { return counts[b2] - counts[a]; })
      .slice(0, n)
      .map(function (k) { return { name: k, count: counts[k] }; });
  }

  function renderDash() {
    var log = load(LS.adminLog, []);
    var b = dashBuckets(log);

    // Lifetime comes from the standalone totals, which outlive log trimming.
    var tot = load(LS.adminTotals, { life: 0, council: 0, chat: 0, insight: 0 });
    var life = {
      total: Math.max(tot.life || 0, b.life.total),
      council: Math.max(tot.council || 0, b.life.council),
      chat: Math.max(tot.chat || 0, b.life.chat),
      insight: Math.max(tot.insight || 0, b.life.insight),
    };
    var stats = $("dashStats");
    stats.innerHTML = "";
    [["Today", b.today], ["Week to date", b.week], ["Month to date", b.month], ["Lifetime", life]].forEach(function (row) {
      var card = el("div", "dash-card");
      card.appendChild(el("div", "dash-num", String(row[1].total)));
      card.appendChild(el("div", "dash-label", row[0]));
      card.appendChild(el("div", "dash-sub", row[1].council + " council · " + row[1].chat + " chat · " + row[1].insight + " insight"));
      stats.appendChild(card);
    });

    var councils = log.filter(function (e) { return e.kind === "council"; });

    var minds = [];
    log.forEach(function (e) {
      if (e.kind === "council") (e.members || []).forEach(function (m) { minds.push(m); });
      else if (e.mind) minds.push(e.mind);
    });
    var mindsBox = $("dashMinds");
    mindsBox.innerHTML = "";
    var tops = topCounts(minds, 5);
    if (!tops.length) mindsBox.appendChild(el("p", "fine", "No activity recorded yet on this device."));
    tops.forEach(function (x) {
      var row = el("div", "dash-row");
      row.appendChild(el("span", null, x.name));
      row.appendChild(el("b", null, String(x.count)));
      mindsBox.appendChild(row);
    });

    var themesBox = $("dashThemes");
    themesBox.innerHTML = "";
    var themeList = [];
    councils.forEach(function (e) { (e.themes || []).forEach(function (t) { themeList.push(t); }); });
    topCounts(themeList, 5).forEach(function (x) {
      var row = el("div", "dash-row");
      row.appendChild(el("span", null, titleCase(x.name)));
      row.appendChild(el("b", null, String(x.count)));
      themesBox.appendChild(row);
    });

    var insights = $("dashInsights");
    insights.innerHTML = "";
    var addInsight = function (label, value) {
      var row = el("div", "dash-row");
      row.appendChild(el("span", null, label));
      row.appendChild(el("b", null, value));
      insights.appendChild(row);
    };
    var engines = { wisdom: 0, claude: 0 };
    councils.forEach(function (e) { engines[e.engine === "claude" ? "claude" : "wisdom"]++; });
    addInsight("Council sessions", String(councils.length));
    addInsight("Engine split", engines.wisdom + " wisdom · " + engines.claude + " Claude");
    if (councils.length) {
      var seatSum = 0;
      councils.forEach(function (e) { seatSum += (e.members || []).length; });
      addInsight("Average bench size", (seatSum / councils.length).toFixed(1) + " minds");
      var withP = councils.filter(function (e) { return typeof e.p === "number"; });
      if (withP.length) {
        var pSum = 0;
        withP.forEach(function (e) { pSum += e.p; });
        addInsight("Avg. consensus optimality", ((pSum / withP.length) * 100).toFixed(1) + "%");
      }
      var confs = { unanimous: 0, "strong consensus": 0, "a divided bench": 0 };
      councils.forEach(function (e) { if (confs[e.conf] !== undefined) confs[e.conf]++; });
      addInsight("Unanimity", confs.unanimous + " unanimous · " + confs["strong consensus"] + " strong · " + confs["a divided bench"] + " divided");
    }
    var briefs = log.filter(function (e) { return e.kind === "insight"; });
    addInsight("Signal briefs opened", String(briefs.length));
    var customs = customExperts.length;
    addInsight("Custom experts on this device", String(customs));

    var recent = $("dashRecent");
    recent.innerHTML = "";
    log.slice(-8).reverse().forEach(function (e) {
      var row = el("div", "dash-recent-row");
      var when = "";
      try { when = new Date(e.t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); } catch (err) { /* ignore */ }
      row.appendChild(el("span", "dash-when", when));
      row.appendChild(el("span", "dash-kind" + (e.kind === "council" ? " is-council" : ""),
        e.kind === "council" ? "council · " + (e.members || []).length :
        e.kind === "insight" ? "insight · " + (e.channel || "signal") :
        "chat · " + (e.mind || "")));
      row.appendChild(el("span", "dash-q", e.q || ""));
      recent.appendChild(row);
    });
    if (!log.length) recent.appendChild(el("p", "fine", "The log fills as questions are asked."));
  }

  function openDash() {
    renderDash();
    closeOverlays();
    openOverlay("dashOverlay");
  }

  /* ── Custom experts ────────────────────────────────────────── */

  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    if (isNaN(n)) return hex;
    var r = Math.min(255, Math.max(0, (n >> 16) + amt));
    var g = Math.min(255, Math.max(0, ((n >> 8) & 255) + amt));
    var b = Math.min(255, Math.max(0, (n & 255) + amt));
    return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
  }

  function populateExpertCategories(selected) {
    var sel = $("expertCategory");
    sel.innerHTML = "";
    categories().forEach(function (c) {
      var o = el("option", null, c.label);
      o.value = c.key;
      sel.appendChild(o);
    });
    var o = el("option", null, "+ New category…");
    o.value = "__new";
    sel.appendChild(o);
    var exists = Array.prototype.some.call(sel.options, function (opt) { return opt.value === selected; });
    if (selected && exists) sel.value = selected;
    else sel.selectedIndex = 0;
  }

  function buildWisdomFields(existing) {
    var wrap = $("wisdomFields");
    wrap.innerHTML = "";
    TOPICS.forEach(function (topic) {
      var label = el("label", "field");
      label.appendChild(document.createTextNode(titleCase(topic.key)));
      var ta = document.createElement("textarea");
      ta.rows = 2;
      ta.name = "wisdom." + topic.key;
      ta.placeholder = "In their voice, on " + topic.key + "…";
      if (existing && existing[topic.key]) ta.value = existing[topic.key];
      label.appendChild(ta);
      wrap.appendChild(label);
    });
  }

  function openExpertForm(expert) {
    editingId = expert ? expert.id : null;
    $("expertTitle").textContent = expert ? "Edit " + expert.name : "Add a modern expert";
    var f = $("expertForm");
    f.reset();
    populateExpertCategories(expert ? expert.category : "modern");
    buildWisdomFields(expert ? expert.wisdom : null);
    if (expert) {
      f.name.value = expert.name;
      f.epithet.value = expert.epithet;
      f.years.value = expert.years || "";
      f.place.value = expert.place || "";
      f.tags.value = (expert.tags || []).join(", ");
      // Prefer the originally picked color so re-saving doesn't darken it each time.
      f.color.value = expert.color || (expert.palette && expert.palette.a) || "#18b2a6";
      f.bio.value = expert.bio || "";
      f.knownFor.value = (expert.knownFor || []).join("\n");
      f.principles.value = (expert.principles || []).map(function (p) { return p.title + ": " + p.text; }).join("\n");
      f.voice.value = expert.voice || "";
      f.greeting.value = expert.greeting || "";
      f.starters.value = (expert.starters || []).join("\n");
    }
    expertDirty = false;
    openOverlay("expertOverlay");
  }

  function slugify(name) {
    var slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "expert";
    var unique = slug, i = 2;
    while (findMind(unique) && unique !== editingId) { unique = slug + "-" + i; i++; }
    return unique;
  }

  function saveExpert(evt) {
    evt.preventDefault();
    var f = $("expertForm");
    var category = f.category.value;
    var categoryLabelText = null;
    if (category === "__new") {
      var typed = prompt("Name the new category:");
      if (!typed) return;
      categoryLabelText = typed.trim();
      category = categoryLabelText.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      if (!category) return;
    }
    var lines = function (v) {
      return v.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    };
    var principles = lines(f.principles.value).map(function (line) {
      var idx = line.indexOf(":");
      return idx > 0
        ? { title: line.slice(0, idx).trim(), text: line.slice(idx + 1).trim() }
        : { title: "Teaching", text: line };
    });
    var wisdom = {};
    TOPICS.forEach(function (topic) {
      var ta = f.querySelector('[name="wisdom.' + topic.key + '"]');
      if (ta && ta.value.trim()) wisdom[topic.key] = ta.value.trim();
    });
    var name = f.name.value.trim();
    var color = f.color.value || "#18b2a6";
    var prev = editingId ? findMind(editingId) : null;
    var expert = {
      id: editingId || slugify(name),
      name: name,
      epithet: f.epithet.value.trim(),
      years: f.years.value.trim(),
      place: f.place.value.trim(),
      category: category,
      categoryLabel: categoryLabelText ||
        (prev && prev.category === category ? prev.categoryLabel : undefined),
      color: color,
      tags: f.tags.value.split(",").map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean),
      monogram: name.split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase(),
      palette: { a: shade(color, -30), b: shade(color, 25) },
      bio: f.bio.value.trim(),
      knownFor: lines(f.knownFor.value),
      principles: principles,
      voice: f.voice.value.trim(),
      greeting: f.greeting.value.trim() || "Welcome. I hear you seek counsel — let us begin. What is on your mind?",
      starters: lines(f.starters.value),
      wisdom: wisdom,
    };

    if (editingId) {
      customExperts = customExperts.map(function (e) { return e.id === editingId ? expert : e; });
    } else {
      customExperts.push(expert);
    }
    var stored = save(LS.experts, customExperts);
    editingId = null;
    expertDirty = false;
    closeOverlays();
    renderChips();
    renderGrid();
    toast(stored
      ? expert.name + " has joined the pantheon."
      : "Could not save — browser storage is full or blocked; this expert will be lost on reload.");
  }

  function deleteExpert(id) {
    var t = findMind(id);
    if (!t || !isCustom(id)) return;
    if (!confirm("Remove " + t.name + " and their conversation history?")) return;
    customExperts = customExperts.filter(function (e) { return e.id !== id; });
    var ci = councilSel.indexOf(id);
    if (ci !== -1) { councilSel.splice(ci, 1); saveBench(); }
    save(LS.experts, customExperts);
    try { localStorage.removeItem(LS.chat(id)); } catch (e) { /* ignore */ }
    closeOverlays();
    renderChips();
    renderGrid();
    toast(t.name + " removed.");
  }

  function exportExperts() {
    if (!customExperts.length) { toast("No custom experts to export yet."); return; }
    var json = JSON.stringify(customExperts, null, 2);
    var fname = "rawfotra-custom-experts.json";
    var doneMsg = "Exported " + customExperts.length + " expert(s) — import the file on any device to restore them.";

    // iOS home-screen apps can't do anchor downloads (the tap either dies or
    // replaces the chromeless view), so use the share sheet there instead.
    var standalone = navigator.standalone === true ||
      (window.matchMedia && matchMedia("(display-mode: standalone)").matches);
    var isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (standalone && isIOS && navigator.share && typeof File === "function") {
      try {
        var file = new File([json], fname, { type: "application/json" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file] })
            .then(function () { toast(doneMsg); })
            .catch(function () { /* user closed the share sheet */ });
          return;
        }
      } catch (e) { /* fall through to the anchor download */ }
    }

    var blob = new Blob([json], { type: "application/json" });
    var href = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = href;
    a.download = fname;
    a.click();
    // Revoking synchronously races the async download on WebKit; give it time.
    setTimeout(function () { URL.revokeObjectURL(href); }, 60000);
    toast(doneMsg);
  }

  // Imported files are untrusted: coerce every field into the shape the app
  // renders, so a hand-edited or malicious JSON can't crash search/profiles
  // or smuggle CSS values.
  function sanitizeExpert(e) {
    var str = function (v, d) { return typeof v === "string" ? v : (d || ""); };
    var strArr = function (v) {
      if (Array.isArray(v)) return v.filter(function (s) { return typeof s === "string"; });
      if (typeof v === "string") return v.split(/[,\n]/).map(function (s) { return s.trim(); }).filter(Boolean);
      return [];
    };
    var hex = function (v, d) { return (typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v)) ? v : d; };
    var wisdom = {};
    if (e.wisdom && typeof e.wisdom === "object" && !Array.isArray(e.wisdom)) {
      Object.keys(e.wisdom).forEach(function (k) { if (typeof e.wisdom[k] === "string") wisdom[k] = e.wisdom[k]; });
    }
    var pr = (Array.isArray(e.principles) ? e.principles : []).filter(function (p) {
      return p && (typeof p.title === "string" || typeof p.text === "string");
    }).map(function (p) { return { title: str(p.title) || "Teaching", text: str(p.text) }; });
    return {
      id: String(e.id), name: String(e.name),
      epithet: str(e.epithet), years: str(e.years), place: str(e.place),
      category: str(e.category, "custom") || "custom", categoryLabel: str(e.categoryLabel) || undefined,
      tags: strArr(e.tags), knownFor: strArr(e.knownFor), starters: strArr(e.starters),
      monogram: str(e.monogram).slice(0, 2),
      palette: { a: hex(e.palette && e.palette.a, "#155e75"), b: hex(e.palette && e.palette.b, "#2dd4bf") },
      color: hex(e.color, undefined),
      bio: str(e.bio), voice: str(e.voice), greeting: str(e.greeting),
      principles: pr, wisdom: wisdom,
    };
  }

  function importExperts(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var arr = JSON.parse(reader.result);
        if (!Array.isArray(arr)) throw new Error("not an array");
        var added = 0;
        arr.forEach(function (e) {
          if (!e || typeof e !== "object" || typeof e.name !== "string" || !e.name || e.id == null) return;
          e = sanitizeExpert(e);
          e.id = slugify(e.id); // also resolves collisions with existing ids
          customExperts.push(e);
          added++;
        });
        var stored = save(LS.experts, customExperts);
        renderChips();
        renderGrid();
        toast(stored
          ? "Imported " + added + " expert(s)."
          : "Imported " + added + " but could not save — browser storage is full or blocked.");
      } catch (err) {
        toast("Import failed: not a valid experts JSON file.");
      }
    };
    reader.readAsText(file);
  }

  /* ── LIVE: GLOBAL INSIGHT ──────────────────────────────────────
     A live signal room: world events streamed from open public data
     (GDELT news index, USGS seismology, CoinGecko, Frankfurter FX),
     classified on this device — channel, region, sentiment, impact,
     sectors, assets — with a structured intelligence brief, related
     coverage across outlets, and a handoff to the Supreme Council.
     No accounts, no keys: every source is public and fetched directly
     by the reader's browser. */

  var GI = {
    open: false,
    gen: 0,            // bumped per fetch cycle; stale responses drop
    timer: null,       // countdown interval
    left: 0,           // seconds to next refresh
    channel: "all",
    region: "all",
    search: "",
    articles: [],
    brief: null,       // article currently briefed
  };
  var GI_REFRESH = 90;

  var GI_CHANNELS = [
    { key: "all", label: "All signals", acc: "gold", q: '("breaking news" OR crisis OR "central bank" OR election OR ceasefire OR markets OR earthquake)' },
    { key: "geopolitics", label: "Geopolitics", acc: "leadership", q: '(sanctions OR treaty OR summit OR nato OR ceasefire OR diplomacy OR "foreign minister" OR "security council")' },
    { key: "conflict", label: "Conflict", acc: "strategy", q: '(offensive OR airstrike OR missile OR "drone attack" OR troops OR frontline OR insurgent)' },
    { key: "finance", label: "Finance", acc: "modern", q: '("central bank" OR inflation OR "interest rate" OR "bond yields" OR "stock market" OR earnings OR recession)' },
    { key: "politics", label: "Politics", acc: "literature", q: '(election OR parliament OR congress OR legislation OR coalition OR referendum OR impeachment)' },
    { key: "business", label: "Business", acc: "art", q: '(merger OR acquisition OR layoffs OR ipo OR bankruptcy OR antitrust OR "supply chain")' },
    { key: "technology", label: "Technology", acc: "science", q: '("artificial intelligence" OR semiconductor OR cyberattack OR "data breach" OR startup OR spacecraft)' },
    { key: "crypto", label: "Crypto", acc: "spirit", q: '(bitcoin OR ethereum OR cryptocurrency OR stablecoin OR "crypto exchange")' },
    { key: "commodities", label: "Commodities", acc: "innovation", q: '(opec OR "crude oil" OR "natural gas" OR wheat OR copper OR lithium OR "grain exports")' },
    { key: "disasters", label: "Disasters", acc: "philosophy", q: '(earthquake OR hurricane OR typhoon OR wildfire OR flood OR eruption OR evacuation)' },
  ];
  function giChannel(key) {
    return GI_CHANNELS.filter(function (c) { return c.key === key; })[0] || GI_CHANNELS[0];
  }

  var GI_REGIONS = {
    "United States": "Americas", "Canada": "Americas", "Mexico": "Americas", "Brazil": "Americas", "Argentina": "Americas", "Colombia": "Americas", "Chile": "Americas", "Peru": "Americas", "Venezuela": "Americas", "Cuba": "Americas",
    "United Kingdom": "Europe", "Germany": "Europe", "France": "Europe", "Italy": "Europe", "Spain": "Europe", "Netherlands": "Europe", "Belgium": "Europe", "Poland": "Europe", "Ukraine": "Europe", "Russia": "Europe", "Sweden": "Europe", "Norway": "Europe", "Finland": "Europe", "Denmark": "Europe", "Switzerland": "Europe", "Austria": "Europe", "Greece": "Europe", "Portugal": "Europe", "Ireland": "Europe", "Czechia": "Europe", "Czech Republic": "Europe", "Hungary": "Europe", "Romania": "Europe", "Serbia": "Europe", "Turkey": "Europe",
    "Israel": "Middle East", "Iran": "Middle East", "Iraq": "Middle East", "Saudi Arabia": "Middle East", "United Arab Emirates": "Middle East", "Qatar": "Middle East", "Kuwait": "Middle East", "Jordan": "Middle East", "Lebanon": "Middle East", "Syria": "Middle East", "Yemen": "Middle East", "Egypt": "Middle East",
    "China": "Asia", "Japan": "Asia", "India": "Asia", "South Korea": "Asia", "North Korea": "Asia", "Taiwan": "Asia", "Indonesia": "Asia", "Pakistan": "Asia", "Bangladesh": "Asia", "Vietnam": "Asia", "Thailand": "Asia", "Philippines": "Asia", "Malaysia": "Asia", "Singapore": "Asia", "Hong Kong": "Asia", "Afghanistan": "Asia", "Kazakhstan": "Asia",
    "Nigeria": "Africa", "South Africa": "Africa", "Kenya": "Africa", "Ethiopia": "Africa", "Ghana": "Africa", "Morocco": "Africa", "Algeria": "Africa", "Tunisia": "Africa", "Libya": "Africa", "Sudan": "Africa", "Congo": "Africa", "Tanzania": "Africa",
    "Australia": "Oceania", "New Zealand": "Oceania",
  };
  function giRegionOf(country) { return GI_REGIONS[country] || (country ? "Global" : "Global"); }

  var GI_NEG = ["kill", "dead", "death", "war", "attack", "strike", "crash", "collapse", "crisis", "sanction", "invasion", "missile", "bomb", "fraud", "recession", "default", "outbreak", "hostage", "coup", "escalat", "casualt", "wildfire", "earthquake", "flood", "evacuat", "layoff", "bankrupt", "plunge", "slump", "riot", "shooting", "explosion", "breach", "threat", "emergency", "warns", "warning", "shortage", "stampede"];
  var GI_POS = ["deal", "peace", "agreement", "breakthrough", "growth", "recovery", "rally", "surge", "record high", "ceasefire", "treaty", "rescue", "cure", "wins", "approval", "expansion", "milestone", "restored"];
  var GI_IMPACT = { "nuclear": 3, "world war": 3, "invasion": 3, "default": 2, "pandemic": 3, "assassin": 3, "coup": 2, "emergency": 2, "historic": 2, "unprecedented": 2, "global": 1, "billions": 1, "trillion": 2, "collapse": 2, "central bank": 1, "opec": 1, "nato": 1, "white house": 1, "kremlin": 1, "beijing": 1, "ceasefire": 1, "sanctions": 1, "state of emergency": 2 };
  var GI_SECTORS = { energy: ["oil", "gas", "opec", "pipeline", "refinery", "lng"], defense: ["missile", "weapons", "military", "defense", "arms"], chips: ["semiconductor", "chip", "foundry", "tsmc"], banks: ["bank", "lender", "credit", "bond"], agriculture: ["wheat", "grain", "corn", "harvest", "fertilizer"], shipping: ["port", "shipping", "canal", "freight", "tanker"], tech: ["software", " ai ", "artificial intelligence", "cloud", "cyber"], mining: ["copper", "lithium", "cobalt", "mine", "rare earth"], pharma: ["vaccine", "drug", "fda", "clinical"] };
  var GI_ASSETS = { energy: "Crude & gas", defense: "Defense", chips: "Semiconductors", banks: "Rates & banks", agriculture: "Grains", shipping: "Freight", tech: "Tech", mining: "Base metals", pharma: "Pharma" };

  function giClassify(a, channelKey) {
    var hay = " " + String(a.title || "").toLowerCase() + " ";
    var neg = 0, pos = 0;
    GI_NEG.forEach(function (w) { if (hay.indexOf(w) !== -1) neg++; });
    GI_POS.forEach(function (w) { if (hay.indexOf(w) !== -1) pos++; });
    var senti = neg >= 3 || (neg >= 2 && pos === 0) ? "critical" : neg > pos ? "tense" : pos > neg ? "improving" : "steady";
    var impact = 1 + Math.min(2, neg > pos ? 1 : 0);
    Object.keys(GI_IMPACT).forEach(function (w) { if (hay.indexOf(w) !== -1) impact += GI_IMPACT[w]; });
    impact = Math.max(1, Math.min(5, impact));
    var sectors = [];
    Object.keys(GI_SECTORS).forEach(function (s) {
      if (GI_SECTORS[s].some(function (w) { return hay.indexOf(w) !== -1; })) sectors.push(s);
    });
    return {
      channel: channelKey !== "all" ? channelKey : giGuessChannel(hay),
      region: giRegionOf(a.sourcecountry),
      senti: senti,
      impact: impact,
      sectors: sectors.slice(0, 3),
      assets: sectors.slice(0, 3).map(function (s) { return GI_ASSETS[s]; }),
    };
  }
  function giGuessChannel(hay) {
    var best = "geopolitics", bestN = 0;
    GI_CHANNELS.slice(1).forEach(function (c) {
      var n = 0;
      c.q.toLowerCase().replace(/[()"]/g, "").split(" or ").forEach(function (w) {
        if (w && hay.indexOf(w.trim()) !== -1) n++;
      });
      if (n > bestN) { bestN = n; best = c.key; }
    });
    return best;
  }

  function giAgo(seendate) {
    // GDELT dates look like 20260919T134500Z
    var m = String(seendate || "").match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})/);
    if (!m) return "";
    var t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    var mins = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (mins < 60) return mins + "m ago";
    if (mins < 1440) return Math.round(mins / 60) + "h ago";
    return Math.round(mins / 1440) + "d ago";
  }

  function giFetch(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    });
  }
  function giGdeltUrl(query, maxrecords, timespan) {
    return "https://api.gdeltproject.org/api/v2/doc/doc?query=" +
      encodeURIComponent(query + " sourcelang:english") +
      "&mode=ArtList&format=json&sort=DateDesc&maxrecords=" + maxrecords + "&timespan=" + timespan;
  }

  /* Pulse strip: a handful of live world numbers, each failing softly. */
  function giLoadPulse() {
    var setCell = function (id, text, sub) {
      var n = $(id);
      if (!n) return;
      n.querySelector(".pulse-val").textContent = text;
      if (sub !== undefined) n.querySelector(".pulse-sub").textContent = sub;
    };
    giFetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true")
      .then(function (d) {
        var f = function (x) { return x >= 1000 ? "$" + Math.round(x).toLocaleString() : "$" + x; };
        var ch = function (x) { return (x >= 0 ? "+" : "") + x.toFixed(1) + "% 24h"; };
        if (d.bitcoin) setCell("pulseBtc", f(d.bitcoin.usd), ch(d.bitcoin.usd_24h_change || 0));
        if (d.ethereum) setCell("pulseEth", f(d.ethereum.usd), ch(d.ethereum.usd_24h_change || 0));
      }).catch(function () { setCell("pulseBtc", "—", "unavailable"); setCell("pulseEth", "—", "unavailable"); });
    giFetch("https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY")
      .then(function (d) {
        if (d.rates) setCell("pulseFx", "€" + d.rates.EUR.toFixed(3), "£" + d.rates.GBP.toFixed(3) + " · ¥" + Math.round(d.rates.JPY));
      }).catch(function () { setCell("pulseFx", "—", "unavailable"); });
    giFetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson")
      .then(function (d) {
        var feats = (d.features || []);
        var big = feats.filter(function (f) { return f.properties && f.properties.mag >= 5; }).length;
        setCell("pulseQuake", String(feats.length), big + " at M5+");
      }).catch(function () { setCell("pulseQuake", "—", "unavailable"); });
  }

  function giVisibleArticles() {
    return GI.articles.filter(function (a) {
      if (GI.region !== "all" && a._cls.region !== GI.region) return false;
      if (GI.search && String(a.title || "").toLowerCase().indexOf(GI.search) === -1) return false;
      return true;
    });
  }

  function giRenderFeed() {
    var feed = $("insightFeed");
    feed.innerHTML = "";
    var list = giVisibleArticles();
    $("insightStatus").textContent = list.length
      ? list.length + " live signals · " + giChannel(GI.channel).label.toLowerCase() + (GI.region !== "all" ? " · " + GI.region : "")
      : "No signals match — widen the channel, region, or search.";
    list.forEach(function (a) {
      var card = el("button", "sig-card");
      card.type = "button";
      card.setAttribute("data-chan", a._cls.channel);
      var top = el("div", "sig-top");
      top.appendChild(el("span", "sig-chan", giChannel(a._cls.channel).label));
      top.appendChild(el("span", "sig-when", giAgo(a.seendate)));
      var sent = el("span", "sig-senti is-" + a._cls.senti, a._cls.senti);
      top.appendChild(sent);
      var pips = el("span", "sig-impact", "impact " + roman(a._cls.impact));
      top.appendChild(pips);
      card.appendChild(top);
      card.appendChild(el("div", "sig-title", a.title || "(untitled signal)"));
      var meta = el("div", "sig-meta");
      meta.appendChild(el("span", null, a.domain || ""));
      if (a.sourcecountry) meta.appendChild(el("span", null, a.sourcecountry));
      meta.appendChild(el("span", "sig-region", a._cls.region));
      (a._cls.assets || []).forEach(function (as) { meta.appendChild(el("span", "sig-asset", as)); });
      card.appendChild(meta);
      card.addEventListener("click", function () { giOpenBrief(a); });
      feed.appendChild(card);
    });
  }

  function giLoadFeed(manual) {
    var gen = ++GI.gen;
    var ch = giChannel(GI.channel);
    $("insightStatus").textContent = "Scanning the wire…";
    giFetch(giGdeltUrl(ch.q, 45, "12h"))
      .then(function (d) {
        if (gen !== GI.gen || !GI.open) return;
        var arts = (d.articles || []).filter(function (a) { return a && a.title; });
        // De-duplicate near-identical headlines from syndication.
        var seen = {};
        arts = arts.filter(function (a) {
          var k = String(a.title).toLowerCase().replace(/[^a-z]+/g, "").slice(0, 60);
          if (seen[k]) return false;
          seen[k] = 1;
          return true;
        });
        arts.forEach(function (a) { a._cls = giClassify(a, ch.key); });
        GI.articles = arts;
        giRenderFeed();
        var cache = load(LS.insight, {});
        cache[ch.key] = { when: new Date().toISOString(), articles: arts.slice(0, 30) };
        save(LS.insight, cache);
      })
      .catch(function () {
        if (gen !== GI.gen || !GI.open) return;
        var cache = load(LS.insight, {})[ch.key];
        if (cache && cache.articles) {
          GI.articles = cache.articles;
          giRenderFeed();
          var when = "";
          try { when = new Date(cache.when).toLocaleString(); } catch (e) { /* ignore */ }
          $("insightStatus").textContent = "Live fetch failed — showing the last capture" + (when ? " from " + when : "") + ".";
        } else {
          GI.articles = [];
          $("insightFeed").innerHTML = "";
          $("insightStatus").textContent = "The wire is unreachable right now — check your connection and it will retry on the next cycle.";
        }
      });
    GI.left = GI_REFRESH;
    if (manual) giLoadPulse();
  }

  var GI_WATCH = {
    geopolitics: ["Whether allies or rivals issue formal responses within 48 hours.", "Movement in defense postures or emergency sessions of international bodies."],
    conflict: ["Verified casualty and territory reports from both sides, not one.", "Whether supply lines, ports, or energy infrastructure enter the target set."],
    finance: ["The next central-bank statement and how bond yields move against it.", "Whether the move is broad across sectors or isolated to one name."],
    politics: ["Coalition arithmetic: who must now vote with whom.", "Court challenges or procedural blocks filed within the week."],
    business: ["Regulatory filings that confirm or deny the reporting.", "Competitor and supplier reactions in the same sector."],
    technology: ["Independent replication or security-researcher confirmation.", "Which incumbents respond with pricing or product moves."],
    crypto: ["Exchange flows and stablecoin issuance over the next sessions.", "Regulatory statements from major jurisdictions."],
    commodities: ["Inventory and shipping data confirming a physical, not paper, move.", "Producer-group meetings and export-policy changes."],
    disasters: ["Official casualty and damage assessments as they stabilize.", "Infrastructure status: power, ports, hospitals, transport corridors."],
  };

  function giOpenBrief(a) {
    GI.brief = a;
    adminLog({ kind: "insight", q: String(a.title || "").slice(0, 120), channel: a._cls.channel });
    $("insightFeedWrap").hidden = true;
    $("briefPanel").hidden = false;
    $("insightScroll").scrollTop = 0;
    var body = $("briefBody");
    body.innerHTML = "";

    var mkSec = function (title) {
      var sec = el("section", "brief-sec");
      sec.appendChild(el("h4", null, title));
      body.appendChild(sec);
      return sec;
    };

    var s1 = mkSec("Situation");
    s1.appendChild(el("p", "brief-title", a.title || ""));
    var sit = el("p", "brief-body-text");
    sit.textContent = "Reported by " + (a.domain || "an open source") + (a.sourcecountry ? " (" + a.sourcecountry + ")" : "") +
      " " + (giAgo(a.seendate) || "recently") + ". Classified on this device as a " + a._cls.senti + " " +
      giChannel(a._cls.channel).label.toLowerCase() + " signal, impact " + roman(a._cls.impact) + " of V, bearing on " + a._cls.region + ".";
    s1.appendChild(sit);
    var link = el("a", "brief-link", "Open the original report ↗");
    link.href = a.url || "#";
    link.target = "_blank";
    link.rel = "noopener";
    s1.appendChild(link);

    var s2 = mkSec("Classification");
    var grid = el("div", "brief-grid");
    var cell = function (k, v) {
      var c = el("div", "brief-cell");
      c.appendChild(el("b", null, k));
      c.appendChild(el("span", null, v));
      grid.appendChild(c);
    };
    cell("Channel", giChannel(a._cls.channel).label);
    cell("Region", a._cls.region);
    cell("Sentiment", a._cls.senti);
    cell("Impact", roman(a._cls.impact) + " / V");
    cell("Sectors", a._cls.sectors.length ? a._cls.sectors.join(", ") : "—");
    cell("Assets in play", a._cls.assets.length ? a._cls.assets.join(", ") : "—");
    s2.appendChild(grid);

    if (a._cls.assets.length) {
      var s3 = mkSec("Market read");
      var mr = el("p", "brief-body-text");
      mr.textContent = "Exposure concentrates in " + a._cls.assets.join(", ").toLowerCase() +
        ". A " + a._cls.senti + " signal here usually moves first through " + (a._cls.assets[0] || "").toLowerCase() +
        "; watch whether follow-on coverage confirms scale before treating the move as durable. Computed from keyword exposure, not from prices.";
      s3.appendChild(mr);
    }

    var s4 = mkSec("What to watch next");
    var ul = el("ul", "brief-watch");
    (GI_WATCH[a._cls.channel] || GI_WATCH.geopolitics).forEach(function (w) { ul.appendChild(el("li", null, w)); });
    s4.appendChild(ul);

    var s5 = mkSec("Related coverage");
    var rel = el("div", "brief-related");
    rel.appendChild(el("p", "fine", "Searching other outlets…"));
    s5.appendChild(rel);
    var terms = sigWords(a.title).filter(function (w, i, arr) { return arr.indexOf(w) === i; }).slice(0, 4);
    var relQuery = terms.map(function (t) { return '"' + t + '"'; }).join(" OR ");
    giFetch(giGdeltUrl(relQuery || '"' + String(a.title || "").slice(0, 40) + '"', 25, "3d"))
      .then(function (d) {
        if (GI.brief !== a) return;
        rel.innerHTML = "";
        var seenDom = {};
        seenDom[a.domain] = 1;
        var rows = (d.articles || []).filter(function (r) {
          if (!r.title || seenDom[r.domain]) return false;
          seenDom[r.domain] = 1;
          return true;
        }).slice(0, 6);
        if (!rows.length) {
          rel.appendChild(el("p", "fine", "No parallel coverage found yet — a single-source story deserves extra caution."));
          return;
        }
        var countries = {};
        rows.forEach(function (r) { if (r.sourcecountry) countries[r.sourcecountry] = 1; });
        rel.appendChild(el("p", "brief-body-text", rows.length + " other outlets across " + Object.keys(countries).length + " countries are carrying this story. Compare the framings:"));
        rows.forEach(function (r) {
          var row = el("a", "rel-row");
          row.href = r.url || "#";
          row.target = "_blank";
          row.rel = "noopener";
          row.appendChild(el("span", "rel-outlet", (r.domain || "") + (r.sourcecountry ? " · " + r.sourcecountry : "")));
          row.appendChild(el("span", "rel-title", r.title));
          rel.appendChild(row);
        });
      })
      .catch(function () {
        if (GI.brief !== a) return;
        rel.innerHTML = "";
        rel.appendChild(el("p", "fine", "Related-coverage search unavailable right now."));
      });

    var s6 = mkSec("Source context");
    var sc = el("p", "brief-body-text");
    var wire = /reuters|apnews|afp|bloomberg|upi\./.test(String(a.domain || ""));
    sc.textContent = (a.domain || "This outlet") + (a.sourcecountry ? " publishes from " + a.sourcecountry + "." : ".") +
      (wire ? " It is a wire service: fast, broadly syndicated, usually first but thin on analysis." :
        " Weigh its national vantage point — the same facts read differently from different capitals.") +
      " Cross-check against the related coverage above before acting on a single framing.";
    s6.appendChild(sc);
  }

  function giCloseBrief() {
    GI.brief = null;
    $("briefPanel").hidden = true;
    $("insightFeedWrap").hidden = false;
  }

  function giRenderChips() {
    var wrap = $("insightChips");
    wrap.innerHTML = "";
    GI_CHANNELS.forEach(function (c) {
      var chip = el("button", "chip" + (GI.channel === c.key ? " active" : ""));
      chip.type = "button";
      chip.textContent = c.label;
      chip.setAttribute("data-chan", c.key);
      chip.addEventListener("click", function () {
        GI.channel = c.key;
        giRenderChips();
        giCloseBrief();
        giLoadFeed(true);
      });
      wrap.appendChild(chip);
    });
  }

  function openInsight() {
    if (!$("chatView").hidden) closeChat();
    if (!$("councilView").hidden) closeCouncil();
    if (!$("councilView").hidden) return; // user chose to stay with a deliberating council
    $("aboutView").hidden = true;
    GI.open = true;
    $("insightView").hidden = false;
    giCloseBrief();
    giRenderChips();
    giLoadFeed(true);
    if (GI.timer) clearInterval(GI.timer);
    GI.timer = setInterval(function () {
      if (!GI.open) return;
      if (document.hidden || GI.brief) return; // hold the clock while reading or away
      GI.left--;
      var pill = $("insightPill");
      if (pill) pill.textContent = "LIVE · " + Math.max(0, GI.left) + "s";
      if (GI.left <= 0) giLoadFeed(false);
    }, 1000);
  }
  function closeInsight() {
    GI.open = false;
    GI.gen++;
    if (GI.timer) { clearInterval(GI.timer); GI.timer = null; }
    $("insightView").hidden = true;
  }

  /* ── Overlay & routing plumbing ────────────────────────────── */

  function closeOverlays() {
    ["profileOverlay", "settingsOverlay", "expertOverlay", "codexOverlay", "adminOverlay", "dashOverlay"].forEach(function (id) { $(id).hidden = true; });
    ["header.nav", "section.hero", "main.explore", "footer.foot"].forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (n) { n.inert = false; });
    });
    if (lastFocus && document.contains(lastFocus)) { try { lastFocus.focus(); } catch (e) { /* ignore */ } }
    lastFocus = null;
  }

  // User-initiated dismissal (backdrop, Escape, ✕): protect an unsaved expert form.
  function dismissOverlays() {
    if (!$("expertOverlay").hidden && expertDirty && !confirm("Discard your unsaved expert?")) return;
    closeOverlays();
  }

  function autoGrow(ta) {
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
  }

  function handleHash() {
    var m = location.hash.match(/^#\/(chat|mind)\/(.+)$/);
    if (!m) { if (!$("chatView").hidden) closeChat(); return; }
    var id = decodeURIComponent(m[2]);
    if (m[1] === "chat") {
      // Ignore the echo of openChat's own hash write — re-opening would
      // rebuild the log and orphan an in-flight reply bubble.
      if (chatMind && chatMind.id === id && !$("chatView").hidden) return;
      openChat(id);
    } else {
      openProfile(id);
    }
  }

  function wire() {
    $("searchInput").addEventListener("input", function (e) {
      searchQuery = e.target.value;
      renderGrid();
    });
    $("brandHome").addEventListener("click", function (e) {
      e.preventDefault();
      closeChat();
      if (GI.open) closeInsight();
      closeOverlays();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    $("surpriseBtn").addEventListener("click", function () {
      var list = allMinds();
      if (list.length) openProfile(list[Math.floor(Math.random() * list.length)].id);
    });
    $("settingsBtn").addEventListener("click", function () { requireAdmin(openSettings); });
    $("addExpertBtn").addEventListener("click", function () { openExpertForm(null); });
    $("heroAddExpert").addEventListener("click", function () { openExpertForm(null); });
    $("councilBtn").addEventListener("click", function () { openCouncil(); });
    $("heroCouncil").addEventListener("click", function () { openCouncil(); });
    $("insightBtn").addEventListener("click", openInsight);
    $("insightBack").addEventListener("click", closeInsight);
    $("briefBack").addEventListener("click", giCloseBrief);
    $("insightRegion").addEventListener("change", function (e) {
      GI.region = e.target.value;
      giRenderFeed();
    });
    $("insightSearch").addEventListener("input", function (e) {
      GI.search = e.target.value.trim().toLowerCase();
      giRenderFeed();
    });
    $("briefCouncil").addEventListener("click", function () {
      var a = GI.brief;
      if (!a) return;
      closeInsight();
      openCouncil();
      $("councilQuestion").value = 'The council weighs a live signal: "' + String(a.title || "").slice(0, 160) +
        '" — how should a decision-maker read it, and what should they do about it?';
    });
    $("codexBtn").addEventListener("click", function () { openOverlay("codexOverlay"); });
    $("councilBack").addEventListener("click", closeCouncil);
    $("councilFilter").addEventListener("input", renderCouncilPicker);
    $("councilConvene").addEventListener("click", conveneCouncil);
    $("councilCopy").addEventListener("click", copyCouncilReport);
    $("councilAgain").addEventListener("click", function () {
      if (councilBusy) { toast("The council is still deliberating."); return; }
      stopMC();
      $("councilReport").hidden = true;
      $("councilSetup").hidden = false;
      renderCouncilHistory();
      $("councilScroll").scrollTop = 0;
    });
    $("profileCouncilBtn").addEventListener("click", function () {
      if (!currentMind) return;
      var id = currentMind.id;
      closeOverlays();
      openCouncil(id);
      toast(findMind(id).name + " takes a council seat.");
    });
    document.querySelectorAll("[data-open=add]").forEach(function (b) {
      b.addEventListener("click", function () { openExpertForm(null); });
    });

    // Overlay closing: backdrop click, ✕ buttons, Escape. Backdrop dismissal keys
    // off where the press *started*, so a select-drag that ends outside the modal
    // can't nuke the form.
    document.querySelectorAll(".overlay").forEach(function (ov) {
      ov.addEventListener("mousedown", function (e) { ov._downOnSelf = (e.target === ov); });
      ov.addEventListener("click", function (e) { if (e.target === ov && ov._downOnSelf) dismissOverlays(); });
    });
    document.querySelectorAll("[data-close]").forEach(function (b) {
      b.addEventListener("click", dismissOverlays);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        var anyOverlay = ["profileOverlay", "settingsOverlay", "expertOverlay", "codexOverlay", "adminOverlay", "dashOverlay"].some(function (id) { return !$(id).hidden; });
        if (anyOverlay) dismissOverlays();
        else if (!$("aboutView").hidden) closeAbout();
        else if (!$("insightView").hidden) { if (!$("briefPanel").hidden) giCloseBrief(); else closeInsight(); }
        else if (!$("chatView").hidden) closeChat();
        else if (!$("councilView").hidden) closeCouncil();
      }
    });

    // Profile actions
    $("profileChatBtn").addEventListener("click", function () {
      if (!currentMind) return;
      closeOverlays();
      openChat(currentMind.id);
    });
    $("profileEditBtn").addEventListener("click", function () {
      if (!currentMind) return;
      closeOverlays();
      openExpertForm(currentMind);
    });
    $("profileDeleteBtn").addEventListener("click", function () {
      if (currentMind) deleteExpert(currentMind.id);
    });

    // Chat
    $("chatBack").addEventListener("click", closeChat);
    $("chatClear").addEventListener("click", function () {
      if (!chatMind) return;
      // Bump the generation so an in-flight reply for this chat is dropped.
      chatGen[chatMind.id] = (chatGen[chatMind.id] || 0) + 1;
      delete pendingReplies[chatMind.id];
      try { localStorage.removeItem(LS.chat(chatMind.id)); } catch (e) { /* ignore */ }
      renderChatLog();
    });
    $("chatForm").addEventListener("submit", function (e) {
      e.preventDefault();
      sendMessage();
    });
    $("chatInput").addEventListener("keydown", function (e) {
      // isComposing covers Chrome/Firefox IME; keyCode 229 covers Safari's quirk.
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        sendMessage();
      }
    });
    $("chatInput").addEventListener("input", function (e) { autoGrow(e.target); });

    // Settings
    document.querySelectorAll("input[name=engine]").forEach(function (r) {
      r.addEventListener("change", syncApiFields);
    });
    $("settingsSave").addEventListener("click", saveSettings);
    $("adminForm").addEventListener("submit", submitAdmin);
    $("forgetBtn").addEventListener("click", forgetEverything);

    // Admin dashboard
    $("openDashBtn").addEventListener("click", function () { requireAdmin(openDash); });
    $("dashExport").addEventListener("click", function () {
      var log = load(LS.adminLog, []);
      downloadTextFile(JSON.stringify(log, null, 2), "rawfotra-admin-log.json", "application/json",
        "Exported " + log.length + " log entries as a file.");
    });
    $("dashClear").addEventListener("click", function () {
      if (!confirm("Clear the entire admin activity log on this device?")) return;
      save(LS.adminLog, []);
      renderDash();
      toast("Activity log cleared.");
    });

    // Expert form
    $("expertForm").addEventListener("input", function () { expertDirty = true; });
    $("expertForm").addEventListener("submit", saveExpert);
    $("exportExpertsBtn").addEventListener("click", exportExperts);
    $("importExpertsBtn").addEventListener("click", function () { $("importFile").click(); });
    $("importFile").addEventListener("change", function (e) {
      if (e.target.files && e.target.files[0]) importExperts(e.target.files[0]);
      e.target.value = "";
    });

    window.addEventListener("hashchange", handleHash);
  }

  /* ── Boot ──────────────────────────────────────────────────── */

  renderChips();
  renderGrid();
  renderDaily();
  renderCodex();
  wire();
  wireAbout();
  handleHash();

  // VM-style scroll reveal: fade-up any .reveal element once, on first viewport entry.
  (function initReveal() {
    if (!("IntersectionObserver" in window)) {
      document.querySelectorAll(".reveal").forEach(function (n) { n.classList.add("in-view"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -8% 0px" });
    var observeAll = function () { document.querySelectorAll(".reveal:not(.in-view)").forEach(function (n) { io.observe(n); }); };
    observeAll();
    // Re-scan after grid re-renders (filter/search change new cards in).
    var grid = $("mindGrid");
    if (grid && "MutationObserver" in window) {
      new MutationObserver(observeAll).observe(grid, { childList: true });
    }
  })();

  // Installable app: register the service worker (relative path keeps the
  // scope correct under /assets/rawfotra/ on GitHub Pages). file:// and
  // unsupported browsers just skip it — the site works unchanged.
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () { /* ignore */ });
    });
  }
})();
