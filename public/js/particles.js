/* IronWeb 动态粒子背景（亮色主题适配，电脑/手机通用，低功耗） */
'use strict';
(function () {
  if (window.__ironParticles) return;
  window.__ironParticles = true;

  var canvas = document.createElement('canvas');
  canvas.id = 'fxCanvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(canvas, document.body.firstChild);

  var ctx = canvas.getContext('2d');
  var W = 0, H = 0, dots = [], raf = 0, running = true;

  var COLORS = ['#e8890c', '#7d8da0', '#d9a441', '#5b8def'];
  var LINK = 'rgba(232,137,12,0.14)';

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.width = Math.floor(window.innerWidth * dpr);
    H = canvas.height = Math.floor(window.innerHeight * dpr);
    var n = window.innerWidth < 600 ? 36 : (window.innerWidth < 1100 ? 55 : 75);
    dots = [];
    for (var i = 0; i < n; i++) {
      dots.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.32 * dpr,
        vy: (Math.random() - 0.5) * 0.32 * dpr,
        r: (Math.random() * 1.7 + 0.7) * dpr,
        c: COLORS[Math.floor(Math.random() * COLORS.length)]
      });
    }
  }

  function step() {
    ctx.clearRect(0, 0, W, H);
    var maxD = 130 * Math.min(window.devicePixelRatio || 1, 2);
    for (var i = 0; i < dots.length; i++) {
      var d = dots[i];
      d.x += d.vx; d.y += d.vy;
      if (d.x < 0 || d.x > W) d.vx *= -1;
      if (d.y < 0 || d.y > H) d.vy *= -1;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = d.c;
      ctx.globalAlpha = 0.5;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
    for (var a = 0; a < dots.length; a++) {
      for (var b = a + 1; b < dots.length; b++) {
        var p1 = dots[a], p2 = dots[b];
        var dx = p1.x - p2.x, dy = p1.y - p2.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < maxD) {
          ctx.strokeStyle = LINK;
          ctx.globalAlpha = (1 - dist / maxD) * 0.55;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(step);
  }

  function stop() { running = false; cancelAnimationFrame(raf); }
  function start() { if (running) return; running = true; step(); }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(); else start();
  });
  window.addEventListener('resize', resize);
  resize();
  step();
})();
