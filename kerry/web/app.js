/*
 * Kerry web app — UI controller.
 *
 * Wires the browser UI to the KerryEngine loop: runs cycles, renders the
 * hill-climb chart, the veteran's lessons, the knowledge base and traces, runs
 * the sovereignty test, and persists the firm's learning to localStorage so it
 * compounds across reloads. No backend, no key.
 */
(function () {
  "use strict";

  const E = window.KerryEngine;
  const Seed = window.KerrySeed;
  const LS_KEY = "kerry.web.state.v1";

  const $ = (id) => document.getElementById(id);
  const scoreClass = (s) => (s >= 0.85 ? "hi" : s >= 0.4 ? "mid" : "lo");

  // ------------------------------------------------------------------- State
  let tasks = [];
  let kerry = null;
  let running = false;

  function persist() {
    try {
      const state = {
        knowledge: kerry.kb.toJSON(),
        tasks: tasks,
        lessons: kerry.veteran.toJSON(),
        cycle: kerry.cycle,
        history: kerry.ledger.records,
        traces: kerry.traces.slice(-16),
        generalist: $("genSelect").value,
      };
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch (e) {
      /* private mode / disabled storage — the app still works, just not durable. */
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  function buildKerry(knowledge, lessons, generalistId) {
    const kb = new E.KnowledgeBase(knowledge);
    const veteran = new E.Veteran(lessons);
    const gen = E.GENERALISTS[generalistId] || E.GENERALISTS.echo;
    return new E.Kerry(gen, kb, veteran);
  }

  function init() {
    const saved = loadState();
    const knowledge = saved && saved.knowledge ? saved.knowledge : Seed.knowledge();
    tasks = saved && saved.tasks ? saved.tasks : Seed.tasks();
    const genId = (saved && saved.generalist) || "echo";

    kerry = buildKerry(knowledge, saved ? saved.lessons : null, genId);
    if (saved) {
      kerry.cycle = saved.cycle || 0;
      kerry.ledger.records = saved.history || [];
      kerry.traces = saved.traces || [];
    }

    populateGeneralists(genId);
    renderEditorFromState();
    renderAll();
  }

  // ------------------------------------------------------------- Generalists
  function populateGeneralists(selectedId) {
    const sel = $("genSelect");
    sel.innerHTML = "";
    Object.keys(E.GENERALISTS).forEach((id) => {
      const o = document.createElement("option");
      o.value = id;
      o.textContent = E.GENERALISTS[id].label;
      sel.appendChild(o);
    });
    sel.value = selectedId;
    sel.onchange = () => {
      kerry.swapGeneralist(E.GENERALISTS[sel.value]);
      persist();
    };
  }

  // -------------------------------------------------------------- Run actions
  function runOneCycle() {
    kerry.runCycle(tasks);
    persist();
    renderAll();
  }

  function climb(cycles) {
    if (running) return;
    running = true;
    setRunning(true);
    hideSov();
    let n = 0;
    const tick = () => {
      kerry.runCycle(tasks);
      renderAll();
      n += 1;
      if (n < cycles) {
        setTimeout(tick, 480);
      } else {
        running = false;
        setRunning(false);
        persist();
      }
    };
    tick();
  }

  function sovereigntyTest() {
    if (running) return;
    // Phase 1: make sure the loop has learned the firm on the current model.
    if (kerry.ledger.records.length === 0) {
      kerry.climb(tasks, 4);
    }
    const before = kerry.ledger.records[kerry.ledger.records.length - 1];
    const beforeScore = before.mean_eval_score;
    const beforeModel = kerry.generalist.model_id;

    // Phase 2: rip out the generalist, drop in a different one. Touch nothing else.
    const ids = Object.keys(E.GENERALISTS);
    const curId = $("genSelect").value;
    const nextId = ids[(ids.indexOf(curId) + 1) % ids.length];
    $("genSelect").value = nextId;
    kerry.swapGeneralist(E.GENERALISTS[nextId]);
    const res = kerry.runCycle(tasks);
    const afterScore = res.snapshot.mean_eval_score;
    const afterModel = res.snapshot.model_id;

    persist();
    renderAll();

    const held = afterScore >= beforeScore - 1e-9;
    const box = $("sovBox");
    box.hidden = false;
    box.className = "sov" + (held ? " pass" : "");
    $("sovVerdict").className = "verdict" + (held ? " pass" : "");
    $("sovVerdict").textContent = held
      ? "PASS — the company veteran survived the model swap."
      : "The score moved — inspect which lessons were model-bound.";
    $("sovDetail").textContent = held
      ? "The value was never in the generalist; it lives in the loop the firm owns."
      : "";
    $("sovNums").textContent =
      "eval before " + pct(beforeScore) + " on " + beforeModel +
      "   →   after " + pct(afterScore) + " on " + afterModel;
  }

  function resetLearning() {
    // Wipe the learning (veteran, history, traces) but keep the firm's knowledge
    // and tasks as currently configured.
    kerry = buildKerry(kerry.kb.toJSON(), null, $("genSelect").value);
    persist();
    hideSov();
    renderAll();
  }

  function setRunning(on) {
    ["climbBtn", "stepBtn", "swapBtn", "resetBtn", "genSelect"].forEach((id) => {
      $(id).disabled = on;
    });
  }

  function hideSov() {
    $("sovBox").hidden = true;
  }

  // --------------------------------------------------------------- Rendering
  function pct(x) {
    return Math.round(x * 100) + "%";
  }

  function renderAll() {
    renderTiles();
    renderChart();
    renderVeteran();
    renderKnowledge();
    renderTraces();
  }

  function renderTiles() {
    const h = kerry.ledger.records;
    const last = h[h.length - 1];
    $("tEval").innerHTML = last ? pct(last.mean_eval_score) : "—";
    $("tHuman").textContent = last ? last.human_capital.toFixed(1) : "—";
    $("tToken").textContent = last ? last.token_capital.toFixed(2) : "—";
    $("tLessons").textContent = kerry.veteran.count;
  }

  function renderChart() {
    const svg = $("chart");
    const W = 720, H = 260;
    const m = { l: 44, r: 46, t: 16, b: 30 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const hist = kerry.ledger.records;
    const NS = "http://www.w3.org/2000/svg";
    svg.innerHTML = "";

    const add = (tag, attrs, text) => {
      const el = document.createElementNS(NS, tag);
      for (const k in attrs) el.setAttribute(k, attrs[k]);
      if (text != null) el.textContent = text;
      svg.appendChild(el);
      return el;
    };

    // Gridlines + left axis (eval %, 0..1).
    [0, 0.5, 1].forEach((v) => {
      const y = m.t + ph - v * ph;
      add("line", { x1: m.l, y1: y, x2: m.l + pw, y2: y, stroke: "var(--border-soft)", "stroke-width": 1 });
      add("text", { x: m.l - 8, y: y + 4, "text-anchor": "end", "font-size": 11, fill: "var(--text-faint)" }, Math.round(v * 100) + "%");
    });

    if (hist.length === 0) {
      add("text", { x: W / 2, y: H / 2, "text-anchor": "middle", "font-size": 13, fill: "var(--text-faint)" },
        "Run a cycle to start the climb.");
      return;
    }

    const n = hist.length;
    const xOf = (i) => (n === 1 ? m.l + pw / 2 : m.l + (i / (n - 1)) * pw);
    const tokenMax = Math.max(1, ...hist.map((s) => s.token_capital));
    const yEval = (v) => m.t + ph - v * ph;
    const yTok = (v) => m.t + ph - (v / tokenMax) * ph;

    // X labels.
    hist.forEach((s, i) => {
      add("text", { x: xOf(i), y: H - 10, "text-anchor": "middle", "font-size": 11, fill: "var(--text-faint)" }, "c" + s.cycle);
    });
    // Right axis label (token capital max).
    add("text", { x: m.l + pw + 8, y: m.t + 4, "text-anchor": "start", "font-size": 11, fill: "var(--accent)" }, tokenMax.toFixed(0));
    add("text", { x: m.l + pw + 8, y: m.t + ph + 4, "text-anchor": "start", "font-size": 11, fill: "var(--accent)" }, "0");

    const line = (pts, stroke, dash) => {
      const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
      add("path", { d: d, fill: "none", stroke: stroke, "stroke-width": 2.5, "stroke-linejoin": "round", "stroke-dasharray": dash || "none" });
      pts.forEach((p) => {
        add("circle", { cx: p[0], cy: p[1], r: 3.5, fill: stroke });
      });
    };

    const tokPts = hist.map((s, i) => [xOf(i), yTok(s.token_capital)]);
    const evalPts = hist.map((s, i) => [xOf(i), yEval(s.mean_eval_score)]);
    line(tokPts, "var(--accent)", "5 4");
    line(evalPts, "var(--signal)");

    // Value labels on eval points.
    hist.forEach((s, i) => {
      add("text", { x: xOf(i), y: yEval(s.mean_eval_score) - 9, "text-anchor": "middle", "font-size": 10.5, fill: "var(--signal)", "font-weight": 600 }, pct(s.mean_eval_score));
    });
  }

  function renderVeteran() {
    const el = $("vetList");
    $("vetCount").textContent = kerry.veteran.count ? "· " + kerry.veteran.count : "";
    const lessons = kerry.veteran.list();
    if (!lessons.length) {
      el.innerHTML = '<p class="empty">No lessons yet. Run a cycle — the veteran learns from what the evals show was missed.</p>';
      return;
    }
    el.innerHTML = "";
    lessons
      .slice()
      .sort((a, b) => b.confidence - a.confidence)
      .forEach((l) => {
        const facts = l.knowledge_ids
          .map((id) => (kerry.kb.get(id) ? kerry.kb.get(id).fact : id))
          .map((f) => "• " + f)
          .join("<br>");
        const row = document.createElement("div");
        row.className = "row";
        row.innerHTML =
          '<div class="rid">when [' + l.trigger_tags.join(", ") + "] · learned c" + l.origin_cycle + "</div>" +
          '<div class="rfact">' + facts + "</div>" +
          '<div class="tagline"><span class="tag">surfaces ' + l.knowledge_ids.length + " fact(s)</span>" +
          '<span class="tag sig">confidence ' + Math.round(l.confidence * 100) + "%</span></div>" +
          '<div class="meter"><i style="width:' + Math.round(l.confidence * 100) + '%"></i></div>';
        el.appendChild(row);
      });
  }

  function renderKnowledge() {
    const el = $("kbList");
    const all = kerry.kb.all();
    $("kbCount").textContent = all.length ? "· " + all.length : "";
    if (!all.length) {
      el.innerHTML = '<p class="empty">No knowledge. Add some in "Make it your firm".</p>';
      return;
    }
    el.innerHTML = "";
    all.forEach((k) => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML =
        '<div class="rid">' + k.id + " · weight " + k.weight + "</div>" +
        '<div class="rfact">' + escapeHtml(k.fact) + "</div>" +
        '<div class="tagline">' + k.tags.map((t) => '<span class="tag sig">' + escapeHtml(t) + "</span>").join("") + "</div>";
      el.appendChild(row);
    });
  }

  function renderTraces() {
    const el = $("traceList");
    const traces = kerry.traces.slice(-12).reverse();
    if (!traces.length) {
      el.innerHTML = '<p class="empty">Traces appear here as tasks run through the loop.</p>';
      return;
    }
    el.innerHTML = "";
    traces.forEach((t) => {
      const s = t.eval_result.score;
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML =
        '<div class="trace-row"><span class="rid">c' + t.cycle + " · " + t.task.id + "</span>" +
        '<span class="score ' + scoreClass(s) + '">' + pct(s) + "</span></div>" +
        '<div class="rfact" style="margin-bottom:2px">' + escapeHtml(t.task.prompt) + "</div>" +
        '<div class="rid">surfaced ' + t.response.surfaced_knowledge_ids.length + "/" +
        t.eval_result.expected_knowledge_ids.length + " · reward " + t.reward.toFixed(2) +
        " · " + t.model_id + "</div>";
      el.appendChild(row);
    });
  }

  // ---------------------------------------------------------------- Editor
  function renderEditorFromState() {
    $("editor").value = JSON.stringify({ knowledge: kerry.kb.toJSON(), tasks: tasks }, null, 2);
  }

  function applyEditor() {
    const msg = $("editorMsg");
    let parsed;
    try {
      parsed = JSON.parse($("editor").value);
    } catch (e) {
      msg.className = "editor-msg err";
      msg.textContent = "Invalid JSON: " + e.message;
      return;
    }
    const err = validateFirm(parsed);
    if (err) {
      msg.className = "editor-msg err";
      msg.textContent = err;
      return;
    }
    tasks = parsed.tasks;
    kerry = buildKerry(parsed.knowledge, null, $("genSelect").value); // re-seed wipes learning
    persist();
    hideSov();
    renderAll();
    msg.className = "editor-msg ok";
    msg.textContent = "Re-seeded. Learning reset — run the loop to teach the veteran your firm.";
  }

  function validateFirm(o) {
    if (!o || typeof o !== "object") return "Expected an object with 'knowledge' and 'tasks'.";
    if (!Array.isArray(o.knowledge)) return "'knowledge' must be an array.";
    if (!Array.isArray(o.tasks)) return "'tasks' must be an array.";
    for (const k of o.knowledge) {
      if (!k.id || typeof k.fact !== "string" || !Array.isArray(k.tags))
        return "Each knowledge entry needs id, fact, tags[]. Offender: " + JSON.stringify(k).slice(0, 60);
      if (typeof k.weight !== "number") k.weight = 1.0;
    }
    for (const t of o.tasks) {
      if (!t.id || typeof t.prompt !== "string" || !Array.isArray(t.tags))
        return "Each task needs id, prompt, tags[]. Offender: " + JSON.stringify(t).slice(0, 60);
    }
    return null;
  }

  function restoreSample() {
    tasks = Seed.tasks();
    kerry = buildKerry(Seed.knowledge(), null, $("genSelect").value);
    persist();
    hideSov();
    renderEditorFromState();
    renderAll();
    const msg = $("editorMsg");
    msg.className = "editor-msg ok";
    msg.textContent = "Sample firm restored.";
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // ----------------------------------------------------------------- Theme
  function initTheme() {
    let t = "dark";
    try {
      t = localStorage.getItem("kerry.theme") || "dark";
    } catch (e) {}
    document.documentElement.setAttribute("data-theme", t);
    $("themeBtn").onclick = () => {
      const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem("kerry.theme", next);
      } catch (e) {}
      renderChart(); // re-read CSS variables
    };
  }

  // ------------------------------------------------------------------- Wire
  function wire() {
    $("climbBtn").onclick = () => climb(4);
    $("stepBtn").onclick = runOneCycle;
    $("swapBtn").onclick = sovereigntyTest;
    $("resetBtn").onclick = resetLearning;
    $("applyBtn").onclick = applyEditor;
    $("seedBtn").onclick = restoreSample;
  }

  // Service worker (offline / installable). Ignored on file://.
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  initTheme();
  init();
  wire();
})();
