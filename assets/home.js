/* Home long take: scroll = walking the road from the scene to home.
   The first stations stand on one 3D take (tools/take.py → data-take): the lawn, the crew walking into the
   burning village, the water held out to a dog by its kennel, the morning bench at the shelter. Scrolling scrubs it frame by frame on a canvas; where the camera
   holds, the words come. After the take, the stations cross-fade between photos (cross-fade + slow push). */
(function () {
  const html = document.documentElement;
  if (!html.classList.contains('film')) return;
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';   // the station in the hash decides where we start

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const road = $('.road'), rail = $('.rail'), top = $('.top');
  const els = $$('.road > .stop');
  const stations = els;
  const ticks = $$('.rail a'), cam = $('.rail .cam'), fill = $('.rail .fill'), nextEl = $('.rail .next');
  const takeEl = $('.take'), M = JSON.parse(takeEl.dataset.take);
  const onTake = new Map(M.stops.map(s => [s.id, s]));   // s0, s1, s2 → their holds on the take; tail → its last shot
  const T = onTake.get('tail');

  // ---- timeline, in screen heights ----
  // stations on the take take their holds from its scroll map (shared out by how much the picture changes);
  // the rest keep the photo road: a 1.05-screen hold, a 1-screen cross-fade
  const HOLD = 1.05, TRAVEL = 1.0, FIN_HOLD = 2.2;   // the finale holds longer: its squares light while you scroll
  let u = 0;
  stations.forEach((st, i) => {
    const k = onTake.get(st.id);
    if (k) { st._y0 = k.y0; st._y1 = k.y1; st._take = true; u = k.y1; }
    else { st._y0 = u; u += st.classList.contains('fin') ? FIN_HOLD : HOLD; st._y1 = u; }
    const nx = stations[i + 1];
    if (nx) {
      const kn = onTake.get(nx.id);
      if (st._take && !kn && T) { st._tail = [u, T.y1]; u = T.y1; }   // the take plays on to its last shot before the photos
      st._tr = [u, kn ? kn.y0 : u + TRAVEL]; st._video = !!kn; u = st._tr[1];
    }
  });
  const TOTAL = u, HERO = stations[0]._y1;
  const after = stations.find(s => !s._take), TAKE_END = after ? after._y0 : TOTAL;   // the photo after the take is fully in
  const size = () => { road.style.height = (TOTAL + 1) * innerHeight + 'px'; };
  size();

  // scroll (screen heights) → frame of the take: piecewise linear through its keys
  const K = M.keys;
  function frameAt(v) {
    if (v <= K[0][0]) return K[0][1];
    let lo = 0, hi = K.length - 1;
    if (v >= K[hi][0]) return K[hi][1];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (K[m][0] <= v) lo = m; else hi = m; }
    const [u0, f0] = K[lo], [u1, f1] = K[hi];
    return f0 + (f1 - f0) * (v - u0) / (u1 - u0 || 1);
  }
  const bright = f => M.bright.some(([a, b]) => f >= a && f <= b);

  // ---- the take: one short MP4 per hold (keyframe every 12 frames, no B-frames), scrubbed by seeking ----
  const canvas = $('canvas', takeEl), ctx = canvas.getContext('2d', { alpha: false });
  const segOf = new Int16Array(M.frames);
  M.segs.forEach(([a, b], i) => { for (let f = a; f <= b; f++) segOf[f] = i; });
  const safari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  async function pickCodec() {   // AV1 only where the hardware decodes it smoothly; H.264 everywhere else
    const forced = M.codecs.find(c => c.id === new URLSearchParams(location.search).get('codec'));   // QA: ?codec=h264
    if (forced) return forced;
    const probe = document.createElement('video');
    for (const c of M.codecs) {
      if (!probe.canPlayType(c.mime)) continue;
      if (c === M.codecs[M.codecs.length - 1]) return c;
      try {
        const r = await navigator.mediaCapabilities.decodingInfo({ type: 'file', video: { contentType: c.mime, width: M.w, height: M.h, bitrate: 2e6, framerate: M.fps } });
        if (r.supported && r.smooth && r.powerEfficient) return c;
      } catch (e) { /* no mediaCapabilities: take the safe one */ }
    }
    return M.codecs[M.codecs.length - 1];
  }
  function paint(v) {
    const c = canvas, s = Math.max(c.width / v.videoWidth, c.height / v.videoHeight), w = v.videoWidth * s, h = v.videoHeight * s;
    ctx.drawImage(v, (c.width - w) / 2, (c.height - h) / 2, w, h);
    html.classList.add('take-on');
  }

  const take = {
    v: [], failed: new Set(), loading: -1, busy: false, t0: 0, target: 0, shown: -1, dir: 1, waits: [], codec: null,
    seg(f) { return segOf[Math.max(0, Math.min(M.frames - 1, f | 0))]; },
    has(f) { return !!this.v[this.seg(f)]; },
    hasRange(a, b) {
      for (let i = this.seg(Math.min(a, b)); i <= this.seg(Math.max(a, b)); i++) if (!this.v[i]) return false;
      return true;
    },
    async start() { this.codec = await pickCodec(); this.next(); },
    next() {   // one fetch at a time: the camera's segment, then onward in the direction of travel, then back
      if (!this.codec || this.loading >= 0) return;
      const s = this.seg(this.target), n = M.segs.length, order = [s];
      for (let d = 1; d < n; d++) order.push(s + d * this.dir, s - d * this.dir);
      const i = order.find(i => i >= 0 && i < n && !this.v[i] && !this.failed.has(i));
      if (i === undefined) return;
      this.loading = i;
      fetch(`${this.codec.dir}/seg${String(i).padStart(2, '0')}.mp4`)
        .then(r => { if (!r.ok) throw r.status; return r.blob(); })
        .then(b => new Promise((res, rej) => {
          const v = document.createElement('video');
          v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = URL.createObjectURL(b);
          v.addEventListener('loadeddata', () => res(v), { once: true });
          v.addEventListener('error', rej, { once: true });
          v.load();
        }))
        .then(v => { v.addEventListener('seeked', () => this.seeked(i, v)); this.v[i] = v; })
        .catch(() => this.failed.add(i))
        .finally(() => { this.loading = -1; this.kick(); this.next(); wake(); });
    },
    draw(f) {
      f = Math.max(0, Math.min(M.frames - 1, f));
      if (f !== this.target) { this.dir = f > this.target ? 1 : -1; this.target = f; }
      this.kick(); this.next();
    },
    kick() {
      if (this.busy && performance.now() - this.t0 < 600) return;   // a seek that never reports back is let go
      const f = this.target, i = this.seg(f), v = this.v[i];
      if (!v || this.shown === f) { this.busy = false; return; }
      const t = (f - M.segs[i][0] + .5) / M.fps;
      this.busy = true; this.sf = f; this.si = i; this.t0 = performance.now();
      if (Math.abs(v.currentTime - t) < 1e-4 && v.readyState >= 2) return this.seeked(i, v);
      v.currentTime = t;
    },
    seeked(i, v) {
      if (!this.busy || i !== this.si) return;
      let done = false;
      const fin = () => {
        if (done) return; done = true;
        this.busy = false; paint(v); this.shown = this.sf;
        this.waits = this.waits.filter(([f, res]) => (f === this.shown ? (res(), false) : true));
        this.kick(); wake();
      };
      // Safari can report "seeked" before the new frame is decoded: wait for it to be presented, but not for long
      if (safari && v.requestVideoFrameCallback) { v.requestVideoFrameCallback(fin); setTimeout(fin, 120); } else fin();
    },
    when(f) { f = Math.round(f); return this.shown === f ? Promise.resolve() : new Promise(res => this.waits.push([f, res])); },
    redraw() { const v = this.v[this.seg(this.shown)]; if (this.shown >= 0 && v && v.readyState >= 2) paint(v); },
  };

  function sizeCanvas() {   // about one backing pixel per source pixel once cover-fitted, never more than the screen has
    const cw = Math.max(innerWidth, innerHeight * M.w / M.h), k = Math.min(devicePixelRatio || 1, Math.max(.75, M.w / cw));
    const w = Math.round(innerWidth * k), h = Math.round(innerHeight * k);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; ctx.imageSmoothingQuality = 'high'; take.redraw(); }
  }
  sizeCanvas();

  // ---- stills: only load what's near (-1..+2); on the take they are posters (before the take arrives, or a cut) ----
  function warm(i) {
    const near = [];
    for (let j = i - 1; j <= i + 2; j++) if (stations[j]) near.push(stations[j]);
    near.forEach(st => $$('img[data-src]', st).forEach(im => {
      im.src = pick(im); im.removeAttribute('data-src');
      im.decode().then(() => im.classList.add('ok')).catch(() => im.classList.add('ok'));
    }));
  }

  // widest still the screen can use (cover-fit), never more
  function pick(im) {
    const need = Math.max(innerWidth, innerHeight * 16 / 9) * Math.min(devicePixelRatio || 1, 2) * .9;
    const opts = (im.dataset.srcset || '').split(',').map(x => x.trim().split(' ')).filter(x => x[0]).map(([u, w]) => [u, parseInt(w)]).sort((a, b) => a[1] - b[1]);
    return (opts.find(o => o[1] >= need) || opts[opts.length - 1] || [im.dataset.src])[0];
  }

  // ---- frame (1280×720) coordinates → screen, cover-fit: notes and the stations' zones ----
  const cover = () => {
    const s = Math.max(innerWidth / M.w, innerHeight / M.h);
    return { s, ox: (innerWidth - M.w * s) / 2, oy: (innerHeight - M.h * s) / 2 };
  };
  const unit = () => Math.min(2, Math.max(.8, Math.min(innerWidth / 1280, innerHeight / 720)));   // --u in px
  function placeNotes() {
    const { s, ox, oy } = cover();
    $$('.note').forEach(n => {
      const L = 22 * s;
      n.style.left = (+n.dataset.x * s + ox + L) + 'px';
      n.style.top = (+n.dataset.y * s + oy - L) + 'px';
      $('.ll', n).style.width = L * Math.SQRT2 + 'px';
    });
  }
  // the take is composed around its subject (centre frame), so a column may only use the box its station
  // names: data-zone = x,y,w,h in take pixels, kept inside the page margins
  function zoneOf(st) {
    const z = (st.dataset.zone || '').split(',').map(Number);
    if (z.length !== 4) return null;
    const { s, ox, oy } = cover(), U = unit();
    const l = Math.max(64 * U, z[0] * s + ox), r = (z[0] + z[2]) * s + ox;
    return { l, t: Math.max(80 * U, z[1] * s + oy), w: r - l, b: (z[1] + z[3]) * s + oy, U };
  }
  function placeZones() {
    stations.forEach(st => {
      const z = zoneOf(st), ov = $('.ov', st);
      if (!z || !ov) return;
      if (st.classList.contains('hero')) { ov.style.width = Math.min(600 * z.U, z.w) + 'px'; return; }
      ov.style.left = z.l + 'px'; ov.style.top = z.t + 'px'; ov.style.width = Math.min(446 * z.U, z.w) + 'px';
    });
  }

  // ---- fit: a column must never run into the rail, nor out of its zone ----
  function fit() {
    const railTop = innerHeight - parseFloat(getComputedStyle(rail).bottom) - rail.offsetHeight - 14;
    const minF = innerHeight < 800 ? .64 : .78;
    $$('.stop .ov').forEach(ov => {
      if (ov.closest('.hero')) return;
      const st = ov.closest('.stop'), z = zoneOf(st), limit = z ? Math.min(railTop, z.b) : railTop;
      ov.style.removeProperty('--u'); const cards = $('.cards', ov); cards && (cards.classList.remove('scroll'), cards.style.maxHeight = '');
      const was = st.style.visibility; st.style.visibility = 'hidden'; st.classList.add('measure');
      let f = 1;
      for (let k = 0; k < 5; k++) {
        const b = ov.getBoundingClientRect().bottom;
        if (b <= limit) break;
        const h = ov.offsetHeight, over = b - limit;
        f = Math.max(minF, f * (1 - over / h) - .01);
        ov.style.setProperty('--u', `calc(var(--u0) * ${f.toFixed(3)})`);
        if (f === minF) break;
      }
      if (cards && ov.getBoundingClientRect().bottom > limit) {
        cards.classList.add('scroll'); cards.style.maxHeight = Math.max(120, limit - cards.getBoundingClientRect().top) + 'px';
      }
      st.classList.remove('measure'); st.style.visibility = was;
    });
  }

  // ---- finale: one square = one rescued child. Through the hold every square lights once, scattered like windows
  // at dusk; the children who found a family light from left to right and stay lit, drawing WE; the rest go quiet.
  // Scroll drives it (p = 0 on arrival → 1 at the end of the hold), so it plays forwards and backwards like the take.
  const fin = $('.stop.fin'), mosaic = $('.mosaic', fin), tiles = $$('li', mosaic);
  const COLS = +getComputedStyle(mosaic).getPropertyValue('--cols') || 22;
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;   // fixed sequence: the same wall every visit
  tiles.forEach((li, i) => {
    const c = i % COLS, we = li.classList.contains('w');
    li._a = we ? .3 + .42 * (c - 10) / 9 + .03 * rnd() : .03 + .4 * rnd();   // when it lights
    li._b = we ? 9 : li._a + .14 + .12 * rnd();                               // when it goes quiet again (never, for WE)
    li._on = false;
  });
  stations.forEach(s => { s._count = $('.count b', s); });
  const counter = $('.meta b', fin), total = counter ? +counter.textContent.replace(/\D/g, '') : 0;
  let finP = -1;
  function finale(p) {
    if (p === finP) return; finP = p;
    tiles.forEach(li => { const on = p >= li._a && p < li._b; if (on !== li._on) { li._on = on; li.classList.toggle('on', on); } });
    mosaic.classList.toggle('formed', p >= .8);
    if (counter) counter.textContent = Math.round(total * (1 - Math.pow(1 - Math.min(1, p / .78), 3))).toLocaleString('ko-KR');
  }

  // ---- state ----
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  let cur = scrollY / innerHeight, last = performance.now(), still = 0, running = false, curIdx = -1;

  function locate(v) {
    for (let i = 0; i < stations.length; i++) {
      const st = stations[i];
      if (v < st._y1 || !st._tr) return { i, hold: true, t: clamp((v - st._y0) / (st._y1 - st._y0)) };
      if (st._tail && v < st._tail[1]) return { i, hold: false, tail: true, t: clamp((v - st._tail[0]) / (st._tail[1] - st._tail[0])) };
      if (v < st._tr[1]) return { i, hold: false, t: clamp((v - st._tr[0]) / (st._tr[1] - st._tr[0])) };
    }
  }

  function render(v, settled) {
    const p = locate(v), st = stations[p.i], nx = stations[p.i + 1];
    els.forEach(e => { e._o = 0; e._k = 1; });
    let push = 1;
    if (p.hold) {
      st._o = 1; st._k = st === fin ? 1.05 - .05 * ease(p.t) : 1;   // the finale pulls back slowly as WE forms
    } else if (st._video || p.tail) {   // the camera moves on the take: the words leave at once, the next stop's arrive at the end
      st._o = 1 - clamp(p.t / .12);
      nx._o = p.tail ? 0 : clamp((p.t - .97) / .03);
    } else {
      const e = ease(p.t);
      st._o = 1; st._k = 1 + .07 * e;
      if (st._take) push = st._k;   // the take's last frame pushes in like a photo as the next photo fades over it
      nx._o = clamp((p.t - .18) / .64); nx._k = nx === fin ? 1.08 - .03 * e : 1.06 - .06 * e;
    }
    els.forEach(e => {
      const vis = e._o > 0;
      e.classList.toggle('vis', vis);
      if (vis) { e.style.opacity = e._o.toFixed(3); e.style.setProperty('--k', reduce ? 1 : e._k.toFixed(4)); }
    });

    // the take: on screen until the photo after it has fully faded in
    const onTakeNow = v < TAKE_END, f = Math.round(frameAt(Math.min(v, TAKE_END)));
    takeEl.classList.toggle('vis', onTakeNow);
    if (onTakeNow) { take.draw(f); canvas.style.transform = push === 1 ? '' : `scale(${push.toFixed(4)})`; }
    const missing = onTakeNow && !take.has(f);
    html.classList.toggle('wait', missing && v > .02);
    stations.filter(s => s._take).forEach(s => s.classList.toggle('poster', missing && s._o > 0));
    html.classList.toggle('bright', onTakeNow && bright(f));

    // hold vs moving
    const on = p.hold ? p.i : -1;
    stations.forEach((s, i) => {
      const here = i === on && i > 0;
      if (here && !s._here && s._count && window.weactCount) window.weactCount(s._count);   // 02 · 04 count up each time you arrive
      s._here = here;
      s.classList.toggle('on', here); s.classList.toggle('lit', here && settled);
    });
    if (fin._o > 0) finale(p.hold && st === fin ? p.t : 0);
    html.classList.toggle('moving', !p.hold && v > .55);
    html.classList.toggle('vhold', !!(p.hold && st._take && p.i > 0));   // a bare undefined would flip the class, not clear it
    html.classList.toggle('at-top', v < HERO * .6);
    html.style.setProperty('--ho', (1 - clamp(v / .55)).toFixed(3));
    // light: the page turns to day once the scene in front of you is lit
    const front = p.hold || p.tail ? st : (p.t > .5 ? nx : st);   // while the take plays on to its last shot, it is still in front
    const day = front._take ? bright(f) : front.classList.contains('t-day');   // on the take the frame decides: lawn and eye are day
    top.classList.toggle('t-day', day); rail.classList.toggle('t-day', day);
    // rail: stations 1..5 sit on ticks 0..4; the camera slides between them
    const pos = p.i === 0 ? 0 : (p.hold ? p.i - 1 : p.i - 1 + ease(p.t));
    const x = clamp(pos / (ticks.length - 1)) * 100;
    cam.style.left = x + '%'; fill.style.width = x + '%';
    ticks.forEach((a, k) => a.classList.toggle('cur', p.hold && k === p.i - 1));
    if (!p.hold && nx) nextEl.innerHTML = nx.dataset.next;
    if (p.i !== curIdx) { curIdx = p.i; warm(p.i); }
  }

  function tick(now) {
    const dt = Math.min(80, now - last); last = now;
    const tgt = scrollY / innerHeight;
    if (reduce || Math.abs(tgt - cur) > 1.6) cur = tgt;
    else { cur += (tgt - cur) * (1 - Math.exp(-dt / 70)); if (Math.abs(tgt - cur) < .0004) cur = tgt; }
    render(cur, Math.abs(tgt - cur) < .002);
    return Math.abs(tgt - cur) < .0002;
  }
  function loop(now) {
    still = tick(now) ? still + 1 : 0;
    if (still > 20) { running = false; return; }
    requestAnimationFrame(loop);
  }
  function wake() { if (running) return; running = true; still = 0; last = performance.now(); requestAnimationFrame(loop); }
  ['scroll', 'wheel', 'keydown', 'pointerdown', 'touchmove'].forEach(ev => addEventListener(ev, wake, { passive: true }));

  // ---- settle: a soft pull into a station when you stop just short of it ----
  let st0 = 0, lastInput = 0, jumping = false;
  ['wheel', 'touchmove', 'keydown'].forEach(ev => addEventListener(ev, () => lastInput = performance.now(), { passive: true }));
  addEventListener('scroll', () => { clearTimeout(st0); st0 = setTimeout(settle, 170); }, { passive: true });
  const holds = stations.slice(1);
  function settle() {
    if (jumping || performance.now() - lastInput > 1200) return;
    const v = scrollY / innerHeight, z = .26;
    for (const s of holds) {
      if (v > s._y0 - z && v < s._y0) return scrollTo({ top: (s._y0 + .015) * innerHeight + 1, behavior: 'smooth' });
      if (v > s._y1 && v < s._y1 + z * .6) return scrollTo({ top: (s._y1 - .015) * innerHeight - 1, behavior: 'smooth' });
    }
  }

  // ---- jumps: fast-forward when the way is there to show (a neighbour photo, or take segments already loaded), else cut to black ----
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function fastForward(y1, ms) {
    return new Promise(res => {
      const y0 = scrollY, t0 = performance.now();
      const step = now => { const t = Math.min(1, (now - t0) / ms); scrollTo(0, Math.round(y0 + (y1 - y0) * ease(t))); t < 1 ? requestAnimationFrame(step) : res(); };
      requestAnimationFrame(step);
    });
  }
  async function go(n, push = true) {
    const st = stations[n]; if (!st || jumping) return;
    jumping = true;
    const y = (st._y0 + (n === 0 ? 0 : .22 * (st._y1 - st._y0))) * innerHeight;
    if (push) history.pushState({ s: n }, '', n ? '#s' + n : location.pathname);
    const from = locate(scrollY / innerHeight), a = stations[from.i];
    const bothOnTake = a._take && st._take && (from.hold || a._video);
    const ff = bothOnTake ? take.hasRange(frameAt(scrollY / innerHeight), frameAt(y / innerHeight))
      : Math.abs(from.i - n) === 1 && !stations[Math.min(from.i, n)]._video;
    if (reduce) scrollTo(0, y);
    else if (ff) await fastForward(y, 450 + Math.min(550, Math.abs(y - scrollY) / innerHeight * 300));
    else {
      html.classList.add('cut'); await sleep(250);
      scrollTo(0, y); cur = y / innerHeight; warm(n); render(cur, true);
      const im = $('img.bg', st);
      await Promise.race([st._take ? take.when(frameAt(cur)) : (im && im.decode ? im.decode().catch(() => {}) : 0), sleep(1400)]);
      requestAnimationFrame(() => html.classList.remove('cut'));
    }
    jumping = false; wake();
  }
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#s"]'); if (!a) return;
    const n = +a.getAttribute('href').slice(2); if (!stations[n]) return;
    e.preventDefault(); go(n);
  });
  addEventListener('popstate', () => go(+(location.hash.slice(2) || 0), false));
  addEventListener('keydown', e => {
    if ((e.target.closest && e.target.closest('input,textarea,dialog')) || e.metaKey || e.ctrlKey || e.altKey) return;
    const i = locate(scrollY / innerHeight), here = i.hold ? i.i : i.i + (i.t > .5 ? 1 : 0);
    if (e.key === 'ArrowRight' || e.key === ']') { e.preventDefault(); go(Math.min(stations.length - 1, here + 1)); }
    if (e.key === 'ArrowLeft' || e.key === '[') { e.preventDefault(); go(Math.max(0, here - 1)); }
  });
  // rail is one tab stop; ← → move between ticks inside it
  ticks.forEach((a, k) => { a.tabIndex = k ? -1 : 0; });
  rail.addEventListener('keydown', e => {
    const k = ticks.indexOf(document.activeElement); if (k < 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault(); e.stopPropagation();
      const j = clamp(k + (e.key === 'ArrowRight' ? 1 : -1), 0, ticks.length - 1);
      ticks[k].tabIndex = -1; ticks[j].tabIndex = 0; ticks[j].focus();
    }
  });
  // TOC hover warms that station's still
  $$('.hero .toc a').forEach(a => a.addEventListener('pointerenter', () => warm(+a.getAttribute('href').slice(2)), { once: true }));

  // ---- layout ----
  // crossing the desktop breakpoint either way rebuilds the page in the other mode, at the same station
  // (the head script picks film or stack on load; the stack half below does the same on its side)
  matchMedia('(min-width:1024px) and (min-height:560px)').addEventListener('change', () => {
    const i = locate(scrollY / innerHeight).i;
    history.replaceState(null, '', i ? '#s' + i : location.pathname);
    location.reload();
  });
  function layout() {
    size(); sizeCanvas(); placeNotes(); placeZones(); fit(); render(cur, true);
  }
  addEventListener('resize', () => { clearTimeout(layout._t); layout._t = setTimeout(layout, 120); });
  addEventListener('load', () => setTimeout(() => { fit(); wake(); }, 60));
  document.fonts && document.fonts.ready.then(fit);
  placeNotes(); placeZones(); fit();
  const h = +(location.hash.match(/^#s(\d)/) || [])[1];
  if (h) { const st = stations[h]; scrollTo(0, (st._y0 + .22 * (st._y1 - st._y0)) * innerHeight); cur = scrollY / innerHeight; }
  take.target = Math.round(frameAt(Math.min(cur, TAKE_END)));
  take.start();
  warm(0); render(cur, true); wake();
  // QA hook: render a scroll position synchronously (rAF pauses in hidden tabs)
  window.WEACT_ROAD = {
    go, frameAt, take,
    at(v) { scrollTo(0, v * innerHeight); cur = v; warm(locate(v).i); render(v, true); return locate(v); },
    stations: stations.map(s => [s.id, s._y0, s._y1]), tail: stations.filter(s => s._tail).map(s => s._tail),
  };
})();

/* stack mode: the rail is a fixed bar that follows the sections */
(function () {
  const html = document.documentElement;
  if (html.classList.contains('film')) return;
  document.querySelectorAll('img[data-src]').forEach(im => {
    im.loading = 'lazy'; im.sizes = '100vw'; im.srcset = im.dataset.srcset || ''; im.src = im.dataset.src;
  });
  if (html.classList.contains('snap')) return;   // snap.js drives the rail over the film (snap mode)
  const ticks = [...document.querySelectorAll('.rail a')], secs = ticks.map(a => document.getElementById(a.getAttribute('href').slice(1)));
  const cam = document.querySelector('.rail .cam'), fill = document.querySelector('.rail .fill');
  const top = document.querySelector('.top'), rail = document.querySelector('.rail'), all = [...document.querySelectorAll('.road > .stop')];
  function upd() {
    const y = scrollY + innerHeight * .5; let x = 0;
    secs.forEach((s, i) => {
      if (!s) return;
      const a = s.offsetTop, b = secs[i + 1] ? secs[i + 1].offsetTop : a + s.offsetHeight;
      if (y >= a) x = i + Math.min(1, (y - a) / (b - a)) * (i < secs.length - 1 ? 1 : 0);
      ticks[i].classList.toggle('cur', y >= a && y < b);
    });
    // the bars take the light of the section under them: day on the lawn and from 03 on, night at the fire
    const here = all.filter(s => s.offsetTop <= scrollY + 60).pop() || all[0];
    const day = here.classList.contains('t-day');
    top.classList.toggle('t-day', day); rail.classList.toggle('t-day', day);
    const p = Math.min(100, x / (ticks.length - 1) * 100);
    cam.style.left = p + '%'; fill.style.width = p + '%';
  }
  addEventListener('scroll', upd, { passive: true }); addEventListener('resize', upd); upd();
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  // remembered while you scroll, not while the window resizes (a resize moves the sections and scrolls by itself)
  let here = document.getElementById(location.hash.slice(1)) || null, resized = 0;
  addEventListener('resize', () => { resized = performance.now(); });
  addEventListener('scroll', () => { if (performance.now() - resized > 600) here = all.filter(s => s.offsetTop <= scrollY + 60).pop(); }, { passive: true });
  matchMedia('(min-width:1024px) and (min-height:560px)').addEventListener('change', e => {
    if (!e.matches || calm.matches || /[?&]mode=stack/.test(location.search)) return;
    history.replaceState(null, '', here && here.id && here.id !== 's0' ? '#' + here.id : location.pathname);
    location.reload();
  });
})();
