/* C안 home: how the words over the take fade, the 현장›집 rail on the right, the masthead's light, the 집 wall lighting
   as you scroll in, and the film cards that play only while they are on screen. (Count-up of the band is site.js's.)
   2026-11-26 ('01에서 02 넘어갈 때 자동으로 넘어가지 않게, 스크롤할 때 부드럽게'): the words no longer swap on a threshold
   with a timed fade. They sit in the page's flow and move with the finger; here they only fade with their distance from
   the middle of the screen, a pure function of the scroll position, so nothing ever moves on its own. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const upright = matchMedia('(max-width:1023px) and (orientation:portrait)');   // c.css: the take is a window at the top
  const top = $('.top'), rail = $('.c-rail'), words = $$('.c-pin .step .in');
  const marks = ['#c-field', '#c-rescue', '#c-care', '#c-adopt', '#c-home'].map(s => $(s));
  const tones = $$('[data-tone]');

  // y on the page where each rail stop is reached: 현장 as the take comes up, A when 구조 has the screen, C/T/집 their sections
  let stops = [];
  function measure() {
    const y = el => el.getBoundingClientRect().top + scrollY, vh = innerHeight;
    stops = [y(marks[0]) - vh * .2, y(marks[1]), y(marks[2]) - vh * .3, y(marks[3]) - vh * .3, y(marks[4]) - vh * .4];
  }

  // words over the take: fully there within 16% of the screen from the middle, gone 26% further on
  function fade() {
    const vh = innerHeight;
    for (const el of words) {
      if (upright.matches) { el.style.removeProperty('--o'); continue; }   // there they slide under the window's edge
      const r = el.getBoundingClientRect(), d = Math.abs(r.top + r.height / 2 - vh / 2);
      el.style.setProperty('--o', clamp(1 - (d - vh * .16) / (vh * .26)).toFixed(3));
    }
  }

  // ---- 집: A's wall (home.js finale). Every square lights once, scattered like windows at dusk; the children who found a
  // family light left to right and stay, drawing WE, which settles into act teal. p runs 0 → 1 as the section comes up
  // the screen, so it plays forwards and backwards with the scroll.
  const fin = $('#c-home'), wall = fin && $('.c-wall', fin), cells = wall ? $$('li', wall) : [];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;   // fixed sequence: the same wall every visit
  cells.forEach((li, i) => {
    const c = i % 22, we = li.classList.contains('w');
    li._a = we ? .3 + .42 * (c - 10) / 9 + .03 * rnd() : .03 + .4 * rnd();   // when it lights
    li._b = we ? 9 : li._a + .14 + .12 * rnd();                               // when it goes quiet again (never, for WE)
    li._on = false;
  });
  let finP = -1;
  function finale() {
    if (!wall) return;
    const vh = innerHeight, r = fin.getBoundingClientRect();
    const p = reduce ? 1 : Math.round(clamp((vh - r.top) / (vh * .9)) * 200) / 200;
    if (p === finP) return;
    finP = p;
    for (const li of cells) {
      const on = p >= li._a && p < li._b;
      if (on !== li._on) { li._on = on; li.classList.toggle('on', on); }
    }
    const formed = p >= .8;
    wall.classList.toggle('formed', formed); fin.classList.toggle('formed', formed);
  }
  // the wall's one picture (850 KB) is fetched only when the section is within two screens
  if (wall) {
    if ('IntersectionObserver' in window) {
      const near = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { wall.classList.add('near'); near.disconnect(); } }, { rootMargin: '200% 0px' });
      near.observe(fin);
    } else wall.classList.add('near');
  }

  function frame() {
    const s = scrollY;
    fade();
    finale();
    // rail: 0..4 between the stops
    let pos = 0;
    if (s >= stops[stops.length - 1]) pos = stops.length - 1;
    else for (let k = 0; k < stops.length - 1; k++) {
      if (s >= stops[k] && s < stops[k + 1]) { pos = k + (s - stops[k]) / (stops[k + 1] - stops[k]); break; }
    }
    const pct = (pos / (stops.length - 1)) * 100;
    if (rail) {
      $('.cam', rail).style.top = pct + '%'; $('.fill', rail).style.height = pct + '%';
      // the rail stays out of the way before the take and once 집's wall has the screen (it would stand on WE's last column)
      rail.classList.toggle('off', s < stops[0] - innerHeight * .4 || (fin && fin.getBoundingClientRect().top < innerHeight * .45));
    }
    // light: the section under the masthead decides
    const mid = innerHeight * .08;
    const under = tones.find(el => { const r = el.getBoundingClientRect(); return r.top <= mid && r.bottom > mid; });
    const day = under ? under.dataset.tone === 'day' : false;
    top && top.classList.toggle('t-day', day); top && top.classList.toggle('solid', s > 24);
    if (rail) {
      const rr = rail.getBoundingClientRect(), cy = rr.top + rr.height / 2;
      const behind = tones.find(el => { const r = el.getBoundingClientRect(); return r.top <= cy && r.bottom > cy; });
      rail.classList.toggle('day', behind ? behind.dataset.tone === 'day' : false);
    }
  }

  let raf = 0;
  const kick = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; frame(); }); };
  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', () => { measure(); kick(); });
  addEventListener('load', () => { measure(); kick(); });
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
