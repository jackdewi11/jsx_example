import React, { useEffect, useRef, useState } from "react";

export default function Game() {
  const canvasRef = useRef(null);
  const toastRef = useRef(null);
  const rafRef = useRef(null);
  const keysRef = useRef(new Set());
  const pointerRef = useRef({ active: false, offsetX: 0 });

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => Number(localStorage.getItem("dodge_rocks_best_v1") || 0));
  const [runningLabel, setRunningLabel] = useState("Start");
  const [pauseLabel, setPauseLabel] = useState("Pause");
  const [pauseDisabled, setPauseDisabled] = useState(true);

  // mutable state used by game loop
  const stateRef = useRef({
    running: false,
    paused: false,
    gameOver: false,
    time: 0,
    score: 0,
    lastTs: 0,
    spawnTimer: 0,
    rocks: [],
    shake: 0,
  });

  const playerRef = useRef({ x: 0, y: 0, w: 44, h: 22, speed: 520, vx: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    function toast(msg) {
      const el = toastRef.current;
      if (!el) return;
      el.textContent = msg;
      el.style.display = "block";
      clearTimeout(el._t);
      el._t = setTimeout(() => (el.style.display = "none"), 1200);
    }

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function rand(min, max) { return Math.random() * (max - min) + min; }

    function fitCanvasToCSSSize() {
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      const newW = Math.round(cssW * dpr);
      const newH = Math.round(cssH * dpr);
      if (canvas.width !== newW || canvas.height !== newH) {
        canvas.width = newW;
        canvas.height = newH;
      }
    }

    function reset(showToast = false) {
      fitCanvasToCSSSize();
      const s = stateRef.current;
      s.running = false; s.paused = false; s.gameOver = false;
      s.time = 0; s.score = 0; s.lastTs = 0; s.spawnTimer = 0; s.rocks = []; s.shake = 0;
      setScore(0);
      setRunningLabel("Start");
      setPauseLabel("Pause");
      setPauseDisabled(true);

      // player sizing
      const player = playerRef.current;
      player.w = Math.max(36, canvas.width * 0.045);
      player.h = Math.max(18, canvas.height * 0.04);
      player.x = (canvas.width - player.w) / 2;
      player.y = canvas.height - player.h - canvas.height * 0.06;

      if (showToast) toast("Reset!");
      draw();
    }

    function start() {
      reset(false);
      const s = stateRef.current;
      s.running = true; s.paused = false; s.gameOver = false;
      setRunningLabel("Restart");
      setPauseDisabled(false);
      toast("Go!");
      rafRef.current = requestAnimationFrame(loop);
    }

    function togglePause() {
      const s = stateRef.current;
      if (!s.running || s.gameOver) return;
      s.paused = !s.paused;
      setPauseLabel(s.paused ? "Resume" : "Pause");
      toast(s.paused ? "Paused" : "Resumed");
      if (!s.paused) rafRef.current = requestAnimationFrame(loop);
      draw();
    }

    function toggleStartPause() {
      const s = stateRef.current;
      if (!s.running) { start(); return; }
      if (s.gameOver) { start(); return; }
      togglePause();
    }

    function endGame() {
      const s = stateRef.current; s.gameOver = true; s.running = false; setPauseDisabled(true); setPauseLabel("Pause"); toast("Game Over");
      if (s.score > best) { localStorage.setItem("dodge_rocks_best_v1", String(s.score)); setBest(s.score); }
      draw();
    }

    function spawnRock(difficulty) {
      const r = {
        radius: rand(canvas.width * 0.018, canvas.width * 0.032),
        x: rand(0, canvas.width), y: -40,
        vy: rand(140, 210) * (1 + difficulty * 0.12),
        vx: rand(-35, 35), spin: rand(-3, 3), rot: rand(0, Math.PI * 2)
      };
      r.x = clamp(r.x, r.radius, canvas.width - r.radius);
      stateRef.current.rocks.push(r);
    }

    function rectCircleCollide(px, py, pw, ph, cx, cy, cr) {
      const closestX = clamp(cx, px, px + pw);
      const closestY = clamp(cy, py, py + ph);
      const dx = cx - closestX; const dy = cy - closestY;
      return (dx*dx + dy*dy) <= cr*cr;
    }

    function update(dt) {
      const s = stateRef.current;
      const difficulty = Math.min(12, s.time / 8);

      const left = keysRef.current.has("ArrowLeft") || keysRef.current.has("a") || keysRef.current.has("A");
      const right = keysRef.current.has("ArrowRight") || keysRef.current.has("d") || keysRef.current.has("D");
      let dir = 0; if (left) dir -= 1; if (right) dir += 1;

      const player = playerRef.current;
      const speed = (canvas.width / 960) * player.speed;
      if (!pointerRef.current.active) {
        player.vx = dir * speed; player.x += player.vx * dt; player.x = clamp(player.x, 0, canvas.width - player.w);
      }

      const baseInterval = 0.65;
      const interval = Math.max(0.18, baseInterval - difficulty * 0.03);
      s.spawnTimer += dt;
      while (s.spawnTimer >= interval) {
        s.spawnTimer -= interval; spawnRock(difficulty);
        if (difficulty > 4 && Math.random() < 0.18) spawnRock(difficulty);
      }

      for (const rock of s.rocks) {
        rock.vy += (20 + difficulty * 6) * dt; rock.x += rock.vx * dt; rock.y += rock.vy * dt; rock.rot += rock.spin * dt;
        if (rock.x - rock.radius <= 0 || rock.x + rock.radius >= canvas.width) { rock.vx *= -1; rock.x = clamp(rock.x, rock.radius, canvas.width - rock.radius); }
      }

      s.rocks = s.rocks.filter(r => r.y - r.radius < canvas.height + 40);

      for (const rock of s.rocks) {
        if (rectCircleCollide(player.x, player.y, player.w, player.h, rock.x, rock.y, rock.radius)) {
          s.shake = 10; endGame(); return;
        }
      }

      s.time += dt;
      const newScore = Math.floor(s.time * 10 + difficulty * 2);
      if (newScore !== s.score) { s.score = newScore; setScore(newScore); }
      s.shake = Math.max(0, s.shake - 40 * dt);
    }

    function draw() {
      fitCanvasToCSSSize();
      const s = stateRef.current; const player = playerRef.current;
      const shake = s.shake; const sx = shake ? rand(-shake, shake) : 0; const sy = shake ? rand(-shake, shake) : 0;

      ctx.save(); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.translate(sx, sy);
      drawStars();

      ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.moveTo(0, player.y + player.h + canvas.height*0.02); ctx.lineTo(canvas.width, player.y + player.h + canvas.height*0.02);
      ctx.strokeStyle = "rgba(255,120,120,0.18)"; ctx.lineWidth = Math.max(1, canvas.width * 0.0015); ctx.stroke(); ctx.globalAlpha = 1;

      for (const rock of s.rocks) drawRock(rock);
      drawPlayer();

      if (!s.running && !s.gameOver) overlayCenter("Press Start (or Space)\nDodge the rocks!");
      if (s.gameOver) overlayCenter(`Game Over\nScore: ${s.score}\nPress Restart (or Space)`);
      if (s.paused) overlayCenter("Paused\nPress Space to Resume");

      ctx.globalAlpha = 0.8; ctx.font = `${Math.max(12, canvas.width*0.015)}px system-ui, sans-serif`;
      ctx.fillStyle = "rgba(255,220,220,0.9)"; ctx.fillText("Move: ← →  |  Space: Start/Pause", 14, 26); ctx.globalAlpha = 1;
      ctx.restore();
    }

    function drawStars() {
      const count = 70; const t = stateRef.current.time; ctx.save(); ctx.globalAlpha = 0.45;
      for (let i=0;i<count;i++){ const x=(i*137.5)%canvas.width; const y=(i*79.3+(t*12))%canvas.height; const r=(i%3)+0.6; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fillStyle = "rgba(255,150,150,0.7)"; ctx.fill(); }
      ctx.restore();
    }

    function drawRock(rock) {
      ctx.save(); ctx.translate(rock.x, rock.y); ctx.rotate(rock.rot);
      ctx.beginPath(); const pts = 9; for (let i=0;i<pts;i++){ const ang=(i/pts)*Math.PI*2; const wobble=0.78+0.28*Math.sin(i*2.1+rock.rot*0.9); const rr=rock.radius*wobble; const px=Math.cos(ang)*rr; const py=Math.sin(ang)*rr; if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py); }
      ctx.closePath(); ctx.fillStyle = "rgba(190,90,80,0.95)"; ctx.fill(); ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(-rock.radius*0.25,-rock.radius*0.2,rock.radius*0.7,0,Math.PI*2); ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fill(); ctx.globalAlpha = 1; ctx.restore();
    }

    function drawPlayer() {
      ctx.save(); const p = playerRef.current; ctx.translate(p.x, p.y);
      const r = Math.max(8, p.h * 0.55); roundRect(ctx, 0, 0, p.w, p.h, r); ctx.fillStyle = "rgba(255,120,90,0.98)"; ctx.fill();
      ctx.globalAlpha = 0.6; roundRect(ctx, p.w*0.18, p.h*0.18, p.w*0.46, p.h*0.55, r*0.6); ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.fill(); ctx.globalAlpha = 1;
      const wy = p.h * 0.92; ctx.beginPath(); ctx.arc(p.w*0.20, wy, p.h*0.22,0,Math.PI*2); ctx.arc(p.w*0.80, wy, p.h*0.22,0,Math.PI*2); ctx.fillStyle = "rgba(30,12,12,0.95)"; ctx.fill(); ctx.restore();
    }

    function overlayCenter(text) {
      ctx.save(); ctx.globalAlpha = 0.92; ctx.fillStyle = "rgba(0,0,0,0.45)"; const pad = Math.max(18, canvas.width * 0.025); const w = canvas.width * 0.58; const h = canvas.height * 0.30; const x=(canvas.width-w)/2; const y=(canvas.height-h)/2; roundRect(ctx,x,y,w,h,18); ctx.fill(); ctx.globalAlpha = 1; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.font = `700 ${Math.max(18, canvas.width*0.032)}px system-ui, sans-serif`; const lines = String(text).split("\n"); const lineH = Math.max(22, canvas.height * 0.055); const startY = y + h/2 - (lines.length-1)*lineH/2; for (let i=0;i<lines.length;i++){ ctx.fillText(lines[i], canvas.width/2, startY + i*lineH); } ctx.restore();
    }

    function roundRect(c, x, y, w, h, r) { const rr = Math.min(r, w/2, h/2); c.beginPath(); c.moveTo(x+rr,y); c.arcTo(x+w,y,x+w,y+h,rr); c.arcTo(x+w,y+h,x,y+h,rr); c.arcTo(x,y+h,x,y,rr); c.arcTo(x,y,x+w,y,rr); c.closePath(); }

    function loop(ts) {
      const s = stateRef.current; if (!s.running || s.paused) return; if (!s.lastTs) s.lastTs = ts; const dt = Math.min(0.033, (ts - s.lastTs) / 1000); s.lastTs = ts; update(dt); draw(); if (s.running) rafRef.current = requestAnimationFrame(loop);
    }

    // input handlers
    function onKeyDown(e) { if (["ArrowLeft","ArrowRight"," ","Spacebar"].includes(e.key)) e.preventDefault(); keysRef.current.add(e.key); if (e.key === " " || e.key === "Spacebar") toggleStartPause(); }
    function onKeyUp(e) { keysRef.current.delete(e.key); }

    function onPointerDown(e) { canvas.setPointerCapture(e.pointerId); pointerRef.current.active = true; const rect = canvas.getBoundingClientRect(); const cx = (e.clientX - rect.left) * (canvas.width / rect.width); pointerRef.current.offsetX = cx - playerRef.current.x; }
    function onPointerMove(e) { if (!pointerRef.current.active) return; const rect = canvas.getBoundingClientRect(); const cx = (e.clientX - rect.left) * (canvas.width / rect.width); playerRef.current.x = clamp(cx - pointerRef.current.offsetX, 0, canvas.width - playerRef.current.w); }
    function onPointerUp() { pointerRef.current.active = false; }

    // wire global keyboard + custom UI events
    function onStartGameEvent() { start(); }
    function onResetGameEvent() { reset(true); }
    function onTogglePauseGameEvent() { togglePause(); }

    window.addEventListener("keydown", onKeyDown); window.addEventListener("keyup", onKeyUp);
    window.addEventListener('start-game', onStartGameEvent);
    window.addEventListener('reset-game', onResetGameEvent);
    window.addEventListener('toggle-pause-game', onTogglePauseGameEvent);
    canvas.addEventListener("pointerdown", onPointerDown); canvas.addEventListener("pointermove", onPointerMove); canvas.addEventListener("pointerup", onPointerUp); canvas.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("resize", () => { fitCanvasToCSSSize(); draw(); });

    // start idle
    reset(false);

    return () => {
      window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener('start-game', onStartGameEvent);
      window.removeEventListener('reset-game', onResetGameEvent);
      window.removeEventListener('toggle-pause-game', onTogglePauseGameEvent);
      canvas.removeEventListener("pointerdown", onPointerDown); canvas.removeEventListener("pointermove", onPointerMove); canvas.removeEventListener("pointerup", onPointerUp); canvas.removeEventListener("pointercancel", onPointerUp);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [best]);

  // JSX styles (red theme, centered window, unified font, safe padding)
  const styles = `:root { color-scheme: dark; }
  :root{ --pad: 20px; }
  html, body, #root { height: 100%; margin: 0; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #ffecec; background: #12060a; display:flex; align-items:center; justify-content:center; }
  .wrap{ width:100%; max-width:1200px; box-sizing:border-box; padding:var(--pad); display:flex; justify-content:center; align-items:center; height:100vh; }
  .window{ width: min(1100px, 92vw); max-height: calc(100vh - (var(--pad) * 2)); background: linear-gradient(180deg, rgba(20,6,6,0.65), rgba(10,4,4,0.6)); border-radius:12px; box-shadow: 0 20px 60px rgba(0,0,0,0.6); padding:calc(var(--pad) * 0.8); display:flex; flex-direction:column; gap:12px; }
  header{ position:relative; display:flex; align-items:center; justify-content:space-between; gap:12px; }
  .title{ font-weight:800; letter-spacing:0.2px; font-size:18px; display:flex; align-items:center; gap:10px; }
  .pill{ background: rgba(255,77,79,0.06); border:1px solid rgba(255,77,79,0.14); padding:6px 10px; border-radius:999px; font-size:13px; }
  .hud{ display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
  button{ appearance:none; border:1px solid rgba(255,77,79,0.22); background: linear-gradient(180deg, rgba(255,77,79,0.10), rgba(255,77,79,0.04)); color:#ffecec; padding:8px 12px; border-radius:10px; cursor:pointer; font-weight:650; }
  button:hover{ background: linear-gradient(180deg, rgba(255,77,79,0.14), rgba(255,77,79,0.06)); }
  .canvasWrap{ flex:1; display:flex; align-items:center; justify-content:center; }
  canvas{ width:100%; height:auto; max-height: calc(100vh - 220px); background: radial-gradient(1200px 600px at 60% 0%, rgba(255,77,79,0.16), transparent 60%), linear-gradient(180deg, rgba(255,120,120,0.02), rgba(255,120,120,0.00)); border-radius:8px; box-shadow:0 18px 45px rgba(0,0,0,0.45); display:block; }
  .help{ margin-top:6px; display:flex; justify-content:space-between; gap:10px; font-size:13px; opacity:0.85; line-height:1.35; }
  .kbd{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
  .muted{ opacity:0.75; }
  .toast{ position: fixed; left:50%; top:calc(var(--pad) + 6px); transform:translateX(-50%); background: rgba(20,8,10,0.7); border:1px solid rgba(255,77,79,0.16); padding:10px 12px; border-radius:12px; font-size:13px; display:none; }
  `;

  return (
      <div>
      <style>{styles}</style>
      <div className="wrap">
        <div className="window">
          <header>
          <div className="title">🪨 Dodge the Falling Rocks <span className="pill">Survive • Score increases over time</span></div>
          <div className="hud">
            <span className="pill">Score: <b>{score}</b></span>
            <span className="pill">Best: <b>{best}</b></span>
            <button onClick={() => { if (!stateRef.current.running) { startFromUI(); } else if (stateRef.current.gameOver) startFromUI(); }}>
              {runningLabel}
            </button>
            <button onClick={() => togglePauseFromUI()} disabled={pauseDisabled}>{pauseLabel}</button>
            <button onClick={() => resetFromUI()}>Reset</button>
          </div>
        </header>
          <div className="canvasWrap">
            <canvas ref={canvasRef} id="game" width={960} height={540} aria-label="Game canvas" />
          </div>

          <div className="help">
            <div>Controls: <span className="kbd">← →</span> or <span className="kbd">A D</span> to move, <span className="kbd">Space</span> to start/pause. <span className="muted">On mobile: drag left/right.</span></div>
            <div className="muted">Tip: the longer you survive, the faster rocks fall.</div>
          </div>
        </div>
      </div>

      <div className="toast" ref={toastRef}></div>

    </div>
  );

  // UI wrappers that call the internal functions via refs (defined inside useEffect)
  function resetFromUI() { const ev = new Event('reset-game'); window.dispatchEvent(ev); /* fallback: directly call via state */ location && window && window.requestAnimationFrame && window.requestAnimationFrame(() => { /* noop - actual reset handled in effect */ }); window.setTimeout(() => { /* hack: call reset via focus/keyboard if needed */ }, 0); }
  function startFromUI() { const ev = new Event('start-game'); window.dispatchEvent(ev); }
  function togglePauseFromUI() { const ev = new Event('toggle-pause-game'); window.dispatchEvent(ev); }
}
