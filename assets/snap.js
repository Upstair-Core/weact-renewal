/* A home · the film (snap): ported from the scroll demo (claude.ai/artifact/3Y5kbUeHrAFUuuj97auCjd, 28판).
   The hand moves the film's frames (drag, trackpad, wheel); letting go plays it on to the next stop at the hand's speed,
   easing to 1x (1.5x back). Stops sit on the film's own keyframes (0 · 121 · 242 · 363 · 483), and each shows that
   keyframe's sharp still. Phones get the same film, cropped to the centre 448:720 band. Past the last stop the page
   scrolls on natively to the finale (#s5). html.snap only; html.film (?mode=film) and html.stack keep home.js. */
(() => {
  'use strict';
  if (!document.documentElement.classList.contains('snap')) return;
  const STOPS = [...document.querySelectorAll('#snap .copy')].map((c) => ({ pos: c.dataset.pos, day: c.classList.contains('t-day') }));
  const STOP_F = [0, 121, 242, 363, 483, 483];          // the frame each stop rests on (the film's keyframes; 05 = the wall after it)
  const dayAt = (f) => f <= 67 || f >= 423;             // the lawn, and the morning after the bamboo slides away
  const SEGS = [
    { kind: 'video', name: 'seg1', dur: 122 / 24 },
    { kind: 'video', name: 'seg2', dur: 122 / 24 },
    { kind: 'video', name: 'seg3', dur: 122 / 24 },
    { kind: 'video', name: 'seg4', dur: 121 / 24 },
    { kind: 'ghost', name: 'fin', dur: 1.4 },             // T → 집: the morning bench pushes in as the wall of squares fades over it
  ];
  const N = STOPS.length, LAST = N - 1;
  const FPS = 24;
  const SEC_SPAN = 3;   // one span of drag (phone: 0.85 screen, computer: window height) = 3 s of film, in every stretch (v19: was 6, operator '스크롤 감도가 너무 심하다')
  const MAXRATE = 4;    // a fling starts the film at most this fast, then eases to normal speed
  const EASE = 0.35;    // seconds for the fling speed to fall most of the way back to 1x
  const TAP = 7;        // px a finger moves before it counts as a drag
  const $ = (s) => document.querySelector(s);
  const root = document.documentElement;
  const film = $('#snap'), media = $('#snap-media'), flash = $('#snap-flash'), hd = $('.top'), after = $('.home-foot') || $('#snap').nextElementSibling;
  const rail = $('.rail'), fill = $('.rail .fill'), cam = $('.rail .cam'), nextEl = $('.rail .next'), chip = $('#snap-chip');
  const ticks = [...document.querySelectorAll('.rail a')];
  if (matchMedia('(pointer: coarse)').matches) $('#snap-cue').textContent = 'SWIPE UP';
  const stills = [...media.querySelectorAll('.still')].sort((a, b) => a.dataset.i - b.dataset.i);
  const copies = [...film.querySelectorAll('.copy')];
  const counted = new Set();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const portraitQ = matchMedia('(max-aspect-ratio: 448/720)');
  const coarse = matchMedia('(pointer: coarse)').matches;
  const now = () => performance.now();
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  try { history.scrollRestoration = 'manual'; } catch (e) {}

  /* ---------- media: per filmed stretch an all-keyframe forward file (scrub + play) and a reverse file (play back) ---------- */
  let variant = portraitQ.matches ? 'p' : 'l';
  const quality = 'hd';  // 1080p (Apple super-resolution copy of the 20 s film); phones 672×1080
  const blobs = new Map();
  const allVideos = [];
  const V = SEGS.map((s) => (s.kind === 'video' ? { f: mkVideo(), r: mkVideo(), ok: { f: false, r: false } } : null));
  function mkVideo() {
    const v = document.createElement('video');
    v.muted = true; v.defaultMuted = true; v.playsInline = true;
    v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
    v.preload = 'auto'; v.disableRemotePlayback = true; v.tabIndex = -1; v.setAttribute('aria-hidden', 'true');
    v.addEventListener('seeked', () => onSeeked(v));
    media.prepend(v); allVideos.push(v);
    return v;
  }
  let loadToken = 0;
  const PROG = {};                                        // download share per stretch file, 'p0f' … 'l3r'
  const T_START = performance.now();
  let progT = 0;
  function progUI() { const tn = performance.now(); if (tn - progT > 90) { progT = tn; updateUI(); } }
  setTimeout(() => updateUI(), 900);                      // the lawn says it is getting ready if the first file is slow
  const fetching = new Map();
  const fileUrl = (k, d, vr) => `media/film/${SEGS[k].name}-${vr}-${d}.mp4?v=1`;   // ?v: a new cut under the same name must not come from the cache
  function getBlob(url, key) {
    if (blobs.has(url)) return Promise.resolve(blobs.get(url));
    if (fetching.has(url)) return fetching.get(url);
    const pr = (async () => {
      let src;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const total = +res.headers.get('content-length') || 0;
        if (res.body && res.body.getReader && total) {        // in chunks, so the chip can say how far along it is
          const rd = res.body.getReader(), parts = []; let got = 0;
          for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; PROG[key] = got / total; progUI(); }
          src = URL.createObjectURL(new Blob(parts, { type: 'video/mp4' }));
        } else src = URL.createObjectURL(await res.blob());
        PROG[key] = 1;
      } catch (e) { src = url; }
      blobs.set(url, src); return src;
    })();
    fetching.set(url, pr); return pr;
  }
  async function attach(k, d, token) {
    const vr = variant, src = await getBlob(fileUrl(k, d, vr), vr + k + d);
    if (token !== loadToken || vr !== variant || V[k].ok[d]) return;
    const v = V[k][d];
    v._unlocked = false;
    v.src = src; v.load();
    V[k].ok[d] = true;
    once(v, 'loadedmetadata', () => { prime(); kick(); }, 10000);
    kick();
    if (k === 0 && d === 'f') loadWall();               // the wall's one picture rides right behind the first stretch
  }
  function need(k, d) { if (V[k] && !V[k].ok[d]) attach(k, d, loadToken); }   // the film waits on it: start it now
  async function loadMedia() {
    const token = ++loadToken;
    const order = [[0, 'f'], [1, 'f'], [2, 'f'], [3, 'f'], [0, 'r'], [1, 'r'], [2, 'r'], [3, 'r']].filter(([k]) => SEGS[k] && SEGS[k].kind === 'video');
    for (const [k, d] of order) { if (token !== loadToken) return; await attach(k, d, token); }
  }

  /* ---------- state ---------- */
  // mode: idle (resting on stop S.at) · scrub (a hand holds the frame of S.k at S.t) · play (running to S.target)
  const S = {
    at: 0, mode: 'idle', k: -1, dir: 0, t: 0, rate: 1, goal: null, origin: 0, target: 0,
    active: null, under: null, first: false, seeking: false, swapping: false, swapToken: 0,
    waitLoad: false, fade: false, t0: 0, lastT: -1, lastMove: 0, arrived: 0, copyOn: 0,
    stepped: false, releasing: false, away: false, grabT: 0, resume: null, slowSeeks: 0, ease: null, sp: false,
  };
  const alpha = stills.map((_, i) => (i === 0 ? 1 : 0));

  const frameCount = (v, k) => Math.max(1, Math.round((v.duration || SEGS[k].dur) * FPS));
  function frameTime(v, k, t) { return (clamp(Math.round(t * FPS), 0, frameCount(v, k) - 1) + 0.5) / FPS; }
  function farGoal() { return S.goal !== null && Math.abs(S.goal - S.target) >= 1; }

  function once(el, ev, cb, ms, onTimeout) {
    let done = false;
    const h = () => { if (done) return; done = true; clearTimeout(tm); el.removeEventListener(ev, h); cb(); };
    const tm = setTimeout(() => { if (done) return; done = true; el.removeEventListener(ev, h); onTimeout && onTimeout(); }, ms);
    el.addEventListener(ev, h);
  }
  function seekThen(v, t, cb, fail) {
    const go = () => { once(v, 'seeked', cb, 3000, fail); v.currentTime = t; };
    if (v.readyState >= 1) go();
    else { once(v, 'loadedmetadata', go, 3000, fail); try { v.load(); } catch (e) {} }
  }
  function firstFrame(v, cb) {
    if (typeof v.requestVideoFrameCallback === 'function') v.requestVideoFrameCallback(() => cb());
    else once(v, 'timeupdate', cb, 1500, cb);
  }
  function playSafe(v) {
    let p;
    try { p = v.play(); } catch (e) { arrive(true); return; }
    if (p && p.catch) p.catch(() => { if (S.active === v && S.mode === 'play') arrive(true); });
  }
  function pauseAll() { for (const v of allVideos) if (!v.paused) { try { v.pause(); } catch (e) {} } }

  /* ---------- play: keys, milestones and the run after a release ---------- */
  function start(k, dir) {
    const seg = SEGS[k];
    if (!seg) return;
    S.stepped = true;
    setCopy(-1);
    S.under = S.active && S.active.style.opacity === '1' ? S.active : null;
    S.active = null;
    S.mode = 'play'; S.k = k; S.dir = dir;
    S.origin = dir > 0 ? k : k + 1; S.target = dir > 0 ? k + 1 : k;
    S.t = dir > 0 ? 0 : seg.dur;
    S.first = false; S.seeking = false; S.swapping = false; S.waitLoad = false; S.sp = false;
    S.t0 = now(); S.lastMove = now(); S.lastT = -1;
    S.rate = farGoal() ? 2.5 : (dir > 0 ? 1 : 1.5);       // keys and milestones keep the plain pace
    S.ease = null;
    S.fade = reduce.matches;
    if (seg.kind === 'video' && !S.fade) {
      const d = dir > 0 ? 'f' : 'r';
      if (V[k].ok[d]) begin(V[k][d], 0.5 / FPS);
      else if (d === 'r' && V[k].ok.f) seekPlay(V[k].f);   // the way back not in yet: step back through the forward file
      else { S.waitLoad = true; need(k, d); }
    }
    updateUI(); kick();
  }

  // Backward without its reverse file: hold the forward file and let the pump seek it back frame by frame at the play pace.
  function seekPlay(v) {
    S.sp = true; S.waitLoad = false;
    if (S.active && S.active !== v) S.under = S.active;
    S.active = v; v.style.zIndex = '1';
    try { v.pause(); } catch (e) {}
    S.first = v.readyState >= 2 && !v.seeking && Math.abs(v.currentTime - frameTime(v, S.k, S.t)) < 0.5 / FPS;
    PUMP.busy = false; PUMP.v = null; S.lastMove = now();
    kick();
  }
  function begin(v, at) {
    S.active = v; S.first = false; S.lastMove = now(); S.lastT = -1;
    v.playbackRate = S.rate;
    const go = () => {
      if (S.active !== v || S.mode !== 'play') return;
      S.seeking = false; S.lastMove = now();
      if (S.under && S.under !== v) S.under.style.zIndex = '0';
      v.style.opacity = '1'; v.style.zIndex = '1';
      v.playbackRate = S.rate;
      playSafe(v);
      firstFrame(v, () => { if (S.active === v) { S.first = true; kick(); } });
    };
    if (Math.abs(v.currentTime - at) > 0.02) {
      S.seeking = true;
      seekThen(v, at, () => requestAnimationFrame(go), () => { if (S.active === v && S.mode === 'play') arrive(true); });
    } else go();
  }

  function reverse() {
    if (S.mode !== 'play') return;
    const seg = SEGS[S.k];
    S.dir = -S.dir;
    const o = S.origin; S.origin = S.target; S.target = o;
    if (S.goal !== null && Math.sign(S.goal - S.origin) !== S.dir && S.goal !== S.target) S.goal = null;
    S.rate = farGoal() ? 2.5 : (S.dir > 0 ? 1 : 1.5); S.ease = null;
    updateUI(); kick();
    if (seg.kind !== 'video' || S.fade) return;           // drawn stretches just run t backwards
    if (S.sp) {                                            // was stepping back through the forward file: now just play it on
      S.sp = false; const v = S.active;
      if (v) { v.playbackRate = S.rate; playSafe(v); S.lastMove = now(); S.lastT = -1; return; }
    }
    if (S.waitLoad) { arrive(true); return; }             // never left the stop
    const old = S.active;
    if (!old) { arrive(true); return; }
    if (S.swapping) {                                      // flipped back before the other file was ready
      S.swapping = false; S.swapToken++;
      old.playbackRate = S.rate; playSafe(old); S.lastMove = now();
      return;
    }
    const d = S.dir > 0 ? 'f' : 'r';
    const nv = V[S.k][d];
    if (!V[S.k].ok[d]) {                                    // turned back before that file arrived: hold and wait
      try { old.pause(); } catch (e) {}
      S.t = activeT();
      if (d === 'r' && V[S.k].ok.f) { seekPlay(V[S.k].f); updateUI(); return; }   // step back through the forward file
      S.under = old; S.active = null; S.waitLoad = true; S.t0 = now(); need(S.k, d); updateUI(); return;
    }
    try { old.pause(); } catch (e) {}
    const D = old.duration || seg.dur;
    const mirror = clamp(D - old.currentTime, 0, D);
    S.swapping = true; const token = ++S.swapToken; S.lastMove = now();
    nv.playbackRate = S.rate;
    const swap = () => {
      if (token !== S.swapToken || !S.swapping || S.mode !== 'play') return;
      S.swapping = false; S.under = old; S.active = nv; S.first = false;
      nv.style.opacity = '1'; nv.style.zIndex = '1'; old.style.zIndex = '0';
      nv.playbackRate = S.rate;
      playSafe(nv);
      firstFrame(nv, () => { if (S.active === nv) { S.first = true; kick(); } });
      S.lastMove = now(); S.lastT = -1;
    };
    seekThen(nv, mirror, () => requestAnimationFrame(swap), () => { if (token === S.swapToken && S.swapping) arrive(true); });
  }

  function arrive(jump) {
    const was = S.active;
    if (was) { try { was.pause(); } catch (e) {} if (jump) was.style.opacity = '0'; }
    S.swapToken++;
    PUMP.busy = false; PUMP.v = null;
    resetDrawn();
    S.at = S.target; S.mode = 'idle'; S.k = -1;
    S.waitLoad = false; S.seeking = false; S.swapping = false; S.resume = null; S.ease = null; S.sp = false;
    S.arrived = now(); S.copyOn = 0;
    if (jump) { S.active = null; S.under = null; }
    if (S.goal !== null && S.goal !== S.at) {
      const d = Math.sign(S.goal - S.at);
      start(d > 0 ? S.at : S.at - 1, d);
      return;
    }
    S.goal = null;
    updateUI(); kick();
  }

  // Resting on a stop, park the forward files on the frames a drag would start from.
  function seekIdle(v, t) {
    if (v.readyState >= 1 && !v.seeking && Math.abs(v.currentTime - t) > 0.25 / FPS) { try { v.currentTime = t; } catch (e) {} }
  }
  function prime() {
    if (S.mode !== 'idle') return;
    const f = V[S.at], b = V[S.at - 1];
    if (f && f.ok.f && f.f !== S.active) seekIdle(f.f, frameTime(f.f, S.at, 0));
    if (b && b.ok.f && b.f !== S.active) seekIdle(b.f, frameTime(b.f, S.at - 1, SEGS[S.at - 1].dur));
    if (b && b.ok.r && b.r !== S.active) seekIdle(b.r, 0.5 / FPS);
  }

  /* ---------- scrub: the hand holds the frame ---------- */
  const PUMP = { v: null, busy: false, since: 0 };
  function activeT() {                                     // where the running file is, as forward time in S.k
    const p = V[S.k], v = S.active, D = SEGS[S.k].dur;
    if (!p || !v) return S.t;
    if (v === p.r) return clamp((v.duration || D) - v.currentTime, 0, D);
    if (v === p.f) return clamp(v.currentTime, 0, D);
    return S.t;
  }
  function grab(d) {
    if (S.releasing) return false;
    if (S.mode === 'scrub') return true;
    if (S.mode === 'play' && S.waitLoad) return false;     // already asked: keep waiting for the file
    if (S.mode === 'idle' && !reduce.matches) {
      const k = d > 0 ? S.at : S.at - 1, q = V[k];
      if (k >= 0 && k < SEGS.length && SEGS[k].kind === 'video' && !(q && q.ok.f)) { start(k, d); return false; }
    }
    if (S.mode === 'idle') {
      const k = d > 0 ? S.at : S.at - 1;
      if (k < 0 || k >= SEGS.length) return false;
      S.k = k; S.t = d > 0 ? 0 : SEGS[k].dur;
      S.origin = S.at; S.target = d > 0 ? k + 1 : k;
      S.under = S.active && S.active.style.opacity === '1' ? S.active : null;   // grabbed before the still covered it
      S.active = null;
      S.resume = null;
    } else {                                               // a hand on the running record stops it where it is
      S.resume = { dir: S.dir, rate: S.rate };
      S.swapToken++; S.swapping = false;
      S.t = activeT();
      if (S.active && S.active.style.opacity === '1') S.under = S.active;
      else if (S.under && S.under.style.opacity !== '1') S.under = null;
    }
    pauseAll();
    S.sp = false; S.mode = 'scrub'; S.goal = null; S.dir = 0; S.grabT = S.t; S.stepped = true; S.ease = null;
    S.seeking = false; S.waitLoad = false; S.fade = reduce.matches;
    PUMP.busy = false; PUMP.v = null;
    const seg = SEGS[S.k], p = V[S.k];
    if (seg.kind === 'video' && !S.fade && p && p.ok.f) {
      const v = p.f;
      if (S.under === v) S.under = null;
      S.active = v; v.style.zIndex = '1';
      if (S.under) S.under.style.zIndex = '0';
      S.first = v.readyState >= 2 && !v.seeking && Math.abs(v.currentTime - frameTime(v, S.k, S.t)) < 0.5 / FPS;
    } else { S.active = null; S.first = false; }        // drawn stretch, or the file is still coming: track t anyway
    setCopy(-1); updateUI(); kick();
    return true;
  }
  // Moves the held frame by dSec seconds of film; reports +1/-1 when it runs into the stop at that end.
  function scrubBy(dSec) {
    if (S.mode !== 'scrub') return 0;
    const D = SEGS[S.k].dur;
    const t = clamp(S.t + dSec, 0, D);
    const hit = dSec > 0 && t >= D ? 1 : dSec < 0 && t <= 0 ? -1 : 0;
    if (t !== S.t) { S.t = t; kick(); }
    return hit;
  }
  function settle(end) { S.target = end > 0 ? S.k + 1 : S.k; arrive(false); }
  // Hand lifted: the film plays on to the stop in `dir`. It leaves at the hand's speed (film s per s)
  // and eases back to normal playback: 1x forward, 1.5x when it runs back.
  function letGo(dir, handRate) {
    if (S.mode !== 'scrub') return;
    const k = S.k, seg = SEGS[k], D = seg.dur;
    S.resume = null;
    if (dir > 0 && S.t >= D - 1e-3) { settle(1); return; }
    if (dir < 0 && S.t <= 1e-3) { settle(-1); return; }
    S.mode = 'play'; S.dir = dir;
    S.target = dir > 0 ? k + 1 : k; S.origin = dir > 0 ? k : k + 1;
    const base = farGoal() ? 2.5 : dir > 0 ? 1 : 1.5;
    const from = clamp(handRate || 0, base, MAXRATE);
    S.rate = from;
    S.ease = from > base + 0.05 ? { from, base, t0: now() } : null;
    S.t0 = now(); S.lastMove = now(); S.lastT = -1;
    S.seeking = false; S.swapping = false; S.waitLoad = false;
    PUMP.busy = false; PUMP.v = null;
    updateUI(); kick();
    if (seg.kind !== 'video' || S.fade) return;
    const d = dir > 0 ? 'f' : 'r', p = V[k];
    if (!p || !p.ok[d]) {                                   // the way back has not arrived: step back through the forward file
      if (d === 'r' && p && p.ok.f) { seekPlay(p.f); updateUI(); return; }
      if (S.active) S.under = S.active;
      S.active = null; S.waitLoad = true; S.t0 = now(); need(k, d); updateUI(); kick(); return;
    }
    const v = p[d], cur = S.active;
    if (cur && cur !== v) S.under = cur;                    // the held frame stays up until the other file has its frame
    const Dv = v.duration || D;
    begin(v, d === 'f' ? frameTime(v, k, S.t) : clamp(Dv - S.t, 0.5 / FPS, Dv - 0.5 / FPS));
  }
  // One seek in flight; when it lands the next frame asks for the newest wanted time.
  function pump(tn) {
    if (S.mode !== 'scrub' && !(S.mode === 'play' && S.sp)) return false;
    const v = S.active;
    if (!v) return false;
    if (v.readyState < 1) return true;
    if (PUMP.busy) { if (tn - PUMP.since < 700) return true; PUMP.busy = false; S.slowSeeks++; }
    const want = frameTime(v, S.k, S.t);
    if (Math.abs(v.currentTime - want) < 0.25 / FPS) {
      if (!S.first && !v.seeking && v.readyState >= 2) { S.first = true; return true; }
      return false;
    }
    PUMP.busy = true; PUMP.v = v; PUMP.since = tn;
    try { v.currentTime = want; } catch (e) { PUMP.busy = false; }
    return true;
  }
  function onSeeked(v) {
    if (PUMP.v !== v || !PUMP.busy) return;
    PUMP.busy = false;
    if ((S.mode === 'scrub' || S.sp) && S.active === v && !S.first) {
      requestAnimationFrame(() => { if ((S.mode === 'scrub' || S.sp) && S.active === v) { S.first = true; kick(); } });
    }
    kick();
  }
  // iOS paints seeked frames only on a video that has played once: play + pause each file on the first touches.
  function unlock() {
    if (!coarse) return;
    for (const v of allVideos) {
      if (v._unlocked || !v.src || v.readyState < 1 || v === S.active) continue;
      v._unlocked = true;
      try {
        const p = v.play();
        if (p && p.then) p.then(() => { if (!(S.mode === 'play' && S.active === v)) { v.pause(); prime(); kick(); } }).catch(() => { v._unlocked = false; });
      } catch (e) { v._unlocked = false; }
    }
  }

  /* ---------- commands: keys and milestones still play through ---------- */
  function filmOwns() { return scrollY <= 2 && !S.releasing; }
  function pageNext() { return S.mode === 'idle' && S.at === LAST; }   // past the last stop the page itself moves
  function command(dir) {
    if (S.releasing || S.mode === 'scrub') return;
    S.goal = null;
    if (S.mode === 'idle') {
      if (dir > 0) { if (S.at < LAST) start(S.at, 1); else release(); }
      else if (S.at > 0) start(S.at - 1, -1);
    } else if (dir !== S.dir) reverse();
  }
  function goTo(i) {
    if (S.releasing) return;
    if (scrollY > 2) { animateScroll(0, () => goTo(i)); return; }
    if (S.mode === 'scrub') {
      S.goal = i;
      letGo(i >= S.k + S.t / SEGS[S.k].dur ? 1 : -1, 0);
      return;
    }
    if (S.mode === 'idle') {
      if (i === S.at) return;
      S.goal = i;
      const d = Math.sign(i - S.at);
      start(d > 0 ? S.at : S.at - 1, d);
    } else {
      S.goal = i;
      const ahead = S.dir > 0 ? i >= S.target : i <= S.target;
      if (ahead) { if (farGoal()) { S.ease = null; S.rate = Math.max(S.rate, 2.5); if (S.active) S.active.playbackRate = S.rate; } updateUI(); }
      else reverse();
    }
  }
  function release() {
    const top = after.getBoundingClientRect().top + scrollY;
    S.releasing = true;
    animateScroll(top, () => { S.releasing = false; onScroll(); });
  }
  function animateScroll(to, done) {
    const from = scrollY, t0 = now(), dur = 900;
    S.releasing = true;
    const f = () => {
      const p = Math.min(1, (now() - t0) / dur);
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      scrollTo(0, from + (to - from) * e);
      if (p < 1) requestAnimationFrame(f);
      else { S.releasing = false; done && done(); publish(); }
    };
    requestAnimationFrame(f);
  }

  /* ---------- wheel and trackpad: deltas move the frame; quiet or momentum means the hand let go ---------- */
  const G = { last: 0, abs: 0, dir: 0, falls: 0, rises: 0, ratio: 0, glide: 0, owner: null, state: 'off', how: '', acc: 0, vel: 0, quiet: 0 };
  const wheelPPS = () => clamp(innerHeight, 560, 1000) / SEC_SPAN;  // px of wheel per second of film
  function wheelLetGo(how) {
    clearTimeout(G.quiet);
    if (G.state !== 'scrub') return;
    G.state = 'done'; G.how = how;
    // v19: a short scroll that stops (no momentum) goes back to the stop it left, as a slow touch drag does
    if (how === 'quiet') {
      const trav = (S.t - S.grabT) / SEGS[S.k].dur;
      if (Math.abs(trav) < 0.2) {
        const D = SEGS[S.k].dur, g = S.grabT;
        letGo(g <= 0.05 ? -1 : g >= D - 0.05 ? 1 : (S.t / D >= 0.5 ? 1 : -1), 0);   // back to the stop it was grabbed at, else the nearer stop
        return;
      }
    }
    letGo(G.dir, Math.abs(G.vel) / wheelPPS());
  }
  addEventListener('wheel', (e) => {
    if (e.ctrlKey) return;                                  // pinch zoom
    const tn = now();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;
    let dy = e.deltaY * unit;
    if (Math.abs(e.deltaX * unit) > Math.abs(dy)) { if (e.target.closest && e.target.closest('.snapfilm .cards')) return; dy = 0; }
    const a = Math.abs(dy), d = Math.sign(dy);
    const gap = tn - G.last;
    const turned = d !== 0 && G.dir !== 0 && d !== G.dir;
    const grows = a > G.abs * 1.25 && a >= 4;
    // a new swipe on top of momentum: one big jump, or two growing deltas in a row (momentum only shrinks)
    const rising = (G.falls >= 3 && a >= 16 && a > G.abs * 1.8) || (G.how === 'momentum' && grows && G.rises >= 1);
    // While the frame is held, turning back is still the same hand. After a let-go: a turn, a new swipe,
    // or anything at all after a quiet let-go (no momentum follows a hand that stopped) is a new gesture.
    const fresh = gap > 240 || (G.state !== 'scrub' && (turned || rising || (G.state === 'done' && G.how === 'quiet')));
    if (fresh) {
      clearTimeout(G.quiet);
      G.owner = filmOwns() && !(d > 0 && pageNext()) ? 'film' : 'page';
      G.state = 'pend'; G.how = ''; G.acc = 0; G.falls = 0; G.rises = 0; G.glide = 0; G.ratio = 0; G.vel = 0;
    } else {
      if (a < G.abs) {
        // momentum decays by a near-constant ratio; a hand slowing down to turn decays faster and faster
        const r = a / G.abs;
        G.glide = r >= 0.8 && r <= 0.985 && (!G.ratio || Math.abs(r - G.ratio) < 0.06) ? G.glide + 1 : 0;
        G.ratio = r; G.falls++; G.rises = 0;
      } else if (a > G.abs) { G.falls = 0; G.glide = 0; G.ratio = 0; G.rises = grows ? G.rises + 1 : 0; }
      if (gap > 0 && gap < 120) G.vel = G.vel * 0.5 + (dy / (gap / 1000)) * 0.5;
    }
    G.last = tn; if (a) G.abs = a; if (d) G.dir = d;
    if (G.owner !== 'film' && !S.releasing) return;
    if (e.cancelable) e.preventDefault();
    if (G.owner !== 'film' || !d || S.releasing || G.state === 'done') return;
    if (G.state === 'pend') {
      G.acc += dy;
      if (Math.abs(G.acc) < 2) return;
      if (!grab(Math.sign(G.acc))) { G.state = 'done'; return; }
      G.state = 'scrub'; dy = G.acc;
    }
    const hit = scrubBy(dy / wheelPPS());
    if (hit) { clearTimeout(G.quiet); G.state = 'done'; G.how = 'hit'; settle(hit); return; }
    if (G.glide >= 6 && Math.abs(G.vel) > 300) { wheelLetGo('momentum'); return; }   // a steady decay: the fingers have left
    clearTimeout(G.quiet); G.quiet = setTimeout(() => wheelLetGo('quiet'), 130);
  }, { passive: false });

  /* ---------- touch: the finger holds the frame; lifting it decides the stop ---------- */
  const TT = { owner: null, y0: 0, y: 0, moved: false, engaged: false, s: [] };
  const touchPPS = () => Math.max(320, innerHeight * 0.85) / SEC_SPAN;    // px of finger travel per second of film
  function touchVel(tn) {                                    // px/s, + = finger moving up (forward)
    const s = TT.s.filter((p) => tn - p.t <= 110);
    if (s.length < 2) return 0;
    const a = s[0], b = s[s.length - 1];
    if (tn - b.t > 70) return 0;                             // the finger stopped before it lifted
    const dt = (b.t - a.t) / 1000;
    return dt > 0 ? (a.y - b.y) / dt : 0;
  }
  function touchLetGo() {
    if (!TT.engaged) return;
    TT.engaged = false;
    if (S.mode !== 'scrub') return;
    const seg = SEGS[S.k];
    if (!TT.moved && S.resume) { const r = S.resume; letGo(r.dir, r.rate); return; }   // a tap: carry on
    const v = touchVel(now());
    let dir;
    if (Math.abs(v) > 200) dir = Math.sign(v);                // a flick goes where it was flicked
    else {
      const f = S.t / seg.dur, trav = (S.t - S.grabT) / seg.dur;
      dir = Math.abs(trav) > 0.25 ? Math.sign(trav) : (f >= 0.5 ? 1 : -1);
    }
    letGo(dir, Math.sign(v) === dir ? Math.abs(v) / touchPPS() : 0);
  }
  addEventListener('touchstart', (e) => {
    unlock();
    if (e.touches.length !== 1) { if (TT.engaged) touchLetGo(); TT.owner = 'page'; return; }
    const y = e.touches[0].clientY;
    TT.y0 = TT.y = y; TT.moved = false; TT.engaged = false; TT.s = [{ t: now(), y }];
    TT.x0 = e.touches[0].clientX; TT.cards = !!(e.target.closest && e.target.closest('.snapfilm .cards'));
    TT.owner = filmOwns() ? 'film' : 'page';
    if (TT.owner === 'film' && S.mode === 'play') TT.engaged = grab(S.dir);
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (TT.owner !== 'film' && !S.releasing) return;
    const y = e.touches[0] ? e.touches[0].clientY : TT.y;
    const total = TT.y0 - y;
    if (TT.owner === 'film' && !TT.engaged && pageNext() && total > 0 && !S.releasing) { TT.owner = 'page'; return; }
    if (TT.owner === 'film' && !TT.engaged && TT.cards && e.touches[0]) {
      const dx = Math.abs(e.touches[0].clientX - TT.x0);
      if (dx >= Math.abs(total)) { if (dx >= TAP) TT.owner = 'page'; return; }
    }
    if (e.cancelable) e.preventDefault();
    if (TT.owner !== 'film' || e.touches.length !== 1) return;
    const dy = TT.y - y; TT.y = y;
    TT.s.push({ t: now(), y }); if (TT.s.length > 16) TT.s.shift();
    if (Math.abs(total) >= TAP) TT.moved = true;
    if (!TT.engaged) {
      if (!TT.moved) return;
      if (!grab(Math.sign(total))) { TT.owner = 'none'; return; }
      TT.engaged = true;
      scrubBy(total / touchPPS());
      return;
    }
    scrubBy(dy / touchPPS());
  }, { passive: false });
  const touchEnd = (e) => { if (e.touches.length === 0 && TT.engaged) touchLetGo(); unlock(); };
  addEventListener('touchend', touchEnd, { passive: true });
  addEventListener('touchcancel', touchEnd, { passive: true });

  addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const tag = (e.target && e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (tag === 'button' && (e.key === ' ' || e.key === 'Enter')) return;
    if (!filmOwns()) return;
    let d = 0;
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) d = 1;
    else if (e.key === 'ArrowUp' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) d = -1;
    else if (e.key === 'Home') { e.preventDefault(); goTo(0); return; }
    else if (e.key === 'End') { e.preventDefault(); goTo(LAST); return; }
    if (!d) return;
    e.preventDefault();
    if (e.repeat) return;
    command(d);
  });

  // the rail: ticks 0..3 are stops 1..4 on the film, tick 4 is the finale after it
  ticks.forEach((a, k) => a.addEventListener('click', (e) => {
    e.preventDefault();
    goTo(k + 1);
  }));

  /* ---------- drawing ---------- */
  let raf = 0, lastFrame = now(), lastPub = '';
  function kick() { if (!raf) { lastFrame = now(); raf = requestAnimationFrame(tick); } }
  function tick() {
    raf = 0;
    const tn = now();
    const dt = Math.min(0.1, (tn - lastFrame) / 1000);
    lastFrame = tn;
    let busy = advance(dt, tn);
    busy = pump(tn) || busy;
    busy = draw(dt, tn) || busy;
    publish();
    if (busy) kick();
  }

  function advance(dt, tn) {
    if (S.mode !== 'play') return false;
    if (S.ease) {                                          // fling speed falling back to normal playback
      const e = (tn - S.ease.t0) / 1000, E = S.ease;
      const r = e >= 4 * EASE ? E.base : E.base + (E.from - E.base) * Math.exp(-e / EASE);
      if (e >= 4 * EASE) S.ease = null;
      if (Math.abs(r - S.rate) > 0.03 || !S.ease) {
        S.rate = r;
        if (S.active && !S.active.paused && !S.swapping) S.active.playbackRate = r;
        if (!S.ease) updateUI();
      }
    }
    const seg = SEGS[S.k];
    if (seg.kind === 'ghost' || S.fade) {
      const speed = S.fade ? seg.dur / 0.7 : S.rate;
      S.t += dt * speed * S.dir;
      if ((S.dir > 0 && S.t >= seg.dur) || (S.dir < 0 && S.t <= 0)) { S.t = S.dir > 0 ? seg.dur : 0; arrive(false); }
      return true;
    }
    if (S.sp) {                                            // stepping back through the forward file
      S.t = Math.max(0, S.t - dt * S.rate); S.lastMove = tn;
      if (S.t <= 0) arrive(false);
      return true;
    }
    const d = S.dir > 0 ? 'f' : 'r';
    if (S.waitLoad) {
      if (V[S.k].ok[d]) {
        S.waitLoad = false; updateUI();
        const v = V[S.k][d], Dv = v.duration || seg.dur;
        begin(v, d === 'f' ? frameTime(v, S.k, S.t) : clamp(Dv - S.t, 0.5 / FPS, Dv - 0.5 / FPS));   // from the frame it waited on
      } else if (tn - S.t0 > 45000) arrive(true);           // a file that never comes: the stop, after a long wait
      return true;
    }
    const v = S.active;
    if (!v || S.seeking || S.swapping) { if (tn - S.lastMove > 4000) arrive(true); return true; }
    const D = v.duration || seg.dur, ct = v.currentTime;
    S.t = S.dir > 0 ? ct : D - ct;
    if (Math.abs(ct - S.lastT) > 1e-3) { S.lastT = ct; S.lastMove = tn; }
    if (v.ended || ct >= D - 0.004) { arrive(false); return true; }
    if (tn - S.lastMove > 2500) arrive(true);              // stalled: show the stop instead of hanging
    return true;
  }

  function resetDrawn() {
    stills.forEach((el) => { if (el._tf) { el.style.transform = ''; el.style.filter = ''; el._tf = false; } });
    flash.style.opacity = '0';
  }

  function draw(dt, tn) {
    let busy = false;
    const moving = S.mode !== 'idle';
    const drawn = moving && (SEGS[S.k].kind === 'ghost' || S.fade);
    if (drawn) {
      const k = S.k, A = k, B = k + 1;
      const p = clamp(S.t / SEGS[k].dur, 0, 1);
      for (let i = 0; i < N; i++) if (i !== A && i !== B) alpha[i] = 0;
      stills.forEach((el, i) => { if (el._tf && i !== A && i !== B) { el.style.transform = ''; el.style.filter = ''; el._tf = false; } });
      if (S.fade) { alpha[A] = 1 - p; alpha[B] = p; flash.style.opacity = '0'; }
      else if (SEGS[k].name === 'fin') {
        // as the stations' road did: the last frame pushes in like a photo while the wall fades over it
        const e = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        alpha[A] = 1; alpha[B] = clamp((p - .18) / .64, 0, 1);
        stills[A].style.transform = `scale(${(1 + .07 * e).toFixed(4)})`; stills[A]._tf = true;
        stills[B].style.transform = `scale(${(1.08 - .08 * e).toFixed(4)})`; stills[B]._tf = true;
        flash.style.opacity = '0';
      } else {
        // into the brightest point at the centre, white, then out of it into the next place
        if (p < 0.5) {
          const q = p / 0.5, e = q * q;
          alpha[A] = 1; alpha[B] = 0;
          stills[A].style.transform = `scale(${(1 + 1.7 * e).toFixed(4)})`;
          stills[A].style.filter = `brightness(${(1 + 1.9 * e).toFixed(3)})`;
          stills[A]._tf = true;
          if (stills[B]._tf) { stills[B].style.transform = ''; stills[B].style.filter = ''; stills[B]._tf = false; }
        } else {
          const q = (p - 0.5) / 0.5, e = 1 - (1 - q) * (1 - q);
          alpha[A] = 0; alpha[B] = 1;
          stills[B].style.transform = `scale(${(1.55 - 0.55 * e).toFixed(4)})`;
          stills[B].style.filter = `brightness(${(2.5 - 1.5 * e).toFixed(3)})`;
          stills[B]._tf = true;
          if (stills[A]._tf) { stills[A].style.transform = ''; stills[A].style.filter = ''; stills[A]._tf = false; }
        }
        const fl = p < 0.5 ? clamp((p - 0.22) / 0.28, 0, 1) : 1 - clamp((p - 0.5) / 0.32, 0, 1);
        flash.style.opacity = (fl * fl * (3 - 2 * fl)).toFixed(3);
      }
    } else {
      for (let i = 0; i < N; i++) {
        let target;
        if (!moving) target = i === S.at ? 1 : 0;
        else target = (i === S.origin && !S.first) ? alpha[i] : 0;
        if (alpha[i] !== target) {
          alpha[i] = target > alpha[i] ? Math.min(target, alpha[i] + dt / 0.35) : Math.max(target, alpha[i] - dt / 0.22);
          busy = true;
        }
      }
    }
    stills.forEach((el, i) => { const o = alpha[i].toFixed(3); if (el._o !== o) { el.style.opacity = o; el._o = o; } });

    const covered = !moving && alpha[S.at] >= 1;
    for (const v of allVideos) {
      let want = '0';
      if (!covered && !drawn && (v === S.active || (v === S.under && !S.first))) want = '1';
      if (v.style.opacity !== want) v.style.opacity = want;
      if (want === '0' && v.style.zIndex !== '0') v.style.zIndex = '0';
    }
    if (moving && S.first && S.under) { S.under.style.opacity = '0'; S.under = null; }
    if (covered && (S.active || S.under)) { S.active = null; S.under = null; prime(); }

    if (!moving && !S.copyOn && (alpha[S.at] > 0.55 || tn - S.arrived > 600)) { S.copyOn = 1; setCopy(S.at); }
    if (!moving && !S.copyOn) busy = true;

    drawRail();
    return busy;
  }

  function setCopy(i) {
    copies.forEach((c, j) => { const on = j === i; c.classList.toggle('on', on); c.setAttribute('aria-hidden', on ? 'false' : 'true'); });
    if (i >= 0) film.dataset.pos = STOPS[i].pos;
    const b = i >= 0 && copies[i].querySelector('.count b');   // 02 · 04 count up the first time you arrive
    if (b && !counted.has(i) && window.weactCount) { counted.add(i); window.weactCount(b); }
  }

  // the frame on screen, the light it is in (masthead, rail and scrims follow it), and where the rail's camera stands
  function frameNow() { return S.mode === 'idle' || S.k >= LAST - 1 ? STOP_F[S.mode === 'idle' ? S.at : LAST] : Math.round(STOP_F[S.k] + clamp(S.t / SEGS[S.k].dur, 0, 1) * (STOP_F[S.k + 1] - STOP_F[S.k])); }
  function drawRail() {
    const vh = film.offsetHeight, past = scrollY > 2;
    let pos, cur = -1, next = '';
    if (past) { pos = LAST - 1; cur = LAST - 1; }
    else if (S.mode === 'idle') { pos = Math.max(0, S.at - 1); cur = S.at > 0 ? S.at - 1 : -1; }
    else {
      pos = Math.max(0, S.k + clamp(S.t / SEGS[S.k].dur, 0, 1) - 1);
      const to = S.mode === 'play' ? (S.dir > 0 ? S.k + 1 : S.k) : (S.t / SEGS[S.k].dur >= 0.5 ? S.k + 1 : S.k);
      if (to > 0) next = copies[to].dataset.next || '';
    }
    const x = (clamp(pos / (ticks.length - 1), 0, 1) * 100).toFixed(3) + '%';
    if (cam._x !== x) { cam.style.left = x; fill.style.width = x; cam._x = x; }
    ticks.forEach((a, k) => a.classList.toggle('cur', k === cur));
    if (next && nextEl._n !== next) { nextEl.innerHTML = next; nextEl._n = next; }
    root.classList.toggle('moving', !!next);
    root.classList.toggle('at-top', !past && S.mode === 'idle' && S.at === 0);
    root.classList.toggle('past', scrollY > vh - 120);
    const onFin = S.mode === 'idle' ? S.at === LAST : S.k === LAST - 1;
    const day = past || onFin || dayAt(frameNow());
    film.classList.toggle('atfin', S.mode === 'idle' && S.at === LAST);
    finWatch();
    if (hd._day !== day) { hd._day = day; hd.classList.toggle('t-day', day); rail.classList.toggle('t-day', day); film.classList.toggle('day', day); }
    film.classList.toggle('hold', !past && S.mode === 'idle' && !!S.copyOn);   // the scrim deepens with the words, on the edge they sit on (data-pos, set with them)
    film.classList.toggle('at0', S.mode === 'idle' && S.at === 0);
  }

  function updateUI() {
    const moving = S.mode !== 'idle';
    ticks.forEach((a, k) => { if (!moving && k === S.at - 1) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current'); });
    film.classList.toggle('fresh', !moving && S.at === 0 && !S.stepped);
    // the chip: what the film waits for and how far its file has come
    let c = '', key = '';
    if (S.mode === 'play' && S.waitLoad) key = variant + S.k + (S.dir > 0 ? 'f' : 'r');
    else if (S.mode === 'idle' && S.at === 0 && !(V[0] && V[0].ok.f) && performance.now() - T_START > 800) key = variant + '0f';
    const pct = key ? Math.min(99, Math.floor(100 * (PROG[key] || 0))) : 0;
    if (key) { c = `${chip.dataset.wait || '영상 불러오는 중'} ${pct}%`; chip.style.setProperty('--p', (pct / 100).toFixed(2)); }
    root.classList.toggle('wait', !!c);
    if (c) chip.textContent = c;
    chip.classList.toggle('on', !!c);
    document.body.classList.toggle('owns', filmOwns() && !pageNext());
  }

  function publish() {
    const p = V[S.k] || {};
    const st = JSON.stringify({
      mode: S.mode, at: S.at, k: S.k, dir: S.dir, t: +S.t.toFixed(3), rate: +S.rate.toFixed(2), first: S.first,
      act: S.active ? (S.active === p.f ? 'f' : S.active === p.r ? 'r' : '?') : '-',
      ct: S.active ? +S.active.currentTime.toFixed(3) : null, paused: S.active ? S.active.paused : null,
      pump: PUMP.busy, slow: S.slowSeeks, g: G.state + (G.how ? ':' + G.how : ''), tt: TT.engaged ? 'held' : TT.owner,
      variant, quality, ok: V.map((q) => (q ? (q.ok.f ? 'f' : '-') + (q.ok.r ? 'r' : '-') : 'x')).join(','),
      vis: allVideos.map((v) => v.style.opacity || '0').join(''), alpha: alpha.map((a) => +a.toFixed(2)),
      copy: copies.findIndex((c) => c.classList.contains('on')), y: Math.round(scrollY), releasing: S.releasing,
      owns: document.body.classList.contains('owns'),
    });
    if (st !== lastPub) { root.setAttribute('data-film', st); lastPub = st; }
  }

  /* ---------- page scroll: header, touch lock, leaving the film ---------- */
  function onScroll() {
    const vh = film.offsetHeight, y = scrollY;
    hd.classList.toggle('solid', y > vh - 64);
    drawRail();
    document.body.classList.toggle('owns', filmOwns() && !pageNext());
    const away = y > vh + 4;
    if (away !== S.away) {
      S.away = away;
      film.style.visibility = away ? 'hidden' : '';
      if (away && S.mode !== 'idle') arrive(true);
    }
    publish();
  }
  addEventListener('scroll', onScroll, { passive: true });

  /* ---------- 05 집: the wall of squares, drawn on one canvas ----------
     The stations' own wall (home.js finale): every square lights once like windows at dusk, the children who found a
     family light left to right and stay, drawing WE, which settles into act teal; the count climbs. As 264 photo
     elements fading with grayscale filters and a multiply layer each, it stuttered (operator: 'WE 타일 기반 애니매이션쪽이
     버벅인다'), so the same timing is drawn here: grey and colour copies of each picture, opacity eased like the CSS
     (0.9 s, teal 1.2 s), one canvas layer. The 264 pictures come as one image (media/film/wall.webp, 22×12 squares of
     128 px in the wall's order; operator: '이미지가 로딩 왜이리 느린거지? 타일들?'), fetched once the film's first stretch is in. */
  const mosaic = film.querySelector('.finwall .mosaic');
  const tileEls = mosaic ? [...mosaic.querySelectorAll('li')] : [];
  const COLS = mosaic ? (+getComputedStyle(mosaic).getPropertyValue('--cols') || 22) : 22;
  const ROWS = mosaic ? (+getComputedStyle(mosaic).getPropertyValue('--rows') || 12) : 12;
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;   // fixed sequence: the same wall every visit (as home.js)
  const tiles = tileEls.map((li, i) => {
    const c = i % COLS, we = li.classList.contains('w'), im = li.querySelector('img');
    const a = we ? .3 + .42 * (c - 10) / 9 + .03 * rnd() : .03 + .4 * rnd();   // when it lights
    const b = we ? 9 : a + .14 + .12 * rnd();                                  // when it goes quiet again (never, for WE)
    return { i, c, r: Math.floor(i / COLS), we, a, b, on: false, m: 0, o: .2, wk: -1 };
  });
  const ATLAS = mosaic ? mosaic.dataset.atlas : '', TS = mosaic ? (+mosaic.dataset.ts || 128) : 128;
  let atlas = null, atlasGray = null, weGray = null;
  const wallC = document.createElement('canvas');
  let wctx = null, wDpr = 1, wW = 0, wH = 0, gap = 2, formed = false, teal = 0, wallLoad = false, wallRaf = 0, wallLast = 0, wallDirty = true;
  if (mosaic) { wallC.setAttribute('aria-hidden', 'true'); mosaic.appendChild(wallC); mosaic.classList.add('drawn'); }
  const canFilter = (() => { try { const x = document.createElement('canvas').getContext('2d'); if (!('filter' in x)) return false; x.filter = 'grayscale(1)'; return x.filter === 'grayscale(1)'; } catch (e) { return false; } })();
  function grayOf(im, we) {                               // CSS grayscale(1) (+ the WE squares' brightness 1.12, contrast 1.05)
    const c = document.createElement('canvas'); c.width = im.naturalWidth || im.width || 160; c.height = im.naturalHeight || im.height || 160;
    const x = c.getContext('2d');
    if (canFilter) { x.filter = we ? 'grayscale(1) brightness(1.12) contrast(1.05)' : 'grayscale(1)'; x.drawImage(im, 0, 0, c.width, c.height); return c; }
    x.drawImage(im, 0, 0, c.width, c.height);
    try {
      const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
      for (let k = 0; k < p.length; k += 4) {
        let g = .2126 * p[k] + .7152 * p[k + 1] + .0722 * p[k + 2];
        if (we) g = (g * 1.12 - 128) * 1.05 + 128;
        p[k] = p[k + 1] = p[k + 2] = g < 0 ? 0 : g > 255 ? 255 : g;
      }
      x.putImageData(d, 0, 0);
    } catch (e) {}
    return c;
  }
  function loadWall() {
    if (wallLoad || !mosaic || !ATLAS) return; wallLoad = true;
    const im = new Image(); im.decoding = 'async';
    im.onload = () => (im.decode ? im.decode() : Promise.resolve()).catch(() => {}).then(() => {
      atlas = im; wallDirty = true; kickWall();                       // colour first; grey copies on the next frames
      requestAnimationFrame(() => {
        atlasGray = grayOf(im, false);
        const we = tiles.filter((t) => t.we), c = document.createElement('canvas'); c.width = Math.max(1, we.length) * TS; c.height = TS;
        const x = c.getContext('2d');
        we.forEach((t, k) => { t.wk = k; x.drawImage(im, t.c * TS, t.r * TS, TS, TS, k * TS, 0, TS, TS); });
        weGray = grayOf(c, true); wallDirty = true; kickWall();
      });
    });
    im.src = ATLAS;
  }
  function sizeWall() {
    if (!mosaic) return;
    const w = mosaic.offsetWidth, h = mosaic.offsetHeight; if (!w || !h) return;
    wDpr = Math.min(2, devicePixelRatio || 1);
    const cw = Math.round(w * wDpr), ch = Math.round(h * wDpr);
    if (wallC.width !== cw || wallC.height !== ch) { wallC.width = cw; wallC.height = ch; wctx = wallC.getContext('2d'); }
    wW = w; wH = h; gap = matchMedia('(max-aspect-ratio: 1/1)').matches ? 1 : 2; wallDirty = true; kickWall();
  }
  function drawWall(dt) {
    if (!wctx || !wW) return false;
    const k = 1 - Math.exp(-dt / .3), kt = 1 - Math.exp(-dt / .4);   // ~0.9 s and ~1.2 s to settle, as the CSS transitions
    let moving = false;
    const tealTo = formed ? 1 : 0; if (Math.abs(teal - tealTo) > .002) { teal += (tealTo - teal) * kt; moving = true; } else teal = tealTo;
    const cw = (wW - gap * (COLS - 1)) / COLS, ch = (wH - gap * (ROWS - 1)) / ROWS, x = wctx;
    x.setTransform(wDpr, 0, 0, wDpr, 0, 0);
    x.clearRect(0, 0, wW, wH);
    for (const t of tiles) {
      const mTo = t.on ? 1 : 0, oTo = formed && !t.we ? .09 : .2;
      if (Math.abs(t.m - mTo) > .002) { t.m += (mTo - t.m) * k; moving = true; } else t.m = mTo;
      if (Math.abs(t.o - oTo) > .002) { t.o += (oTo - t.o) * k; moving = true; } else t.o = oTo;
      const px = t.c * (cw + gap), py = t.r * (ch + gap);
      x.globalAlpha = 1; x.fillStyle = '#dbe8e7'; x.fillRect(px, py, cw, ch);   // --teal-100 under every square
      if (!atlas) continue;
      const sx = t.c * TS, sy = t.r * TS;
      if (t.we && teal > 0) {                                                    // WE: grey, brighter, then act teal multiplied in
        x.globalAlpha = 1 - teal; x.drawImage(atlas, sx, sy, TS, TS, px, py, cw, ch);
        if (weGray) { x.globalAlpha = teal; x.drawImage(weGray, t.wk * TS, 0, TS, TS, px, py, cw, ch); }
        x.globalCompositeOperation = 'multiply'; x.globalAlpha = teal; x.fillStyle = '#0b6e78'; x.fillRect(px, py, cw, ch);
        x.globalCompositeOperation = 'source-over';
        continue;
      }
      if (t.m < 1 && atlasGray) { x.globalAlpha = t.o * (1 - t.m); x.drawImage(atlasGray, sx, sy, TS, TS, px, py, cw, ch); }
      if (t.m > 0) { x.globalAlpha = (t.we ? 1 : .92) * t.m; x.drawImage(atlas, sx, sy, TS, TS, px, py, cw, ch); }
    }
    x.globalAlpha = 1;
    return moving;
  }
  function wallTick(tn) {
    wallRaf = 0;
    const dt = Math.min(.1, (tn - (wallLast || tn)) / 1000); wallLast = tn;
    const moving = drawWall(dt); wallDirty = false;
    if (moving || finRunning) wallRaf = requestAnimationFrame(wallTick); else wallLast = 0;
  }
  function kickWall() { if (!wallRaf && wctx) wallRaf = requestAnimationFrame(wallTick); }
  const finCount = copies[copies.length - 1].querySelector('.meta b'), finTotal = finCount ? +finCount.textContent.replace(/\D/g, '') : 0;
  const FIN_MS = 4200;
  let finP = -1, finT0 = 0, finRaf = 0, finPlayed = false, finRunning = false;
  function finale(p) {
    if (p === finP || !mosaic) return; finP = p;
    for (const t of tiles) t.on = p >= t.a && p < t.b;
    formed = p >= .8;
    mosaic.classList.toggle('formed', formed);           // the warm glow after it (.mosaic.formed + .glow)
    if (finCount) finCount.textContent = Math.round(finTotal * (1 - Math.pow(1 - Math.min(1, p / .78), 3))).toLocaleString('ko-KR');
    kickWall();
  }
  function finRun() { const p = Math.min(1, (now() - finT0) / FIN_MS); finale(p); finRunning = p < 1; finRaf = finRunning ? requestAnimationFrame(finRun) : 0; }
  function finWatch() {                                   // plays once each time the film comes to rest on 집
    if ((S.mode === 'idle' ? S.at : S.k) >= LAST - 2) loadWall();
    const atFin = S.mode === 'idle' && S.at === LAST;
    if (atFin && !finPlayed) { finPlayed = true; sizeWall(); finT0 = now(); finale(0); cancelAnimationFrame(finRaf); finRunning = true; finRaf = requestAnimationFrame(finRun); }
    else if (finPlayed && S.mode === 'idle' && S.at < LAST) {
      finPlayed = false; finRunning = false; cancelAnimationFrame(finRaf); finRaf = 0; finale(0);
      for (const t of tiles) { t.m = 0; t.o = .2; } teal = 0; kickWall();
    }
  }
  if (mosaic) { addEventListener('resize', () => { clearTimeout(sizeWall._t); sizeWall._t = setTimeout(sizeWall, 150); }); requestAnimationFrame(sizeWall); }
  finale(0);

  function fitCopies() {
    const wide = !matchMedia('(max-aspect-ratio: 1/1)').matches;
    const ft = film.getBoundingClientRect().top;
    const railTop = rail.getBoundingClientRect().top - ft, headBot = hd.getBoundingClientRect().bottom - ft;
    const minF = wide ? (innerHeight < 800 ? .64 : .78) : .84;
    // wide screens scale the column's frame unit (their type is in u); tall screens scale the phone type (--fs, in px)
    const scale = (c, f) => {
      c.style.removeProperty('--u'); c.style.removeProperty('--fs');
      if (f !== 1) { if (wide) c.style.setProperty('--u', `calc(var(--u0) * ${f.toFixed(3)})`); else c.style.setProperty('--fs', f.toFixed(3)); }
    };
    const fw = film.querySelector('.finwall');
    if (fw) { fw.style.removeProperty('--tw'); film.classList.remove('nokey'); }
    copies.forEach((c) => {
      if (c.classList.contains('hero')) return;
      scale(c, 1); c.classList.remove('onerow', 'nodesc', 'nocards', 'nocredit');
      if (!wide && fw && c.dataset.i === String(LAST)) { fitFin(c, fw, ft); return; }
      const low = wide ? c.dataset.dpos === 'bottom' : c.dataset.pos === 'bottom';
      const over = () => { const r = c.getBoundingClientRect(); return low ? (headBot + 8) - (r.top - ft) : (r.bottom - ft) - (railTop - 14); };
      const shrink = (lo = minF) => {
        let f = 1;
        for (let k = 0; k < 8; k++) {
          const o = over(); if (o <= 0) return true;
          f = Math.max(lo, f * (1 - o / c.offsetHeight) - .01); scale(c, f);
          if (f === lo) return over() <= 0;
        }
        return over() <= 0;
      };
      if (shrink()) return;
      if (c.querySelector('.cards')) { scale(c, 1); c.classList.add('onerow'); if (shrink()) return; }
      scale(c, 1); c.classList.add('nodesc'); if (shrink()) return;
      if (shrink(.6)) return;                              // a short landscape phone: smaller still
      c.classList.add('nocards'); scale(c, 1); shrink(.6);  // and last the thumbnails give way to the words
    });
    if (typeof sizeWall === 'function') sizeWall();
  }
  // 집 on a tall screen: WE (rows 2–8 of the wall) from under the masthead, the legend under it, the words low. The words
  // largest squares (up to 1/11 of the width) that leave room for the legend are used; below 1/19 the fine print, a little
  // of the words' size, the legend, then the long sentence give way, in that order.
  function fitFin(c, fw, ft) {
    const vw = innerWidth, mos = fw.querySelector('.mosaic'), key = fw.querySelector('.key');
    const weTop = () => { const r = mos.getBoundingClientRect(); return r.top - ft + 2 * r.height / 12; };
    const room = () => {
      const copyTop = c.getBoundingClientRect().top - ft;
      const keyH = film.classList.contains('nokey') || !key ? 0 : key.offsetHeight + 14;
      return (copyTop - 12 - keyH - weTop()) / 7;
    };
    // what gives way, in order: the fine print, a little of the words' size, then the legend, then the long sentence
    const steps = [() => {}, () => c.classList.add('nocredit'), () => c.style.setProperty('--fs', '.88'), () => film.classList.add('nokey'), () => c.classList.add('nodesc')];
    let tw = vw / 11;
    for (const step of steps) {
      step(); fw.style.removeProperty('--tw');
      tw = Math.min(vw / 11, room());
      if (tw >= vw / 19) break;                            // WE still reads at a nineteenth of the width (about 20 px squares)
    }
    fw.style.setProperty('--tw', Math.max(vw / 24, tw).toFixed(2) + 'px');
  }
  addEventListener('resize', () => { clearTimeout(fitCopies._t); fitCopies._t = setTimeout(fitCopies, 120); });
  addEventListener('load', fitCopies);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitCopies);

  function reloadMedia() {
    TT.engaged = false; G.state = 'done';
    if (S.mode !== 'idle') { S.target = S.mode === 'scrub' ? S.origin : S.target; arrive(true); }
    S.active = null; S.under = null;
    V.forEach((q) => { if (q) { q.ok.f = false; q.ok.r = false; } });
    allVideos.forEach((v) => { v.style.opacity = '0'; });
    loadMedia();
  }
  portraitQ.addEventListener('change', () => {
    const vr = portraitQ.matches ? 'p' : 'l';
    if (vr === variant) return;
    variant = vr;
    reloadMedia();
  });

  scrollTo(0, 0);
  updateUI(); onScroll(); fitCopies(); publish();
  root.classList.add('snap-on');                          // the head's guard lets go: the film owns the hand from here
  loadMedia();
})();
