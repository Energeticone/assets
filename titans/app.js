/* The Titans — explore, profiles, chat (offline wisdom engine + Claude API), custom experts. */
(function () {
  "use strict";

  /* ── Constants ─────────────────────────────────────────────── */

  var LS = {
    settings: "titans.settings",
    experts: "titans.customExperts",
    chat: function (id) { return "titans.chat." + id; },
  };

  // Global topic keywords for the offline wisdom engine. Each titan's data
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

  var base = window.TITANS_DATA || { titans: [], categories: [] };
  var settings = load(LS.settings, { engine: "wisdom", apiKey: "", model: "claude-opus-5" });
  var customExperts = load(LS.experts, []);
  var activeCategory = "all";
  var searchQuery = "";
  var currentTitan = null;     // titan open in profile modal
  var chatTitan = null;        // titan open in chat
  var editingId = null;        // expert being edited
  var pendingReply = false;

  function allTitans() { return base.titans.concat(customExperts); }
  function findTitan(id) {
    for (var i = 0, list = allTitans(); i < list.length; i++) if (list[i].id === id) return list[i];
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
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* storage full/blocked */ }
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
  function paintMedallion(node, titan, sizeCls) {
    node.className = "medallion " + sizeCls;
    node.textContent = titan.monogram || (titan.name || "?").slice(0, 1).toUpperCase();
    var a = (titan.palette && titan.palette.a) || "#4a4238";
    var b = (titan.palette && titan.palette.b) || "#7a6d58";
    node.style.background = "linear-gradient(145deg, " + a + ", " + b + ")";
  }

  /* ── Explore: chips + grid + daily wisdom ──────────────────── */

  function renderChips() {
    var wrap = $("categoryChips");
    wrap.innerHTML = "";
    var titans = allTitans();
    var mk = function (key, label, count) {
      var chip = el("button", "chip" + (activeCategory === key ? " active" : ""));
      chip.setAttribute("role", "tab");
      chip.appendChild(document.createTextNode(label));
      chip.appendChild(el("span", "count", String(count)));
      chip.addEventListener("click", function () {
        activeCategory = key;
        renderChips();
        renderGrid();
      });
      wrap.appendChild(chip);
    };
    mk("all", "All", titans.length);
    categories().forEach(function (c) {
      var count = titans.filter(function (t) { return t.category === c.key; }).length;
      if (count > 0) mk(c.key, c.label, count);
    });
    if (customExperts.length > 0) mk("__custom", "Yours", customExperts.length);
  }

  function matchesSearch(t, q) {
    if (!q) return true;
    var hay = [t.name, t.epithet, t.years, t.place, t.bio, categoryLabel(t.category), (t.tags || []).join(" "), (t.knownFor || []).join(" ")].join(" ").toLowerCase();
    return q.split(/\s+/).every(function (word) { return hay.indexOf(word) !== -1; });
  }

  function visibleTitans() {
    var q = searchQuery.trim().toLowerCase();
    return allTitans().filter(function (t) {
      if (activeCategory === "__custom" && !isCustom(t.id)) return false;
      if (activeCategory !== "all" && activeCategory !== "__custom" && t.category !== activeCategory) return false;
      return matchesSearch(t, q);
    });
  }

  function renderGrid() {
    var grid = $("titanGrid");
    grid.innerHTML = "";
    var list = visibleTitans();
    $("emptyState").hidden = list.length > 0;
    list.forEach(function (t) {
      var card = el("button", "titan-card");
      card.setAttribute("aria-label", "Open " + t.name);

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
    var titans = base.titans;
    if (!titans.length) { $("dailyWisdom").hidden = true; return; }
    var today = new Date();
    var seed = today.getFullYear() * 372 + (today.getMonth() + 1) * 31 + today.getDate();
    var t = titans[seed % titans.length];
    var ps = t.principles || [];
    var p = ps.length ? ps[seed % ps.length] : null;
    $("dailyText").textContent = p ? p.text : t.bio;
    $("dailyFrom").textContent = "— " + t.name + (p ? ", on " + p.title.toLowerCase() : "");
    $("dailyFrom").onclick = function () { openProfile(t.id); };
  }

  /* ── Profile modal ─────────────────────────────────────────── */

  function openProfile(id) {
    var t = findTitan(id);
    if (!t) return;
    currentTitan = t;
    paintMedallion($("profileMedallion"), t, "medallion-lg");
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

    var custom = isCustom(t.id);
    $("profileEditBtn").hidden = !custom;
    $("profileDeleteBtn").hidden = !custom;
    $("profileOverlay").hidden = false;
  }

  /* ── Chat ──────────────────────────────────────────────────── */

  function chatHistory(id) { return load(LS.chat(id), []); }
  function saveChat(id, history) { save(LS.chat(id), history); }

  function openChat(id, prefill) {
    var t = findTitan(id);
    if (!t) return;
    chatTitan = t;
    location.hash = "#/chat/" + id;
    paintMedallion($("chatMedallion"), t, "medallion-sm");
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
    chatTitan = null;
    $("chatView").hidden = true;
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  }

  function renderEnginePill() {
    var pill = $("enginePill");
    if (settings.engine === "claude" && settings.apiKey) {
      pill.textContent = "Claude AI";
      pill.classList.add("ai");
    } else {
      pill.textContent = "Wisdom engine";
      pill.classList.remove("ai");
    }
  }

  function renderChatLog() {
    var log = $("chatLog");
    log.innerHTML = "";
    if (!chatTitan) return;
    var history = chatHistory(chatTitan.id);
    if (history.length === 0 && chatTitan.greeting) {
      history = [{ role: "titan", text: chatTitan.greeting }];
      saveChat(chatTitan.id, history);
    }
    history.forEach(function (m) { log.appendChild(msgNode(m.role, m.text)); });
    renderChatStarters(history);
    scrollChat();
  }

  function renderChatStarters(history) {
    var wrap = $("chatStarters");
    wrap.innerHTML = "";
    var showStarters = history.filter(function (m) { return m.role === "user"; }).length === 0;
    if (!showStarters || !chatTitan) return;
    (chatTitan.starters || []).forEach(function (q) {
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
    if (!chatTitan || pendingReply) return;
    var input = $("chatInput");
    var text = input.value.trim();
    if (!text) return;
    input.value = "";
    autoGrow(input);

    var id = chatTitan.id;
    var history = chatHistory(id);
    history.push({ role: "user", text: text });
    saveChat(id, history);
    $("chatLog").appendChild(msgNode("user", text));
    renderChatStarters(history);
    scrollChat();

    pendingReply = true;
    var bubble = msgNode("titan thinking", "");
    var dots = el("span", "dots");
    bubble.appendChild(dots);
    $("chatLog").appendChild(bubble);
    scrollChat();

    var finish = function (replyText) {
      bubble.classList.remove("thinking");
      bubble.textContent = replyText;
      var h = chatHistory(id);
      h.push({ role: "titan", text: replyText });
      saveChat(id, h);
      pendingReply = false;
      scrollChat();
    };
    var fail = function (message) {
      bubble.remove();
      var e = msgNode("error", message);
      $("chatLog").appendChild(e);
      pendingReply = false;
      scrollChat();
    };

    if (settings.engine === "claude" && settings.apiKey) {
      claudeReply(chatTitan, history, bubble, finish, fail);
    } else {
      // Simulated contemplation delay keeps the offline engine feeling conversational.
      var reply = wisdomReply(chatTitan, text, history);
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

  function wisdomReply(t, text, history) {
    var lower = text.toLowerCase();
    var seed = hashCode(t.id + "|" + text + "|" + history.length);

    // Small-talk intents first.
    if (/^(hi|hello|hey|greetings|good (morning|evening|afternoon))\b/.test(lower)) {
      return t.greeting || "Welcome. Speak your mind, and let us reason together.";
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
      return wisdom[topicKey];
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
      "You are " + t.name + (t.epithet ? ", " + t.epithet : "") + (t.years ? " (" + t.years + ")" : "") + ", speaking as a personal mentor in The Titans app.",
      t.bio ? "Biography: " + t.bio : "",
      (t.knownFor && t.knownFor.length) ? "Known for: " + t.knownFor.join("; ") + "." : "",
      (t.principles && t.principles.length) ? "Your core teachings:\n" + t.principles.map(function (p) { return "- " + p.title + ": " + p.text; }).join("\n") : "",
      t.voice ? "Voice and manner: " + t.voice : "",
      "",
      "Guidelines: Stay fully in character as " + t.name + " — first person, in your authentic voice, grounded in your documented life, era, and philosophy. You are aware you are speaking to a person from the present day and may engage with modern topics, interpreting them through your own experience and principles; where your era lacked a concept, reason by analogy rather than feigning modern knowledge. Be a warm but honest mentor: give counsel that is specific and actionable, not generic praise. Prefer replies of one to three short paragraphs, and often end by turning a pointed question back to the mentee. Paraphrase your teachings in fresh words rather than reciting famous lines. If asked something outside the bounds of mentoring (e.g. dangerous instructions), decline in character and steer back to what wisdom you can offer.",
    ];
    return lines.filter(function (s) { return s !== ""; }).join("\n");
  }

  function claudeReply(t, history, bubble, finish, fail) {
    var messages = history
      .filter(function (m) { return m.role === "user" || m.role === "titan"; })
      .slice(-24)
      .map(function (m) { return { role: m.role === "user" ? "user" : "assistant", content: m.text }; });
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
        max_tokens: 1024,
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
        if (stopReason === "refusal" && !acc) {
          throw new Error("The model declined this request. Try rephrasing, or switch engines in Settings.");
        }
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

  /* ── Settings ──────────────────────────────────────────────── */

  function openSettings() {
    var radios = document.querySelectorAll("input[name=engine]");
    radios.forEach(function (r) { r.checked = r.value === settings.engine; });
    $("apiKeyInput").value = settings.apiKey || "";
    $("modelSelect").value = settings.model || "claude-opus-5";
    syncApiFields();
    $("settingsOverlay").hidden = false;
  }
  function syncApiFields() {
    var engine = document.querySelector("input[name=engine]:checked");
    $("apiFields").classList.toggle("disabled", !engine || engine.value !== "claude");
  }
  function saveSettings() {
    var engine = document.querySelector("input[name=engine]:checked");
    settings.engine = engine ? engine.value : "wisdom";
    settings.apiKey = $("apiKeyInput").value.trim();
    settings.model = $("modelSelect").value;
    if (settings.engine === "claude" && !settings.apiKey) {
      toast("Add an API key to use Claude — falling back to the wisdom engine.");
      settings.engine = "wisdom";
    }
    save(LS.settings, settings);
    renderEnginePill();
    closeOverlays();
    toast("Settings saved.");
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
    if (selected && sel.querySelector('option[value="' + selected + '"]')) sel.value = selected;
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
      f.color.value = (expert.palette && expert.palette.a) || "#8a6d3b";
      f.bio.value = expert.bio || "";
      f.knownFor.value = (expert.knownFor || []).join("\n");
      f.principles.value = (expert.principles || []).map(function (p) { return p.title + ": " + p.text; }).join("\n");
      f.voice.value = expert.voice || "";
      f.greeting.value = expert.greeting || "";
      f.starters.value = (expert.starters || []).join("\n");
    }
    $("expertOverlay").hidden = false;
  }

  function slugify(name) {
    var slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "expert";
    var unique = slug, i = 2;
    while (findTitan(unique) && unique !== editingId) { unique = slug + "-" + i; i++; }
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
    var color = f.color.value || "#8a6d3b";
    var expert = {
      id: editingId || slugify(name),
      name: name,
      epithet: f.epithet.value.trim(),
      years: f.years.value.trim(),
      place: f.place.value.trim(),
      category: category,
      categoryLabel: categoryLabelText || undefined,
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
    save(LS.experts, customExperts);
    editingId = null;
    closeOverlays();
    renderChips();
    renderGrid();
    toast(expert.name + " has joined the pantheon.");
  }

  function deleteExpert(id) {
    var t = findTitan(id);
    if (!t || !isCustom(id)) return;
    if (!confirm("Remove " + t.name + " and their conversation history?")) return;
    customExperts = customExperts.filter(function (e) { return e.id !== id; });
    save(LS.experts, customExperts);
    try { localStorage.removeItem(LS.chat(id)); } catch (e) { /* ignore */ }
    closeOverlays();
    renderChips();
    renderGrid();
    toast(t.name + " removed.");
  }

  function exportExperts() {
    if (!customExperts.length) { toast("No custom experts to export yet."); return; }
    var blob = new Blob([JSON.stringify(customExperts, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "titans-custom-experts.json";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Exported " + customExperts.length + " expert(s). Paste into data/titans.js to make permanent.");
  }

  function importExperts(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var arr = JSON.parse(reader.result);
        if (!Array.isArray(arr)) throw new Error("not an array");
        var added = 0;
        arr.forEach(function (e) {
          if (!e || !e.name || !e.id) return;
          if (findTitan(e.id)) e.id = e.id + "-" + Math.floor(Math.random() * 1000);
          customExperts.push(e);
          added++;
        });
        save(LS.experts, customExperts);
        renderChips();
        renderGrid();
        toast("Imported " + added + " expert(s).");
      } catch (err) {
        toast("Import failed: not a valid experts JSON file.");
      }
    };
    reader.readAsText(file);
  }

  /* ── Overlay & routing plumbing ────────────────────────────── */

  function closeOverlays() {
    ["profileOverlay", "settingsOverlay", "expertOverlay"].forEach(function (id) { $(id).hidden = true; });
  }

  function autoGrow(ta) {
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
  }

  function handleHash() {
    var m = location.hash.match(/^#\/(chat|titan)\/([\w-]+)$/);
    if (!m) { if (!$("chatView").hidden) closeChat(); return; }
    if (m[1] === "chat") openChat(m[2]);
    else openProfile(m[2]);
  }

  function wire() {
    $("searchInput").addEventListener("input", function (e) {
      searchQuery = e.target.value;
      renderGrid();
    });
    $("brandHome").addEventListener("click", function (e) {
      e.preventDefault();
      closeChat();
      closeOverlays();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    $("surpriseBtn").addEventListener("click", function () {
      var list = allTitans();
      if (list.length) openProfile(list[Math.floor(Math.random() * list.length)].id);
    });
    $("settingsBtn").addEventListener("click", openSettings);
    $("addExpertBtn").addEventListener("click", function () { openExpertForm(null); });
    $("heroAddExpert").addEventListener("click", function () { openExpertForm(null); });
    document.querySelectorAll("[data-open=add]").forEach(function (b) {
      b.addEventListener("click", function () { openExpertForm(null); });
    });

    // Overlay closing: backdrop click, ✕ buttons, Escape.
    document.querySelectorAll(".overlay").forEach(function (ov) {
      ov.addEventListener("click", function (e) { if (e.target === ov) closeOverlays(); });
    });
    document.querySelectorAll("[data-close]").forEach(function (b) {
      b.addEventListener("click", closeOverlays);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        var anyOverlay = ["profileOverlay", "settingsOverlay", "expertOverlay"].some(function (id) { return !$(id).hidden; });
        if (anyOverlay) closeOverlays();
        else if (!$("chatView").hidden) closeChat();
      }
    });

    // Profile actions
    $("profileChatBtn").addEventListener("click", function () {
      if (!currentTitan) return;
      closeOverlays();
      openChat(currentTitan.id);
    });
    $("profileEditBtn").addEventListener("click", function () {
      if (!currentTitan) return;
      closeOverlays();
      openExpertForm(currentTitan);
    });
    $("profileDeleteBtn").addEventListener("click", function () {
      if (currentTitan) deleteExpert(currentTitan.id);
    });

    // Chat
    $("chatBack").addEventListener("click", closeChat);
    $("chatClear").addEventListener("click", function () {
      if (!chatTitan) return;
      try { localStorage.removeItem(LS.chat(chatTitan.id)); } catch (e) { /* ignore */ }
      renderChatLog();
    });
    $("chatForm").addEventListener("submit", function (e) {
      e.preventDefault();
      sendMessage();
    });
    $("chatInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
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

    // Expert form
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
  wire();
  handleHash();
})();
