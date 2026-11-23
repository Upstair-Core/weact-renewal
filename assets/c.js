/* C안 home: which words stand over the looping take, the 현장›집 rail on the right, the masthead's light,
   and the film cards that play only while they are on screen. (Count-up of the band is site.js's.) */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const top = $('.top'), rail = $('.c-rail'), pin = $('.c-pin'), steps = $$('.c-pin .step');
  const marks = ['#c-field', '#c-field', '#c-care', '#c-adopt', '#c-home'].map(s => $(s));
  const tones = $$('[data-tone]');

  // y on the page where each rail stop is reached: 현장 = the take begins, A = halfway into it, C/T/집 = their sections
  let stops = [];
  function measure() {
    const y = el => el.getBoundingClientRect().top + scrollY;
    const p0 = y(pin), p1 = p0 + pin.offsetHeight - innerHeight;
    stops = [p0, p0 + (p1 - p0) * .45, y(marks[2]) - innerHeight * .3, y(marks[3]) - innerHeight * .3, y(marks[4]) - innerHeight * .4];
  }

  function frame() {
    const s = scrollY;
    // words over the take
    if (pin) {
      const p0 = stops[0], p1 = p0 + pin.offsetHeight - innerHeight;
      const t = Math.min(.999, Math.max(0, (s - p0) / Math.max(1, p1 - p0)));
      const i = Math.min(steps.length - 1, Math.floor(t * steps.length));
      steps.forEach((st, k) => st.classList.toggle('on', k === i));
    }
    // rail: 0..4 between the stops
    let pos = 0;
    if (s >= stops[stops.length - 1]) pos = stops.length - 1;
    else for (let k = 0; k < stops.length - 1; k++) {
      if (s >= stops[k] && s < stops[k + 1]) { pos = k + (s - stops[k]) / (stops[k + 1] - stops[k]); break; }
    }
    const pct = (pos / (stops.length - 1)) * 100;
    if (rail) {
      $('.cam', rail).style.top = pct + '%'; $('.fill', rail).style.height = pct + '%';
      rail.classList.toggle('off', s < stops[0] - innerHeight * .6);
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
