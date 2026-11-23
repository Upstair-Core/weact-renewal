/* A home · the film (snap): ported from the scroll demo (claude.ai/artifact/3Y5kbUeHrAFUuuj97auCjd, 28판).
   The hand moves the film's frames (drag, trackpad, wheel); letting go plays it on to the next stop at the hand's speed,
   easing to 1x (1.5x back). Stops sit on the film's own keyframes (0 · 121 · 242 · 363 · 483), and each shows that
   keyframe's sharp still. Phones get the same film, cropped to the centre 448:720 band. Past the last stop the page
   scrolls on natively to the finale (#s5). html.snap only; html.film (?mode=film) and html.stack keep home.js. */
(() => {
  'use strict';
  if (!document.documentElement.classList.contains('snap')) return;
  const STOPS = [...document.querySelectorAll('#snap .copy')].map((c) => ({ pos: c.dataset.pos, day: c.classList.contains('t-day') }));
  const STOP_F = [0, 121, 242, 363, 483];               // the frame each stop rests on (the film's keyframes)
  const dayAt = (f) => f <= 67 || f >= 423;             // the lawn, and the morning after the bamboo slides away
  const SEGS = [
    { kind: 'video', name: 'seg1', dur: 122 / 24 },
    { kind: 'video', name: 'seg2', dur: 122 / 24 },
    { kind: 'video', name: 'seg3', dur: 122 / 24 },
    { kind: 'video', name: 'seg4', dur: 121 / 24 },
  ];
  const N = STOPS.length, LAST = N - 1;
  const FPS = 24;
  const SEC_SPAN = 3;   // one span of drag (phone: 0.85 screen, computer: window height) = 3 s of film, in every stretch (v19: was 6, operator '스크롤 감도가 너무 심하다')
  const MAXRATE = 4;    // a fling starts the film at most this fast, then eases to normal speed
  const EASE = 0.35;    // seconds for the fling speed to fall most of the way back to 1x
  const TAP = 7;        // px a finger moves before it counts as a drag
  const $ = (s) => document.querySelector(s);
  const root = document.documentElement;
  const film = $('#snap'), media = $('#snap-media'), flash = $('#snap-flash'), hd = $('.top'), after = $('#s5');
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
  async function loadMedia() {
    const token = ++loadToken, vr = variant;
    const order = [];
    SEGS.forEach((s, k) => { if (s.kind === 'video') order.push([k, 'f']); });
    SEGS.forEach((s, k) => { if (s.kind === 'video') order.push([k, 'r']); });
    for (const [k, d] of order) {
      if (token !== loadToken) return;
      const url = `media/film/${SEGS[k].name}-${vr}-${d}.mp4?v=1`;   // ?v: a new cut under the same file name must not come from the browser cache
      let src = blobs.get(url);
      if (!src) {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(String(res.status));
          src = URL.createObjectURL(await res.blob());
        } catch (e) { src = url; }
        blobs.set(url, src);
      }
      if (token !== loadToken) return;
      const v = V[k][d];
      v._unlocked = false;
      v.src = src; v.load();
      V[k].ok[d] = true;
      once(v, 'loadedmetadata', () => { prime(); kick(); }, 10000);
      kick();
    }
  }

  /* ---------- state ---------- */
  // mode: idle (resting on stop S.at) · scrub (a hand holds the frame of S.k at S.t) · play (running to S.target)
  const S = {
    at: 0, mode: 'idle', k: -1, dir: 0, t: 0, rate: 1, goal: null, origin: 0, target: 0,
    active: null, under: null, first: false, seeking: false, swapping: false, swapToken: 0,
    waitLoad: false, fade: false, t0: 0, lastT: -1, lastMove: 0, arrived: 0, copyOn: 0,
    stepped: false, releasing: false, away: false, grabT: 0, resume: null, slowSeeks: 0, ease: null,
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
    S.first = false; S.seeking = false; S.swapping = false; S.waitLoad = false;
    S.t0 = now(); S.lastMove = now(); S.lastT = -1;
    S.rate = farGoal() ? 2.5 : (dir > 0 ? 1 : 1.5);       // keys and milestones keep the plain pace
    S.ease = null;
    S.fade = reduce.matches;
    if (seg.kind === 'video' && !S.fade) {
      const d = dir > 0 ? 'f' : 'r';
      if (V[k].ok[d]) begin(V[k][d], 0.5 / FPS); else S.waitLoad = true;
    }
    updateUI(); kick();
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
    if (!V[S.k].ok[d]) { arrive(true); return; }
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
    S.waitLoad = false; S.seeking = false; S.swapping = false; S.resume = null; S.ease = null;
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
    S.mode = 'scrub'; S.goal = null; S.dir = 0; S.grabT = S.t; S.stepped = true; S.ease = null;
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
    if (!p || !p.ok[d]) { arrive(true); return; }
    const v = p[d], cur = S.active;
    if (cur && cur !== v) S.under = cur;                    // the held frame stays up until the other file has its frame
    const Dv = v.duration || D;
    begin(v, d === 'f' ? frameTime(v, k, S.t) : clamp(Dv - S.t, 0.5 / FPS, Dv - 0.5 / FPS));
  }
  // One seek in flight; when it lands the next frame asks for the newest wanted time.
  function pump(tn) {
    if (S.mode !== 'scrub') return false;
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
    if (S.mode === 'scrub' && S.active === v && !S.first) {
      requestAnimationFrame(() => { if (S.mode === 'scrub' && S.active === v) { S.first = true; kick(); } });
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
    if (Math.abs(e.deltaX * unit) > Math.abs(dy)) dy = 0;
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
    if (k < LAST) goTo(k + 1);
    else { if (S.mode !== 'idle') arrive(true); release(); }
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
    const d = S.dir > 0 ? 'f' : 'r';
    if (S.waitLoad) {
      if (V[S.k].ok[d]) { S.waitLoad = false; begin(V[S.k][d], 0.5 / FPS); }
      else if (tn - S.t0 > 12000) arrive(true);
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
      else {
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
  function frameNow() { return S.mode === 'idle' ? STOP_F[S.at] : Math.round(STOP_F[S.k] + clamp(S.t / SEGS[S.k].dur, 0, 1) * (STOP_F[S.k + 1] - STOP_F[S.k])); }
  function drawRail() {
    const vh = film.offsetHeight, past = scrollY > 2;
    let pos, cur = -1, next = '';
    if (past) { pos = LAST - 1 + clamp(scrollY / Math.max(1, vh - 80), 0, 1); if (pos >= LAST - 0.02) cur = LAST; else next = after.dataset.next || ''; }
    else if (S.mode === 'idle') { pos = Math.max(0, S.at - 1); cur = S.at > 0 ? S.at - 1 : -1; }
    else {
      pos = Math.max(0, S.k + clamp(S.t / SEGS[S.k].dur, 0, 1) - 1);
      const to = S.mode === 'play' ? (S.dir > 0 ? S.k + 1 : S.k) : (S.t / SEGS[S.k].dur >= 0.5 ? S.k + 1 : S.k);
      if (to > 0) next = copies[to].dataset.next || '';
    }
    const x = (clamp(pos / LAST, 0, 1) * 100).toFixed(3) + '%';
    if (cam._x !== x) { cam.style.left = x; fill.style.width = x; cam._x = x; }
    ticks.forEach((a, k) => a.classList.toggle('cur', k === cur));
    if (next && nextEl._n !== next) { nextEl.innerHTML = next; nextEl._n = next; }
    root.classList.toggle('moving', !!next);
    root.classList.toggle('at-top', !past && S.mode === 'idle' && S.at === 0);
    root.classList.toggle('past', scrollY > vh - 120);
    const day = past ? true : dayAt(frameNow());
    if (hd._day !== day) { hd._day = day; hd.classList.toggle('t-day', day); rail.classList.toggle('t-day', day); film.classList.toggle('day', day); }
    film.classList.toggle('hold', !past && S.mode === 'idle');
    film.classList.toggle('at0', S.mode === 'idle' && S.at === 0);
  }

  function updateUI() {
    const moving = S.mode !== 'idle';
    ticks.forEach((a, k) => { if (!moving && k === S.at - 1) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current'); });
    film.classList.toggle('fresh', !moving && S.at === 0 && !S.stepped);
    const c = S.mode === 'play' && S.waitLoad ? (chip.dataset.wait || '영상 불러오는 중') : '';
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
  updateUI(); onScroll(); publish();
  loadMedia();
})();
