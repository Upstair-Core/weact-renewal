/* B안 home: scrolling down turns the strip to the right.
   - The stage sticks; the strip slides left. It glides between pages and slows as each page settles (GLIDE), so a
     chapter holds still long enough to read, and nothing ever stops dead.
   - Main and sub: each page's share of the screen decides how sharp it is (--f: 1 = the main one). The neighbour
     wears its soft copy; they trade places as the next one slides in. The words come with their picture (--nv).
   - The end: the last page stays put and the footer slides up over it (the book is one footer taller and the footer
     overlaps it), so the strip never turns into a vertical scroll mid-motion.
   Phones, short windows and reduced motion get the photographs stacked instead. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const html = document.documentElement;
  const book = $('.hbook'), stage = $('.stage', book), track = $('.track', book);
  const scenes = $$('.sc', track), phs = scenes.map(sc => $('.ph', sc));
  const top = $('.top'), rail = $('.b-rail'), qg = $('.qgive', track), foot = $('.foot');
  const wide = matchMedia('(min-width:1024px) and (min-height:560px)'), reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const chapters = ['#b-field', '#b-rescue', '#b-care', '#b-adopt', '#b-home'].map(s => scenes.indexOf($(s)));
  const DRIFT = .05, GLIDE = .4;
  let on = false, start = 0, max = 0, W = 0, FD = 0, fh = 0, geo = [], R = [];

  const clamp = v => Math.min(1, Math.max(0, v));
  const ease = t => t * t * (3 - 2 * t);

  function measure() {
    W = innerWidth;
    FD = parseFloat(getComputedStyle(book).getPropertyValue('--fd')) / 100 * W;
    geo = scenes.map(sc => ({ l: sc.offsetLeft, w: sc.offsetWidth }));
    const last = geo[geo.length - 1];
    max = Math.max(0, last.l + last.w - W);
    // where each page comes to rest: the cover at 0, a chapter centred on the screen (shifted by its data-bias, in vw,
    // so its subject stays clear of the card), the last one flush right
    R = geo.map((g, i) => i === 0 ? 0 : i === geo.length - 1 ? max
      : Math.min(max, Math.max(0, g.l + (g.w - W) / 2 + (+scenes[i].dataset.bias || 0) * W / 100)));
    fh = foot ? foot.offsetHeight : 0;
    book.style.height = (max + innerHeight + fh) + 'px';
    book.style.marginBottom = -fh + 'px';
    start = book.getBoundingClientRect().top + scrollY;
  }
  function layout() {
    on = wide.matches && !reduce.matches;
    html.classList.toggle('hb', on);
    top && top.classList.add('t-day');
    if (!on) {
      book.style.height = book.style.marginBottom = ''; track.style.transform = '';
      phs.forEach(p => p && (p.style.transform = ''));
      scenes.forEach(sc => { sc.style.removeProperty('--f'); sc.style.removeProperty('--nv'); });
      stage.style.removeProperty('--cover');
      if (qg) qg.style.opacity = qg.style.pointerEvents = '';
    } else measure();
    frame();
  }

  // scroll (into the book) → how far the strip has turned: the same distance overall, eased around each resting page
  function xAt(s) {
    if (s <= 0) return 0;
    if (s >= max) return max;
    let i = 0;
    while (i < R.length - 2 && s >= R[i + 1]) i++;
    const a = R[i], b = R[i + 1], t = (s - a) / ((b - a) || 1);
    return a + (b - a) * (GLIDE * t + (1 - GLIDE) * ease(t));
  }

  function frame() {
    const s = scrollY - start, x = on ? xAt(s) : 0;
    if (on) {
      track.style.transform = `translate3d(${-x}px,0,0)`;
      geo.forEach((g, i) => {
        const L = g.l - x, Rt = L + g.w;
        if (Rt < -W * .2 || L > W * 1.2) return;
        // its share of the screen, leaving out the halves of its dissolving edges
        const el = i ? L + FD / 2 : L, er = i < geo.length - 1 ? Rt - FD / 2 : Rt;
        const cov = Math.max(0, Math.min(W, er) - Math.max(0, el)) / W;
        // a short handover (about a fifth of a screen of scrolling), so one of the two is nearly always clearly the main one
        const f = ease(clamp((cov - .42) / .16)), nv = ease(clamp((f - .6) / .4));
        scenes[i].style.setProperty('--f', f.toFixed(3));
        scenes[i].style.setProperty('--nv', nv.toFixed(3));
        if (i && phs[i]) phs[i].style.transform = `translate3d(${(-(L + g.w / 2 - W / 2) * DRIFT).toFixed(1)}px,0,0) scale(1.08)`;
      });
      if (qg) { const o = Math.max(0, 1 - x / (W * .28)); qg.style.opacity = o.toFixed(3); qg.style.pointerEvents = o < .2 ? 'none' : ''; }
      stage.style.setProperty('--cover', clamp((s - max) / (fh || 1)).toFixed(3));
      // the rail: 현장 › 집 between the resting places of the five chapters
      if (rail) {
        const st = chapters.map(i => R[i]);
        let pos = 0;
        if (x >= st[4]) pos = 4;
        else for (let k = 0; k < 4; k++) if (x >= st[k] && x < st[k + 1]) { pos = k + (x - st[k]) / (st[k + 1] - st[k]); break; }
        $('.cam', rail).style.left = (pos * 25) + '%';
        $('.fill', rail).style.width = (pos * 25) + '%';
        rail.classList.toggle('off', x < st[0] - W * .6 || s > max - 4);
      }
    }
    window.weactDock && window.weactDock();
  }

  let raf = 0;
  const kick = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; frame(); }); };
  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', layout);
  wide.addEventListener('change', layout); reduce.addEventListener('change', layout);
  addEventListener('load', () => {
    layout();
    // decode every photograph ahead of time, so none stalls a frame the first time it slides in
    track.querySelectorAll('img').forEach(im => im.decode && im.decode().catch(() => {}));
  });
  layout();

  // the rail's stops turn to that chapter's resting place
  $$('a[href^="#b-"]').forEach(a => a.addEventListener('click', e => {
    const i = scenes.indexOf($(a.getAttribute('href'))); if (i < 0 || !on) return;
    e.preventDefault();
    scrollTo({ top: start + R[i], behavior: reduce.matches ? 'auto' : 'smooth' });
  }));

  // the cover film rests when it is off screen
  const vid = $('.cover video', track);
  if (vid && reduce.matches) { vid.removeAttribute('autoplay'); vid.pause(); }
  else if (vid && 'IntersectionObserver' in window) {
    new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? vid.play().catch(() => {}) : vid.pause()), { threshold: .05 }).observe(vid);
  }
})();
