/*
 * Demo streaming player. Provides a PlayerAdapter that Zinga rides on top of:
 *   { title, currentTime(), seek(t), onCaption(cb), onTitle(cb) }
 *
 * There is no real video file — the "scene" is a CSS cinematic and a scripted
 * caption track. Playback advances a clock; as it crosses each cue, the line is
 * burned into the picture AND streamed to Zinga so the companion has real,
 * timestamped context to talk about.
 */
(function () {
  'use strict';

  var DURATION = 47 * 60 + 12;   // 47:12 episode; "43:xx remaining" in the demo
  var START_AT = DURATION - (43 * 60 + 32); // begin near the point shown in the reference

  // Scripted caption track for the demo episode — S1:E7 "Witness".
  // times are absolute seconds into the episode.
  var CAPTIONS = [
    [START_AT + 2,  "You saw what happened that night, didn't you?"],
    [START_AT + 7,  "I didn't see anything. I told the detectives that."],
    [START_AT + 13, "Then why are your hands still shaking, Mara?"],
    [START_AT + 20, "(distant siren wailing)"],
    [START_AT + 26, "They know you were on the platform at 11:40."],
    [START_AT + 33, "The cameras were down. Everyone knows the cameras were down."],
    [START_AT + 40, "Not all of them."],
    [START_AT + 47, "(train rumbling past)"],
    [START_AT + 55, "There's a witness. And right now, it's just you and me who know that."],
    [START_AT + 63, "What do you want from me?"],
    [START_AT + 69, "The truth. Before he finds you first."],
    [START_AT + 77, "(phone buzzing on the table)"],
    [START_AT + 84, "Don't answer that."],
    [START_AT + 90, "It's him, isn't it."],
    [START_AT + 97, "Whatever you do — do not tell him you talked to me."]
  ];

  var scene = document.querySelector('.scene');
  var stage = document.querySelector('.stage');
  var burn = document.querySelector('.subtitle-burn');
  var controls = document.querySelector('.controls');
  var fillEl = document.querySelector('.track .fill');
  var bufEl = document.querySelector('.track .buf');
  var knobEl = document.querySelector('.track .knob');
  var trackEl = document.querySelector('.track');
  var remainEl = document.querySelector('.remain');
  var playIcon = document.getElementById('playIcon');
  var epTitleEl = document.querySelector('.epinfo .t');

  var time = START_AT;
  var playing = false;
  var speed = 1;
  var lastTick = null;
  var firedIndex = -1;
  var captionCbs = [];
  var titleCbs = [];
  var burnTimer = null;

  var ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  var ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';

  /* ---------------------------------------------------------- clock loop */
  function loop(ts) {
    if (lastTick == null) lastTick = ts;
    var dt = (ts - lastTick) / 1000;
    lastTick = ts;
    if (playing) {
      time = Math.min(DURATION, time + dt * speed);
      fireCaptions();
      if (time >= DURATION) pause();
    }
    render();
    requestAnimationFrame(loop);
  }

  function fireCaptions() {
    for (var i = 0; i < CAPTIONS.length; i++) {
      if (CAPTIONS[i][0] <= time && i > firedIndex) {
        firedIndex = i;
        emitCaption(CAPTIONS[i][1], CAPTIONS[i][0]);
      }
    }
  }

  function emitCaption(text, t) {
    showBurn(text);
    captionCbs.forEach(function (cb) { try { cb(text, t); } catch (e) {} });
  }

  function showBurn(text) {
    burn.textContent = text;
    burn.classList.add('on');
    clearTimeout(burnTimer);
    burnTimer = setTimeout(function () { burn.classList.remove('on'); }, 5200 / speed);
  }

  /* ------------------------------------------------------------ render */
  function render() {
    var pct = (time / DURATION) * 100;
    fillEl.style.width = pct + '%';
    knobEl.style.left = pct + '%';
    var buffered = Math.min(100, pct + 12 + 6 * Math.sin(time / 5));
    bufEl.style.width = buffered + '%';
    remainEl.textContent = fmt(DURATION - time);
  }

  function fmt(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* --------------------------------------------------------- transport */
  function play() {
    playing = true; lastTick = null;
    playIcon.innerHTML = ICON_PAUSE;
    scene.classList.remove('paused');
    scheduleHide();
  }
  function pause() {
    playing = false;
    playIcon.innerHTML = ICON_PLAY;
    scene.classList.add('paused');
    showControls();
  }
  function toggle() { playing ? pause() : play(); }

  function seek(t) {
    time = Math.max(0, Math.min(DURATION, t));
    // recompute which captions have already "played"
    firedIndex = -1;
    for (var i = 0; i < CAPTIONS.length; i++) if (CAPTIONS[i][0] <= time) firedIndex = i;
    render();
    showControls();
  }
  function nudge(d) { seek(time + d); }

  /* --------------------------------------------- auto-hide the controls */
  var hideTimer = null;
  function showControls() { controls.classList.remove('hidden'); scheduleHide(); }
  function scheduleHide() {
    clearTimeout(hideTimer);
    if (!playing) return;
    hideTimer = setTimeout(function () { controls.classList.add('hidden'); }, 3200);
  }

  /* ---------------------------------------------------------- wiring UI */
  document.getElementById('playBtn').addEventListener('click', function (e) { e.stopPropagation(); toggle(); });
  document.getElementById('back10').addEventListener('click', function (e) { e.stopPropagation(); nudge(-10); });
  document.getElementById('fwd10').addEventListener('click', function (e) { e.stopPropagation(); nudge(10); });

  document.querySelector('.player').addEventListener('click', function (e) {
    // tapping the picture toggles the controls (not while interacting with a control)
    if (e.target.closest('.topbar,.center,.bottom,.brightness,.menu,.skip,[data-zinga]')) return;
    if (controls.classList.contains('hidden')) showControls();
    else if (playing) controls.classList.add('hidden');
  });

  trackEl.addEventListener('click', function (e) {
    var r = trackEl.getBoundingClientRect();
    seek(((e.clientX - r.left) / r.width) * DURATION);
  });

  // brightness
  document.getElementById('bright').addEventListener('input', function (e) {
    stage.style.setProperty('--bright', (0.35 + e.target.value / 100 * 0.9).toFixed(2));
  });

  // speed menu
  var speedBtn = document.getElementById('speedBtn');
  var speedMenu = document.getElementById('speedMenu');
  speedBtn.addEventListener('click', function (e) { e.stopPropagation(); speedMenu.classList.toggle('on'); });
  speedMenu.querySelectorAll('button').forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      speed = parseFloat(b.dataset.speed);
      speedMenu.querySelectorAll('button').forEach(function (x) { x.classList.remove('sel'); });
      b.classList.add('sel');
      document.getElementById('speedLabel').textContent = 'Speed (' + b.textContent.trim() + ')';
      speedMenu.classList.remove('on');
    });
  });
  document.addEventListener('click', function () { speedMenu.classList.remove('on'); });

  // skip intro (demo: jumps forward 25s)
  var skip = document.getElementById('skip');
  skip.addEventListener('click', function (e) { e.stopPropagation(); nudge(25); skip.classList.add('gone'); });

  // fullscreen
  document.getElementById('fsBtn').addEventListener('click', function (e) {
    e.stopPropagation();
    var d = document;
    if (!d.fullscreenElement) (d.documentElement.requestFullscreen || function(){})();
    else (d.exitFullscreen || function(){})();
  });

  // close button — surface a friendly note instead of leaving
  document.getElementById('closeBtn').addEventListener('click', function (e) {
    e.stopPropagation();
    window.location.href = 'index.html';
  });

  // keyboard niceties
  document.addEventListener('keydown', function (e) {
    if (e.target.closest && e.target.closest('[data-zinga]')) return; // don't hijack Zinga input
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    else if (e.code === 'ArrowLeft') nudge(-10);
    else if (e.code === 'ArrowRight') nudge(10);
  });

  /* -------------------------------------------------- the PlayerAdapter */
  var adapter = {
    title: 'S1:E7 "Witness"',
    currentTime: function () { return time; },
    duration: function () { return DURATION; },
    seek: function (t) { seek(t); play(); },
    isPlaying: function () { return playing; },
    onCaption: function (cb) { captionCbs.push(cb); },
    onTitle: function (cb) { titleCbs.push(cb); },
    // let Zinga (or anything) ask the player to pause, e.g. during a deep chat
    pause: pause,
    play: play
  };
  window.DemoPlayer = adapter;

  /* ----------------------------------------------------------- kick off */
  render();
  requestAnimationFrame(loop);
  // gentle auto-start so captions begin flowing for the companion demo
  setTimeout(play, 900);

  // first-run hint pointing at the Zinga bubble
  if (!localStorage.getItem('zinga:hint-seen')) {
    var hint = document.getElementById('hint');
    setTimeout(function () { hint.classList.add('on'); }, 1800);
    setTimeout(function () { hint.classList.remove('on'); }, 8200);
    localStorage.setItem('zinga:hint-seen', '1');
  }
})();
