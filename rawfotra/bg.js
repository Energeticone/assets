/* RAWFOTRA cosmos — a DPR-aware starfield behind the app.
 * Stars drift and twinkle slowly; a few warm gold dust motes float upward.
 * Static (one painted frame) when the user prefers reduced motion, and the
 * animation loop pauses whenever the tab is hidden.
 */
(function () {
  "use strict";
  var canvas = document.getElementById("bgStars");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  var stars = [], motes = [], W = 0, H = 0, DPR = 1, raf = 0, t = 0;

  function build() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    var starCount = Math.min(320, Math.round((W * H) / 4200));
    stars = [];
    for (var i = 0; i < starCount; i++) {
      var warm = Math.random() < 0.28; // a share of champagne-gold stars
      stars.push({
        x: Math.random() * W, y: Math.random() * H,
        r: 0.4 + Math.random() * 1.3,
        base: 0.25 + Math.random() * 0.6,
        tw: 0.5 + Math.random() * 2.2,     // twinkle speed
        ph: Math.random() * Math.PI * 2,   // twinkle phase
        vx: -0.008 - Math.random() * 0.02, // slow leftward drift
        warm: warm,
      });
    }
    motes = [];
    for (var j = 0; j < 26; j++) {
      motes.push({
        x: Math.random() * W, y: Math.random() * H,
        r: 0.6 + Math.random() * 1.6,
        a: 0.05 + Math.random() * 0.16,
        vy: -0.03 - Math.random() * 0.07,  // float upward
        vx: (Math.random() - 0.5) * 0.03,
      });
    }
  }

  function paint(time) {
    t = time || 0;
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var a = s.base * (0.55 + 0.45 * Math.sin(s.ph + t * 0.001 * s.tw));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, 6.2832);
      ctx.fillStyle = s.warm
        ? "rgba(240, 214, 150, " + a.toFixed(3) + ")"
        : "rgba(214, 228, 236, " + a.toFixed(3) + ")";
      ctx.fill();
      s.x += s.vx;
      if (s.x < -2) { s.x = W + 2; s.y = Math.random() * H; }
    }
    for (var k = 0; k < motes.length; k++) {
      var m = motes[k];
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, 6.2832);
      ctx.fillStyle = "rgba(233, 198, 124, " + m.a.toFixed(3) + ")";
      ctx.fill();
      m.x += m.vx; m.y += m.vy;
      if (m.y < -3) { m.y = H + 3; m.x = Math.random() * W; }
    }
  }

  function loop(time) {
    paint(time);
    raf = requestAnimationFrame(loop);
  }
  function start() { if (!raf && !reduced) raf = requestAnimationFrame(loop); }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  var resizeTimer = 0;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { build(); if (reduced) paint(0); }, 150);
  });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop(); else start();
  });

  build();
  if (reduced) paint(0); else start();

  // Hero readout clock — a live UTC timestamp, Futurekäst-style.
  var clock = document.getElementById("utcClock");
  if (clock) {
    var two = function (n) { return (n < 10 ? "0" : "") + n; };
    var tick = function () {
      var d = new Date();
      clock.textContent = two(d.getUTCHours()) + ":" + two(d.getUTCMinutes()) + ":" + two(d.getUTCSeconds()) + " UTC";
    };
    tick();
    setInterval(tick, 1000);
  }
})();
