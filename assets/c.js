/* C안 home: how the words over the take fade, the 현장›집 rail on the right, the masthead's light, the 집 wall lighting
   as you scroll in, and the film cards that play only while they are on screen. (Count-up of the band is site.js's.)
   2026-11-26 ('01에서 02 넘어갈 때 자동으로 넘어가지 않게, 스크롤할 때 부드럽게'): the words no longer swap on a threshold
   with a timed fade. They sit in the page's flow and move with the finger; on wide screens they only fade with their
   distance from where they belong, a pure function of the scroll position. Phones work the same way (the take stays
   behind, only the words change: the client asked for it as on a wide screen), on a 9:16 copy of the take.
   Second note the same day ('여전히 덜컹거리는 느낌'): a scroll frame reads no layout any more. Where everything sits is
   measured once (load, fonts, any change of the page's size) and each frame is arithmetic on scrollY plus a few writes,
   so the page never has to lay itself out again in the middle of a scroll. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const top = $('.top'), rail = $('.c-rail'), steps = $$('.c-pin .step');
  const cam = rail && $('.cam', rail), fill = rail && $('.fill', rail);
  const marks = ['#c-field', '#c-rescue', '#c-care', '#c-adopt', '#c-home'].map(s => $(s));
  const tones = $$('[data-tone]'), dawn = $('.c-dawn');
  const fin = $('#c-home'), wall = fin && $('.c-wall', fin), cells = wall ? $$('li', wall) : [];

  // ---- measured once, used every frame
  let vh = innerHeight, stops = [], spans = [], toneAt = [], finTop = 0, railShown = false;
  function measure() {
    const y = el => el.getBoundingClientRect().top + scrollY;
    vh = innerHeight;
    stops = [y(marks[0]) - vh * .2, y(marks[1]), y(marks[2]) - vh * .3, y(marks[3]) - vh * .3, y(marks[4]) - vh * .4];
    spans = steps.map(st => [$('.in', st), y(st)]);   // a step is a screen tall: its words are home when its top meets the screen's
    toneAt = tones.map(el => { const t = y(el); return [t, t + el.offsetHeight, el.dataset.tone === 'day']; });
    if (dawn) { const t = y(dawn), h = dawn.offsetHeight; toneAt.push([t, t + h * .55, false], [t + h * .55, t + h, true]); }   // night turns to day in it
    finTop = fin ? y(fin) : 0;
    railShown = !!rail && getComputedStyle(rail).display !== 'none';
    last = {};
  }
  const dayAt = py => { for (const [a, b, d] of toneAt) if (py >= a && py < b) return d; return false; };

  // ---- 집: A's wall (home.js finale). Every square lights once, scattered like windows at dusk; the children who found a
  // family light left to right and stay, drawing WE, which settles into act teal. p runs 0 → 1 as the section comes up
  // the screen, so it plays forwards and backwards with the scroll.
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;   // fixed sequence: the same wall every visit
  cells.forEach((li, i) => {
    const c = i % 22, we = li.classList.contains('w');
    li._a = we ? .3 + .42 * (c - 10) / 9 + .03 * rnd() : .03 + .4 * rnd();   // when it lights
    li._b = we ? 9 : li._a + .14 + .12 * rnd();                               // when it goes quiet again (never, for WE)
    li._on = false;
  });
  let finP = -1;
  function finale(s) {
    if (!wall) return;
    const p = reduce ? 1 : Math.round(clamp((vh - (finTop - s)) / (vh * .9)) * 200) / 200;
    if (p === finP) return;
    finP = p;
    for (const li of cells) {
      const on = p >= li._a && p < li._b;
      if (on !== li._on) { li._on = on; li.classList.toggle('on', on); }
    }
    const formed = p >= .8;
    wall.classList.toggle('formed', formed); fin.classList.toggle('formed', formed);
  }
  // the wall's one picture (850 KB) is fetched when the section is within two screens and decoded off the main thread
  // before the squares use it, so it does not land in the middle of a scroll
  if (wall) {
    const ready = () => wall.classList.add('near');
    const load = () => {
      const im = new Image(); im.decoding = 'async'; im.src = 'media/film/wall.webp?v=1';
      (im.decode ? im.decode() : Promise.resolve()).then(ready, ready);
    };
    if ('IntersectionObserver' in window) {
      const near = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { near.disconnect(); load(); } }, { rootMargin: '200% 0px' });
      near.observe(fin);
    } else load();
  }

  // ---- each frame: arithmetic on scrollY, and a write only where a value changed
  let last = {};
  const put = (k, v, fn) => { if (last[k] !== v) { last[k] = v; fn(v); } };
  function frame() {
    const s = scrollY;
    // words over the take: fully there while their step is within 16% of a screen from home, gone 26% further on
    // (centred words on a wide screen, words low over the picture on a phone: the same measure fits both)
    for (const [el, at] of spans) {
      const o = clamp(1 - (Math.abs(at - s) - vh * .16) / (vh * .26)).toFixed(3);
      if (el._o !== o) { el._o = o; el.style.setProperty('--o', o); }
    }
    finale(s);
    // the masthead's light: the section under it decides
    put('day', dayAt(s + vh * .08), d => top && top.classList.toggle('t-day', d));
    put('solid', s > 24, v => top && top.classList.toggle('solid', v));
    if (!railShown) return;
    // rail: 0..4 between the stops; out of the way before the take and once 집's wall has the screen
    let pos = 0;
    if (s >= stops[stops.length - 1]) pos = stops.length - 1;
    else for (let k = 0; k < stops.length - 1; k++) {
      if (s >= stops[k] && s < stops[k + 1]) { pos = k + (s - stops[k]) / (stops[k + 1] - stops[k]); break; }
    }
    const pct = ((pos / (stops.length - 1)) * 100).toFixed(2) + '%';
    put('pct', pct, v => { cam.style.top = v; fill.style.height = v; });
    put('off', s < stops[0] - vh * .4 || finTop - s < vh * .45, v => rail.classList.toggle('off', v));
    put('rday', dayAt(s + vh / 2), d => rail.classList.toggle('day', d));
  }

  let raf = 0;
  const kick = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; frame(); }); };
  const remeasure = () => { measure(); kick(); };
  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', remeasure);
  addEventListener('load', remeasure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
  if ('ResizeObserver' in window) new ResizeObserver(remeasure).observe(document.body);   // the page grew or shrank
  measure(); frame();

  // films play only while they are on screen (and not at all when motion is reduced)
  const vids = $$('.chome video');
  if (reduce) vids.forEach(v => { v.removeAttribute('autoplay'); v.pause(); });
  else if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      const v = e.target;
      if (e.isIntersecting) { if (v.preload === 'none') v.preload = 'auto'; v.play().catch(() => {}); } else v.pause();
    }), { threshold: .15 });
    vids.forEach(v => io.observe(v));
  }
})();
