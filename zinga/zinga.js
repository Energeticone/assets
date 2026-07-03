/*
 * Project Zinga — a drop-in floating watch-companion overlay.
 *
 * Zinga mounts a persistent, always-on-top bubble on top of ANY page (built to
 * ride over a streaming player). Tap it and it blooms into a companion panel:
 * ask about the scene, read live captions, and drop timestamped notes without
 * ever leaving what you're watching.
 *
 * The whole thing lives inside a Shadow DOM so its styles never collide with the
 * host page — one <script> tag and a `Zinga.mount(...)` call is the entire
 * integration surface.
 *
 *   Zinga.mount({
 *     player,                 // optional PlayerAdapter (see player.js)
 *     title: 'S1:E7 "Witness"',
 *     responder: async (msg, ctx) => '...'   // optional; defaults to offline brain
 *   })
 */
(function (global) {
  'use strict';

  var STORE_PREFIX = 'zinga:v1:';
  var SNAP_MARGIN = 14;

  /* ----------------------------------------------------------------- utils */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function fmtClock(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    var mm = (h > 0 && m < 10 ? '0' : '') + m;
    return (h > 0 ? h + ':' : '') + mm + ':' + (s < 10 ? '0' : '') + s;
  }

  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(STORE_PREFIX + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function save(key, value) {
    try { localStorage.setItem(STORE_PREFIX + key, JSON.stringify(value)); }
    catch (e) { /* private mode / quota — degrade silently */ }
  }

  function slug(s) {
    return String(s || 'default').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  /* -------------------------------------------------------------- styles */

  var CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}',
    '.root{position:fixed;inset:0;pointer-events:none;z-index:2147483000}',

    /* floating bubble */
    '.bubble{position:absolute;width:56px;height:56px;border-radius:50%;',
    'display:flex;align-items:center;justify-content:center;cursor:grab;pointer-events:auto;',
    'background:rgba(28,28,32,.55);backdrop-filter:blur(14px) saturate(1.2);-webkit-backdrop-filter:blur(14px) saturate(1.2);',
    'border:1px solid rgba(255,255,255,.14);color:#fff;opacity:.62;',
    'box-shadow:0 6px 22px rgba(0,0,0,.42);transition:opacity .25s,transform .18s,box-shadow .25s;touch-action:none;user-select:none}',
    '.bubble:hover{opacity:1;transform:scale(1.05)}',
    '.bubble.dragging{cursor:grabbing;opacity:1;transform:scale(1.08);box-shadow:0 12px 34px rgba(0,0,0,.55)}',
    '.bubble.pulse{animation:zpulse 1.8s ease-in-out infinite}',
    '@keyframes zpulse{0%,100%{box-shadow:0 6px 22px rgba(0,0,0,.42)}50%{box-shadow:0 6px 22px rgba(0,0,0,.42),0 0 0 8px rgba(229,9,20,.16)}}',
    '.bubble svg{width:26px;height:26px}',
    '.badge{position:absolute;top:-3px;right:-3px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;',
    'background:#e50914;color:#fff;font-size:11px;font-weight:700;line-height:18px;text-align:center;display:none;box-shadow:0 2px 6px rgba(0,0,0,.4)}',
    '.badge.on{display:block}',

    /* panel */
    '.panel{position:absolute;width:360px;max-width:calc(100vw - 24px);height:520px;max-height:calc(100vh - 24px);',
    'display:none;flex-direction:column;pointer-events:auto;overflow:hidden;border-radius:20px;',
    'background:rgba(20,20,24,.86);backdrop-filter:blur(26px) saturate(1.3);-webkit-backdrop-filter:blur(26px) saturate(1.3);',
    'border:1px solid rgba(255,255,255,.12);box-shadow:0 24px 70px rgba(0,0,0,.6);color:#f2f2f4;',
    'opacity:0;transform:translateY(8px) scale(.98);transition:opacity .2s,transform .2s}',
    '.panel.open{display:flex}',
    '.panel.shown{opacity:1;transform:translateY(0) scale(1)}',

    '.hd{display:flex;align-items:center;gap:10px;padding:13px 14px;border-bottom:1px solid rgba(255,255,255,.08);flex:none}',
    '.hd .dot{width:9px;height:9px;border-radius:50%;background:#3ddc84;box-shadow:0 0 8px #3ddc84;flex:none}',
    '.hd .tt{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}',
    '.hd .tt small{display:block;font-weight:400;font-size:11px;color:#9a9aa2}',
    '.hd .x{width:30px;height:30px;border-radius:8px;border:0;background:rgba(255,255,255,.06);color:#cfcfd6;cursor:pointer;font-size:16px;flex:none;line-height:1}',
    '.hd .x:hover{background:rgba(255,255,255,.13)}',

    '.tabs{display:flex;gap:4px;padding:8px 10px;flex:none}',
    '.tab{flex:1;border:0;background:transparent;color:#9a9aa2;font-size:12px;font-weight:600;padding:8px 6px;border-radius:9px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px}',
    '.tab:hover{color:#dcdce2;background:rgba(255,255,255,.05)}',
    '.tab.active{color:#fff;background:rgba(229,9,20,.22)}',
    '.tab .c{font-size:10px;background:rgba(255,255,255,.14);border-radius:8px;padding:0 5px;min-width:16px}',

    '.body{flex:1;overflow-y:auto;overflow-x:hidden;padding:6px 14px 14px}',
    '.body::-webkit-scrollbar{width:7px}.body::-webkit-scrollbar-thumb{background:rgba(255,255,255,.16);border-radius:4px}',
    '.view{display:none;flex-direction:column;gap:10px}.view.active{display:flex}',

    /* chat */
    '.msg{max-width:86%;padding:9px 12px;border-radius:14px;font-size:13.5px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}',
    '.msg.me{align-self:flex-end;background:#e50914;color:#fff;border-bottom-right-radius:4px}',
    '.msg.ai{align-self:flex-start;background:rgba(255,255,255,.09);border-bottom-left-radius:4px}',
    '.msg.ai b{color:#ff5661}',
    '.msg .ts{display:block;margin-top:5px;font-size:10px;opacity:.55}',
    '.typing{align-self:flex-start;display:flex;gap:4px;padding:11px 13px;background:rgba(255,255,255,.09);border-radius:14px;border-bottom-left-radius:4px}',
    '.typing span{width:6px;height:6px;border-radius:50%;background:#bbb;animation:zbounce 1.2s infinite}',
    '.typing span:nth-child(2){animation-delay:.15s}.typing span:nth-child(3){animation-delay:.3s}',
    '@keyframes zbounce{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-5px);opacity:1}}',
    '.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}',
    '.chip{border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.04);color:#cfcfd6;font-size:11.5px;padding:6px 10px;border-radius:20px;cursor:pointer}',
    '.chip:hover{background:rgba(255,255,255,.12);color:#fff}',

    /* captions */
    '.cap{padding:8px 11px;border-radius:11px;background:rgba(255,255,255,.05);font-size:13px;line-height:1.4;display:flex;gap:9px}',
    '.cap.live{background:rgba(229,9,20,.16);border:1px solid rgba(229,9,20,.35)}',
    '.cap .t{font-size:10px;color:#8a8a92;font-variant-numeric:tabular-nums;flex:none;padding-top:2px}',
    '.cap.live .t{color:#ff8b92}',

    /* notes */
    '.note{padding:10px 11px;border-radius:11px;background:rgba(255,255,255,.05);display:flex;gap:9px;align-items:flex-start}',
    '.note .jump{border:0;background:rgba(229,9,20,.25);color:#fff;font-size:10px;font-weight:700;font-variant-numeric:tabular-nums;padding:3px 7px;border-radius:7px;cursor:pointer;flex:none}',
    '.note .txt{font-size:13px;line-height:1.4;flex:1;min-width:0;word-wrap:break-word}',
    '.note .del{border:0;background:transparent;color:#77777f;cursor:pointer;font-size:14px;flex:none}',
    '.note .del:hover{color:#ff5661}',
    '.empty{color:#7a7a82;font-size:12.5px;text-align:center;padding:26px 10px;line-height:1.5}',

    /* composer */
    '.foot{flex:none;padding:10px 12px;border-top:1px solid rgba(255,255,255,.08);display:flex;gap:8px;align-items:flex-end}',
    '.foot textarea{flex:1;resize:none;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;',
    'border-radius:13px;padding:9px 12px;font-size:13.5px;line-height:1.35;max-height:96px;outline:none;font-family:inherit}',
    '.foot textarea:focus{border-color:rgba(229,9,20,.6)}',
    '.foot textarea::placeholder{color:#7a7a82}',
    '.foot .send{width:38px;height:38px;flex:none;border:0;border-radius:50%;background:#e50914;color:#fff;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center}',
    '.foot .send:hover{background:#f6121d}.foot .send:disabled{opacity:.4;cursor:default}',
    '.stamp{align-self:flex-start;font-size:11px;color:#8a8a92;padding:2px 2px 8px;font-variant-numeric:tabular-nums}'
  ].join('');

  var ICON_BUBBLE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>' +
    '<line x1="8" y1="10" x2="13" y2="10"/><line x1="8" y1="13.5" x2="15.5" y2="13.5"/></svg>';

  /* ------------------------------------------------------- offline brain */
  // A self-contained, context-aware responder so Zinga works with zero setup.
  // Swap in `responder` at mount time to route to a real LLM (see README).
  function offlineBrain(text, ctx) {
    var q = text.toLowerCase();
    var at = ctx.clock ? ' (around ' + ctx.clock + ')' : '';
    var recent = (ctx.recentCaptions || []).slice(-3).map(function (c) { return '“' + c.text + '”'; }).join(' ');
    var show = ctx.title || 'this title';

    function pick(a) { return a[Math.floor((ctx.seed || 0.5) * a.length) % a.length]; }

    if (/recap|catch me up|what.*(happen|miss|going on)|remind|lost|confus/.test(q)) {
      return 'Quick recap up to ' + (ctx.clock || 'now') + ' in **' + show + '**: the last beats on screen were ' +
        (recent || 'a quiet, dialogue-light stretch') + '. Nothing you can\'t pick back up — hit ▸ and keep rolling.';
    }
    if (/who.*(is|that|are)|character|actor|play|cast/.test(q)) {
      return 'That\'s a returning face for this arc' + at + '. I can\'t spoil where they land, but keep an eye on how they react in this scene — it pays off.';
    }
    if (/what.*(say|said|line|subtitle|caption)/.test(q)) {
      return recent ? 'The last lines were ' + recent + '. Want me to keep a running transcript in the Captions tab?'
        : 'No dialogue in the last few seconds — it\'s playing on the visuals right now.';
    }
    if (/note|remember|bookmark|save|mark/.test(q)) {
      return 'Done — anything you type here I can pin to the exact timestamp. Try the Notes tab, or say "note: <your thought>" and I\'ll stamp it at ' + (ctx.clock || '0:00') + '.';
    }
    if (/spoil|ending|end|die|dies|twist/.test(q)) {
      return 'Spoiler-safe mode is on 🔒 — I won\'t jump ahead of where you are' + at + '. Ask me about anything already on screen and I\'m an open book.';
    }
    if (/theor|predict|think.*happen|next/.test(q)) {
      return pick([
        'Reading the scene' + at + ': the show is planting something here. Watch the object the camera lingers on — that\'s the setup.',
        'My hunch' + at + ' — this quiet moment is the calm before a reversal. The stakes usually spike right after a beat like this.'
      ]);
    }
    if (/hi|hello|hey|yo\b|sup/.test(q)) {
      return 'Hey 👋 I\'m Zinga, riding along with **' + show + '**' + at + '. Ask me to recap, explain a character, or drop a note — I\'ll stay out of your way otherwise.';
    }
    if (/thank|nice|cool|great|love/.test(q)) {
      return 'Anytime. I\'ll be right here on the edge of your screen 🎬';
    }
    return pick([
      'Good question' + at + '. Here\'s what I can tell from the scene so far: ' + (recent || 'it\'s carrying tension through visuals more than dialogue') + '. Want a recap or a prediction?',
      'I\'m watching **' + show + '** with you' + at + '. I can recap what you missed, unpack a character, or pin a note to this exact moment — what would help?'
    ]);
  }

  /* --------------------------------------------------------------- Zinga */

  function Zinga(opts) {
    opts = opts || {};
    this.opts = opts;
    this.player = opts.player || null;
    this.title = opts.title || (this.player && this.player.title) || 'Now Playing';
    this.subtitle = opts.subtitle || 'Zinga companion';
    this.responder = opts.responder || offlineBrain;
    this.key = slug(opts.storageKey || this.title);

    this.open = false;
    this.activeTab = 'chat';
    this.captions = [];        // full caption log {t, text}
    this.liveCaptionEl = null;
    this.unread = 0;

    this.chat = load('chat:' + this.key, null) || [
      { role: 'ai', text: 'Hi — I\'m **Zinga**, your watch companion. I\'m following along with what\'s on screen. Ask me to recap a scene, explain who someone is, or pin a note to this exact moment.', ts: Date.now() }
    ];
    this.notes = load('notes:' + this.key, []);

    this._build();
    this._wirePlayer();
    this._restoreDock();
  }

  Zinga.prototype._build = function () {
    var self = this;
    var host = el('div');
    host.setAttribute('data-zinga', '');
    document.body.appendChild(host);
    var shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    this.shadow = shadow;

    var style = el('style'); style.textContent = CSS; shadow.appendChild(style);
    var root = el('div', 'root'); shadow.appendChild(root);
    this.rootEl = root;

    /* bubble */
    var bubble = el('div', 'bubble pulse');
    bubble.innerHTML = ICON_BUBBLE + '<span class="badge"></span>';
    bubble.setAttribute('role', 'button');
    bubble.setAttribute('aria-label', 'Open Zinga companion');
    root.appendChild(bubble);
    this.bubbleEl = bubble;
    this.badgeEl = bubble.querySelector('.badge');

    /* panel */
    var panel = el('div', 'panel');
    panel.innerHTML =
      '<div class="hd"><span class="dot"></span><div class="tt">' + escapeHtml(this.title) +
      '<small>' + escapeHtml(this.subtitle) + '</small></div>' +
      '<button class="x" aria-label="Close">✕</button></div>' +
      '<div class="tabs">' +
      '<button class="tab active" data-tab="chat">💬 Companion</button>' +
      '<button class="tab" data-tab="caps">📝 Captions</button>' +
      '<button class="tab" data-tab="notes">📌 Notes <span class="c" data-notecount>0</span></button>' +
      '</div>' +
      '<div class="body">' +
      '<div class="view active" data-view="chat"></div>' +
      '<div class="view" data-view="caps"></div>' +
      '<div class="view" data-view="notes"></div>' +
      '</div>' +
      '<div class="foot"><textarea rows="1" placeholder="Ask about the scene…"></textarea>' +
      '<button class="send" aria-label="Send">➤</button></div>';
    root.appendChild(panel);
    this.panelEl = panel;
    this.chatView = panel.querySelector('[data-view="chat"]');
    this.capsView = panel.querySelector('[data-view="caps"]');
    this.notesView = panel.querySelector('[data-view="notes"]');
    this.inputEl = panel.querySelector('textarea');
    this.sendEl = panel.querySelector('.send');
    this.noteCountEl = panel.querySelector('[data-notecount]');

    /* events */
    bubble.addEventListener('click', function (e) { if (!self._dragged) self.toggle(); });
    panel.querySelector('.x').addEventListener('click', function () { self.toggle(false); });
    panel.querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () { self._setTab(t.getAttribute('data-tab')); });
    });
    this.sendEl.addEventListener('click', function () { self._submit(); });
    this.inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); self._submit(); }
    });
    this.inputEl.addEventListener('input', function () {
      self.inputEl.style.height = 'auto';
      self.inputEl.style.height = Math.min(96, self.inputEl.scrollHeight) + 'px';
    });

    this._enableDrag();
    this._renderChat();
    this._renderNotes();
    this._renderCaptions();

    window.addEventListener('resize', function () { self._reposition(); });
  };

  /* ------------------------------------------------------- drag + docking */

  Zinga.prototype._enableDrag = function () {
    var self = this, b = this.bubbleEl;
    var startX, startY, ox, oy, moved;

    function down(e) {
      var p = point(e);
      var r = b.getBoundingClientRect();
      startX = p.x; startY = p.y; ox = r.left; oy = r.top; moved = false;
      self._dragged = false;
      b.classList.add('dragging'); b.classList.remove('pulse');
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
      document.addEventListener('touchmove', move, { passive: false }); document.addEventListener('touchend', up);
      e.preventDefault();
    }
    function move(e) {
      var p = point(e);
      var dx = p.x - startX, dy = p.y - startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) { moved = true; self._dragged = true; }
      var w = window.innerWidth, h = window.innerHeight, s = b.offsetWidth;
      b.style.left = clamp(ox + dx, SNAP_MARGIN, w - s - SNAP_MARGIN) + 'px';
      b.style.top = clamp(oy + dy, SNAP_MARGIN, h - s - SNAP_MARGIN) + 'px';
      b.style.right = 'auto'; b.style.bottom = 'auto';
      if (e.cancelable) e.preventDefault();
    }
    function up() {
      b.classList.remove('dragging');
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
      document.removeEventListener('touchmove', move); document.removeEventListener('touchend', up);
      if (moved) self._snap();
      setTimeout(function () { self._dragged = false; }, 40);
    }
    b.addEventListener('mousedown', down);
    b.addEventListener('touchstart', down, { passive: false });
  };

  Zinga.prototype._snap = function () {
    // snap bubble to nearest horizontal edge, remember dock
    var b = this.bubbleEl, r = b.getBoundingClientRect();
    var w = window.innerWidth, s = b.offsetWidth;
    var toRight = (r.left + s / 2) > w / 2;
    var top = clamp(r.top, SNAP_MARGIN, window.innerHeight - s - SNAP_MARGIN);
    b.style.transition = 'left .22s cubic-bezier(.2,.8,.2,1), top .22s';
    b.style.top = top + 'px';
    if (toRight) { b.style.left = 'auto'; b.style.right = SNAP_MARGIN + 'px'; }
    else { b.style.right = 'auto'; b.style.left = SNAP_MARGIN + 'px'; }
    var self = this;
    setTimeout(function () { b.style.transition = ''; }, 240);
    this.dock = { side: toRight ? 'right' : 'left', top: top };
    save('dock:' + this.key, this.dock);
    if (this.open) this._reposition();
  };

  Zinga.prototype._restoreDock = function () {
    var d = load('dock:' + this.key, null);
    var b = this.bubbleEl, s = 56;
    if (d) {
      this.dock = d;
      b.style.top = clamp(d.top, SNAP_MARGIN, window.innerHeight - s - SNAP_MARGIN) + 'px';
      if (d.side === 'left') { b.style.left = SNAP_MARGIN + 'px'; b.style.right = 'auto'; }
      else { b.style.right = SNAP_MARGIN + 'px'; b.style.left = 'auto'; }
    } else {
      this.dock = { side: 'right', top: Math.round(window.innerHeight * 0.32) };
      b.style.right = SNAP_MARGIN + 'px';
      b.style.top = this.dock.top + 'px';
    }
  };

  Zinga.prototype._reposition = function () {
    if (!this.open) return;
    var b = this.bubbleEl.getBoundingClientRect();
    var p = this.panelEl, pw = p.offsetWidth, ph = p.offsetHeight;
    var w = window.innerWidth, h = window.innerHeight, gap = 12;
    var right = (this.dock && this.dock.side === 'right');
    var left = right ? clamp(b.left - pw - gap, gap, w - pw - gap) : clamp(b.right + gap, gap, w - pw - gap);
    var top = clamp(b.top + b.height / 2 - ph / 2, gap, h - ph - gap);
    p.style.left = left + 'px';
    p.style.top = top + 'px';
    p.style.right = 'auto'; p.style.bottom = 'auto';
  };

  /* ------------------------------------------------------- open / tabs */

  Zinga.prototype.toggle = function (force) {
    var self = this;
    this.open = (force == null) ? !this.open : force;
    if (this.open) {
      this.panelEl.classList.add('open');
      this._reposition();
      requestAnimationFrame(function () { self.panelEl.classList.add('shown'); });
      this.bubbleEl.classList.remove('pulse');
      this.unread = 0; this._updateBadge();
      setTimeout(function () { self.inputEl.focus(); self._scrollChat(); }, 60);
    } else {
      this.panelEl.classList.remove('shown');
      setTimeout(function () { self.panelEl.classList.remove('open'); }, 200);
    }
  };

  Zinga.prototype._setTab = function (name) {
    this.activeTab = name;
    var map = { chat: 'chat', caps: 'caps', notes: 'notes' };
    this.shadow.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-tab') === name);
    });
    this.shadow.querySelectorAll('.view').forEach(function (v) {
      v.classList.toggle('active', v.getAttribute('data-view') === map[name]);
    });
    this.inputEl.placeholder = name === 'notes' ? 'Add a note at this moment…' : 'Ask about the scene…';
    if (name === 'chat') this._scrollChat();
    if (name === 'caps') this._scrollCaps();
  };

  Zinga.prototype._updateBadge = function () {
    if (this.unread > 0) { this.badgeEl.textContent = this.unread > 9 ? '9+' : this.unread; this.badgeEl.classList.add('on'); }
    else this.badgeEl.classList.remove('on');
  };

  /* ------------------------------------------------------------ chat */

  Zinga.prototype._renderChat = function () {
    var self = this;
    this.chatView.innerHTML = '';
    this.chat.forEach(function (m) { self.chatView.appendChild(self._msgEl(m)); });
    // suggestion chips after the last AI turn
    if (this.chat.length && this.chat[this.chat.length - 1].role === 'ai') {
      var chips = el('div', 'chips');
      ['Recap what I missed', 'Who is that?', 'No spoilers 🔒', 'Pin a note here'].forEach(function (label) {
        var c = el('button', 'chip', label);
        c.addEventListener('click', function () {
          if (/pin a note/i.test(label)) { self._setTab('notes'); self.inputEl.focus(); return; }
          self.inputEl.value = label; self._submit();
        });
        chips.appendChild(c);
      });
      this.chatView.appendChild(chips);
    }
    this._scrollChat();
  };

  Zinga.prototype._msgEl = function (m) {
    var d = el('div', 'msg ' + (m.role === 'me' ? 'me' : 'ai'));
    d.innerHTML = mdInline(m.text) + '<span class="ts">' + timeAgo(m.ts) + '</span>';
    return d;
  };

  Zinga.prototype._scrollChat = function () {
    var b = this.shadow.querySelector('.body');
    if (b) b.scrollTop = b.scrollHeight;
  };

  Zinga.prototype._submit = function () {
    var text = (this.inputEl.value || '').trim();
    if (!text) return;
    this.inputEl.value = '';
    this.inputEl.style.height = 'auto';

    // "note: ..." shorthand pins a timestamped note
    var noteMatch = text.match(/^note:?\s+(.+)/i);
    if (this.activeTab === 'notes' || noteMatch) {
      this.addNote(noteMatch ? noteMatch[1] : text);
      if (this.activeTab !== 'notes') this._setTab('notes');
      return;
    }

    var me = { role: 'me', text: text, ts: Date.now() };
    this.chat.push(me);
    this._persistChat();
    this._renderChat();
    this._respond(text);
  };

  Zinga.prototype._respond = function (text) {
    var self = this;
    // typing indicator
    var typing = el('div', 'typing'); typing.innerHTML = '<span></span><span></span><span></span>';
    this.chatView.appendChild(typing); this._scrollChat();

    var ctx = this._context();
    Promise.resolve()
      .then(function () { return self.responder(text, ctx); })
      .then(function (reply) {
        return new Promise(function (res) {
          var delay = clamp(400 + String(reply || '').length * 9, 500, 1700);
          setTimeout(function () { res(reply); }, delay);
        });
      })
      .then(function (reply) {
        typing.remove();
        var m = { role: 'ai', text: String(reply || 'I\'m here.'), ts: Date.now() };
        self.chat.push(m); self._persistChat(); self._renderChat();
        if (!self.open) { self.unread++; self._updateBadge(); self.bubbleEl.classList.add('pulse'); }
      })
      .catch(function () {
        typing.remove();
        self.chat.push({ role: 'ai', text: 'I lost my connection to the scene for a second — try that again?', ts: Date.now() });
        self._persistChat(); self._renderChat();
      });
  };

  Zinga.prototype._context = function () {
    var t = this.player && this.player.currentTime ? this.player.currentTime() : 0;
    return {
      title: this.title,
      time: t,
      clock: fmtClock(t),
      recentCaptions: this.captions.slice(-6),
      seed: (t % 7) / 7 || Math.min(0.99, (this.chat.length % 5) / 5)
    };
  };

  Zinga.prototype._persistChat = function () {
    // keep storage bounded
    var trimmed = this.chat.slice(-60);
    this.chat = trimmed;
    save('chat:' + this.key, trimmed);
  };

  /* ---------------------------------------------------------- captions */

  Zinga.prototype.pushCaption = function (text, t) {
    if (!text) return;
    t = (t == null && this.player) ? this.player.currentTime() : (t || 0);
    var c = { t: t, text: text };
    this.captions.push(c);
    if (this.captions.length > 300) this.captions.shift();
    this._renderCaptions(true);
  };

  Zinga.prototype._renderCaptions = function (justLive) {
    if (!this.capsView) return;
    var self = this;
    this.capsView.innerHTML = '';
    if (!this.captions.length) {
      this.capsView.appendChild(el('div', 'empty', 'Live captions from what you\'re watching will stream in here, timestamped so you can scroll back.'));
      return;
    }
    this.captions.slice(-40).forEach(function (c, i, arr) {
      var isLive = (i === arr.length - 1);
      var row = el('div', 'cap' + (isLive ? ' live' : ''));
      row.appendChild(el('span', 't', fmtClock(c.t)));
      row.appendChild(el('span', null, c.text));   // textContent — safe from injection
      self.capsView.appendChild(row);
    });
    if (this.activeTab === 'caps') this._scrollCaps();
  };

  Zinga.prototype._scrollCaps = function () {
    var b = this.shadow.querySelector('.body');
    if (b && this.activeTab === 'caps') b.scrollTop = b.scrollHeight;
  };

  /* ------------------------------------------------------------- notes */

  Zinga.prototype.addNote = function (text) {
    text = (text || '').trim();
    if (!text) return;
    var t = this.player ? this.player.currentTime() : 0;
    this.notes.push({ t: t, text: text, ts: Date.now() });
    this.notes.sort(function (a, b) { return a.t - b.t; });
    save('notes:' + this.key, this.notes);
    this._renderNotes();
    this._flash('📌 Pinned at ' + fmtClock(t));
  };

  Zinga.prototype._renderNotes = function () {
    var self = this;
    this.noteCountEl.textContent = this.notes.length;
    this.notesView.innerHTML = '';
    if (!this.notes.length) {
      this.notesView.appendChild(el('div', 'empty', 'No notes yet. Pin a thought to the exact second you\'re watching — jump back to it anytime.'));
      return;
    }
    this.notes.forEach(function (n, i) {
      var row = el('div', 'note');
      var jump = el('button', 'jump', fmtClock(n.t));
      jump.title = 'Jump to ' + fmtClock(n.t);
      jump.addEventListener('click', function () {
        if (self.player && self.player.seek) { self.player.seek(n.t); self._flash('↪ Jumped to ' + fmtClock(n.t)); }
      });
      var txt = el('div', 'txt', n.text);
      var del = el('button', 'del', '✕');
      del.addEventListener('click', function () {
        self.notes.splice(i, 1); save('notes:' + self.key, self.notes); self._renderNotes();
      });
      row.appendChild(jump); row.appendChild(txt); row.appendChild(del);
      self.notesView.appendChild(row);
    });
  };

  Zinga.prototype._flash = function (text) {
    // lightweight toast inside the shadow root
    var t = el('div', null, text);
    t.style.cssText = 'position:absolute;left:50%;bottom:70px;transform:translateX(-50%);' +
      'background:rgba(20,20,24,.94);color:#fff;font-size:12.5px;padding:8px 14px;border-radius:20px;' +
      'border:1px solid rgba(255,255,255,.14);pointer-events:none;z-index:9;opacity:0;transition:opacity .2s,transform .2s';
    this.rootEl.appendChild(t);
    requestAnimationFrame(function () { t.style.opacity = '1'; t.style.transform = 'translateX(-50%) translateY(-4px)'; });
    setTimeout(function () { t.style.opacity = '0'; setTimeout(function () { t.remove(); }, 220); }, 1500);
  };

  /* ------------------------------------------------------- player hookup */

  Zinga.prototype._wirePlayer = function () {
    var self = this;
    if (!this.player) return;
    if (this.player.onCaption) this.player.onCaption(function (text, t) { self.pushCaption(text, t); });
    if (this.player.onTitle) this.player.onTitle(function (title) {
      self.title = title;
      var tt = self.shadow.querySelector('.hd .tt');
      if (tt) tt.firstChild.textContent = title;
    });
  };

  /* ---------------------------------------------------------- helpers */

  function point(e) {
    if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function mdInline(s) {
    return escapeHtml(s)
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\n/g, '<br>');
  }
  function timeAgo(ts) {
    if (!ts) return '';
    var d = Math.floor((Date.now() - ts) / 1000);
    if (d < 8) return 'now';
    if (d < 60) return d + 's ago';
    if (d < 3600) return Math.floor(d / 60) + 'm ago';
    return Math.floor(d / 3600) + 'h ago';
  }

  /* ------------------------------------------------------------- API */

  var api = {
    mount: function (opts) { return new Zinga(opts); },
    version: '1.0.0'
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.Zinga = api;

})(typeof window !== 'undefined' ? window : this);
