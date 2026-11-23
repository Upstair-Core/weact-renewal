/* Shared behaviour: masthead, search palette (/), tabs, filters, copy, the 시안 A·B·C switch and B's donate panel. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const html = document.documentElement;
  // the English pages (page.en.html) carry lang="en": the few words written here follow it
  const EN = html.lang === 'en', tr = (ko, en) => EN ? en : ko;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- masthead gets a backing once the page scrolls ----------
  const top = $('.top');
  if (top && !html.classList.contains('film')) {
    const upd = () => top.classList.toggle('solid', scrollY > 24);
    addEventListener('scroll', upd, { passive: true }); upd();
  }

  // ---------- search palette ----------
  const IDX = (window.WEACT && WEACT.index) || [];
  const dlg = $('#find');
  if (dlg) {
    const input = $('input', dlg), list = $('ul', dlg);
    let items = [], sel = 0;
    const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[\s·.,'"!?()~\-]/g, '');
    IDX.forEach(e => { e._n = norm(e.n); e._k = norm(e.k); e._s = norm(e.s); });
    function score(e, q) {
      if (e._n === q) return 98;
      if (e._n.startsWith(q)) return 90;
      if (e._k && e._k.split(' ').some(w => w.startsWith(q))) return 82;
      if (e._k && e._k.startsWith(q)) return 80;
      if (e._n.includes(q)) return 75;
      if (e._s.includes(q)) return 55;
      if (e._k && e._k.includes(q)) return 45;
      return 0;
    }
    function hl(name, raw) {
      const q = raw.trim(); if (!q) return esc(name);
      const i = name.toLowerCase().indexOf(q.toLowerCase());
      return i < 0 ? esc(name) : esc(name.slice(0, i)) + '<mark>' + esc(name.slice(i, i + q.length)) + '</mark>' + esc(name.slice(i + q.length));
    }
    function row(e, q, i) {
      const th = e.i ? `<img class="th" src="${e.i}" alt="" loading="lazy">` : `<span class="th box">${esc(e.b || '')}</span>`;
      return `<li role="option" id="fo${i}" aria-selected="${i === sel}"><a href="${e.h}"${e.x ? ' target="_blank" rel="noopener"' : ''}>${th}<span class="tx"><b>${hl(e.n, q)}</b><span>${esc(e.s || '')}</span></span><span class="k">${esc(e.g)}</span></a></li>`;
    }
    function run() {
      const raw = input.value, q = norm(raw);
      if (!q) items = IDX.filter(e => e.home);
      else items = IDX.map(e => [score(e, q), e]).filter(x => x[0]).sort((a, b) => b[0] - a[0]).slice(0, 40).map(x => x[1]);
      sel = 0;
      list.innerHTML = items.length ? items.map((e, i) => row(e, raw, i)).join('') : `<li class="empty">${tr(`‘${esc(raw)}’에 맞는 아이·소식이 없습니다.`, `Nothing found for ‘${esc(raw)}’.`)}</li>`;
      input.setAttribute('aria-activedescendant', items.length ? 'fo0' : '');
    }
    function move(d) {
      if (!items.length) return;
      sel = (sel + d + items.length) % items.length;
      $$('li[role=option]', list).forEach((li, i) => li.setAttribute('aria-selected', i === sel));
      const li = $('#fo' + sel, list); li && li.scrollIntoView({ block: 'nearest' });
      input.setAttribute('aria-activedescendant', 'fo' + sel);
    }
    const open = () => { if (dlg.open) return; dlg.showModal(); input.value = ''; run(); input.focus(); };
    $$('.find').forEach(b => b.addEventListener('click', open));
    addEventListener('keydown', e => {
      if (e.key === '/' && !(e.target.closest && e.target.closest('input,textarea,[contenteditable]')) && !$('dialog[open]')) { e.preventDefault(); open(); }
    });
    input.addEventListener('input', run);
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      if (e.key === 'Enter' && items[sel]) { e.preventDefault(); $('#fo' + sel + ' a', list).click(); }
    });
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    list.addEventListener('click', e => { if (e.target.closest('a')) dlg.close(); });
  }

  // ---------- hover clips (mouse only, after 140ms of real intent) ----------
  if (matchMedia('(hover: hover) and (pointer: fine)').matches && !reduce && !(navigator.connection && navigator.connection.saveData)) {
    let timer = 0;
    document.addEventListener('pointerover', e => {
      const card = e.target.closest('[data-clip]'); if (!card || card.contains(e.relatedTarget)) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const pic = $('.pic', card); let v = $('video', pic);
        if (!v) { v = Object.assign(document.createElement('video'), { muted: true, loop: true, playsInline: true, preload: 'auto' }); v.setAttribute('aria-hidden', 'true'); pic.appendChild(v); }
        v.src = card.dataset.clip; v.play().then(() => pic.classList.add('playing')).catch(() => {});
      }, 140);
    });
    document.addEventListener('pointerout', e => {
      const card = e.target.closest('[data-clip]'); if (!card || card.contains(e.relatedTarget)) return;
      clearTimeout(timer);
      const pic = $('.pic', card), v = $('video', pic);
      if (v) { pic.classList.remove('playing'); setTimeout(() => { if (!pic.classList.contains('playing')) { v.pause(); v.removeAttribute('src'); v.load(); } }, 260); }
    });
  }

  // ---------- film player (never starts by itself) ----------
  const FILMS = (window.WEACT && WEACT.films) || {};
  const film = $('#film');
  if (film) {
    const v = $('video', film), ruler = $('.ruler', film), head = $('.head', ruler), done = $('.done', ruler), buf = $('.buf', ruler);
    const tEl = $('.time', film), big = $('.big', film), pp = $('[data-pp]', film), mu = $('[data-mute]', film), fs = $('[data-fs]', film);
    const fmt = s => { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    let idle = 0;
    const ICON = { play: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 2.5v11l9-5.5z"/></svg>', pause: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4.5 2.5v11M11.5 2.5v11"/></svg>' };
    function ticks(d) {
      $$('.tk', ruler).forEach(t => t.remove());
      const minor = d > 120 ? 10 : d > 40 ? 5 : 1, major = d > 120 ? 60 : d > 40 ? 15 : 5;
      for (let s = 0; s <= d; s += minor) {
        const t = document.createElement('i'); t.className = 'tk' + (s % major === 0 ? ' lg' : ''); t.style.left = (s / d * 100) + '%';
        if (s % major === 0) t.innerHTML = `<span>${fmt(s)}</span>`;
        ruler.insertBefore(t, head);
      }
    }
    function sync() {
      const d = v.duration || 0, p = d ? v.currentTime / d : 0;
      head.style.left = p * 100 + '%'; done.style.width = p * 100 + '%';
      tEl.textContent = fmt(v.currentTime) + ' / ' + fmt(d);
      if (v.buffered.length) buf.style.width = (v.buffered.end(v.buffered.length - 1) / (d || 1) * 100) + '%';
    }
    function setPlaying() { film.classList.toggle('playing', !v.paused); pp.innerHTML = v.paused ? ICON.play : ICON.pause; pp.setAttribute('aria-label', v.paused ? tr('재생', 'Play') : tr('일시정지', 'Pause')); }
    function poke() { film.classList.remove('idle'); clearTimeout(idle); if (!v.paused && !reduce && !film.contains(document.activeElement.closest && document.activeElement.closest('.ctl'))) idle = setTimeout(() => film.classList.add('idle'), 2600); }
    const toggle = () => { v.paused ? v.play() : v.pause(); };
    function openFilm(key) {
      const f = FILMS[key]; if (!f) return;
      v.src = f.src; v.poster = f.poster; v.muted = false;
      $('.tt', film).innerHTML = `${esc(f.title)}<em>${esc(f.sub || '')}</em>`;
      film.showModal(); ticks(f.dur); sync(); setPlaying(); big.focus();
    }
    document.addEventListener('click', e => { const a = e.target.closest('[data-film]'); if (!a) return; e.preventDefault(); openFilm(a.dataset.film); });
    big.addEventListener('click', toggle); pp.addEventListener('click', toggle); v.addEventListener('click', toggle);
    v.addEventListener('play', () => { setPlaying(); poke(); }); v.addEventListener('pause', () => { setPlaying(); poke(); });
    v.addEventListener('timeupdate', sync); v.addEventListener('progress', sync); v.addEventListener('loadedmetadata', () => { ticks(v.duration); sync(); });
    mu.addEventListener('click', () => { v.muted = !v.muted; mu.setAttribute('aria-pressed', v.muted); mu.textContent = v.muted ? tr('소리 꺼짐', 'Muted') : tr('소리', 'Sound'); });
    fs.addEventListener('click', () => { document.fullscreenElement ? document.exitFullscreen() : $('.stage', film).requestFullscreen && $('.stage', film).requestFullscreen(); });
    $('.close', film).addEventListener('click', () => film.close());
    film.addEventListener('close', () => { v.pause(); v.removeAttribute('src'); v.load(); });
    film.addEventListener('pointermove', poke);
    let drag = false;
    const seek = e => { const r = ruler.getBoundingClientRect(); v.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (v.duration || 0); sync(); };
    ruler.addEventListener('pointerdown', e => { drag = true; seek(e); try { ruler.setPointerCapture(e.pointerId); } catch (_) {} });
    ruler.addEventListener('pointermove', e => drag && seek(e));
    ruler.addEventListener('pointerup', () => drag = false);
    ruler.addEventListener('keydown', e => { if (e.key === 'Home') v.currentTime = 0; if (e.key === 'End') v.currentTime = v.duration || 0; });
    film.addEventListener('keydown', e => {
      poke();
      if (e.key === ' ' || e.key === 'k') { if (e.target.closest('button') && e.key === ' ') return; e.preventDefault(); toggle(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); v.currentTime += 5; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); v.currentTime -= 5; }
      if (e.key === 'm') mu.click();
      if (e.key === 'f') fs.click();
      if (/^[0-9]$/.test(e.key)) v.currentTime = (v.duration || 0) * (+e.key / 10);
    });
  }

  // ---------- tabs (hash-synced) ----------
  $$('[role=tablist]').forEach(tl => {
    const tabs = $$('[role=tab]', tl);
    function pick(tab, push) {
      tabs.forEach(t => { const on = t === tab; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; const p = document.getElementById(t.getAttribute('aria-controls')); p && (p.hidden = !on); });
      if (push && tl.dataset.hash !== undefined) history.replaceState(null, '', '#' + tab.getAttribute('aria-controls'));
      tl.dispatchEvent(new CustomEvent('pick', { detail: tab }));
    }
    tabs.forEach(t => t.addEventListener('click', e => { e.preventDefault(); pick(t, true); }));
    tl.addEventListener('keydown', e => {
      const i = tabs.indexOf(document.activeElement); if (i < 0) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const j = (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; tabs[j].focus(); pick(tabs[j], true); }
    });
    const h = location.hash.slice(1), start = tabs.find(t => t.getAttribute('aria-controls') === h) || tabs.find(t => t.getAttribute('aria-selected') === 'true') || tabs[0];
    pick(start, false);
  });

  // ---------- adoption filters ----------
  const grid = $('[data-filter-grid]');
  if (grid) {
    const state = { size: 'all', sex: 'all' };
    const apply = () => {
      $$('[data-panel]').forEach(panel => {
        let n = 0;
        $$('.card', panel).forEach(c => {
          const ok = (state.size === 'all' || c.dataset.size === state.size) && (state.sex === 'all' || c.dataset.sex === state.sex);
          c.closest('li').hidden = !ok; n += ok;
        });
        const em = $('.none', panel); em && (em.hidden = n > 0);
      });
    };
    $$('.chip[data-k]').forEach(ch => ch.addEventListener('click', () => {
      const k = ch.dataset.k; state[k] = ch.dataset.v;
      $$(`.chip[data-k="${k}"]`).forEach(c => c.setAttribute('aria-pressed', c === ch));
      apply();
    }));
  }

  // ---------- copy ----------
  $$('[data-copy]').forEach(b => b.addEventListener('click', () => {
    const base = b.dataset.label || b.textContent;
    b.dataset.label = base;
    (navigator.clipboard ? navigator.clipboard.writeText(b.dataset.copy) : Promise.reject()).then(() => {
      b.textContent = base + ' ✓'; setTimeout(() => b.textContent = base, 2200);
    }).catch(() => { b.textContent = b.dataset.copy; });
  }));

  // ---------- donate box: switching 정기/일시 changes only the button and one word, never the layout ----------
  // One choice per visit (mode 0 = 정기, 1 = 일시 · amount in won), shared by every box on the page and B's dock,
  // and kept for the visit (sessionStorage) so the next page opens with it.
  const give = { mode: 0, amt: '20000' };
  try { const g = JSON.parse(sessionStorage.getItem('weact-give') || 'null'); if (g) { give.mode = g.mode ? 1 : 0; give.amt = String(g.amt || '').replace(/\D/g, '') || give.amt; } } catch (e) {}
  const fmtW = n => n ? Number(n).toLocaleString('ko-KR') : '';
  const setters = [];
  let quiet = false;
  const share = from => {
    try { sessionStorage.setItem('weact-give', JSON.stringify(give)); } catch (e) {}
    quiet = true; setters.forEach(([box, set]) => box !== from && set()); quiet = false;
    document.dispatchEvent(new CustomEvent('give'));
  };
  $$('[data-give]').forEach(box => {
    const inp = $('input', box), go = $('[data-go]', box), unit = $('span[data-unit]', box);
    const tl = $('[role=tablist]', box), tabs = $$('[role=tab]', box), chips = $$('.chip[data-amt]', box);
    const press = () => chips.forEach(c => c.setAttribute('aria-pressed', c.dataset.amt === give.amt));
    inp.addEventListener('input', () => { give.amt = inp.value.replace(/[^0-9]/g, ''); inp.value = fmtW(give.amt); press(); share(box); });
    chips.forEach(c => c.addEventListener('click', () => { give.amt = c.dataset.amt; inp.value = fmtW(give.amt); press(); share(box); }));
    tl && tl.addEventListener('pick', e => {
      const t = e.detail;
      go.href = t.dataset.href; go.textContent = t.dataset.cta; unit.textContent = t.dataset.unit;
      if (!quiet) { give.mode = tabs.indexOf(t); share(box); }
    });
    setters.push([box, () => { inp.value = fmtW(give.amt); press(); const t = tabs[give.mode]; t && t.getAttribute('aria-selected') !== 'true' && t.click(); }]);
  });
  quiet = true; setters.forEach(([, set]) => set()); quiet = false;

  // ---------- 시안 A · B · C ----------
  // the choice lives on <html data-v> (set in the head before paint) and in localStorage; the two homes swap pages
  const vt = $('.vtoggle');
  if (vt) {
    const mark = () => $$('button', vt).forEach(b => b.setAttribute('aria-pressed', b.dataset.v === html.dataset.v));
    mark();
    vt.addEventListener('click', e => {
      const b = e.target.closest('button[data-v]'); if (!b) return;
      const v = b.dataset.v, pg = document.body.dataset.page, base = document.body.dataset.base || '';
      try { localStorage.setItem('weact-v', v); } catch (err) {}
      const sfx = EN ? '.en.html' : '.html', homes = { a: 'index' + sfx, b: 'index-b' + sfx, c: 'index-c' + sfx };
      if (/^index(-[bc])?$/.test(pg)) { location.href = base + homes[v]; return; }
      html.dataset.v = v; mark();
      document.dispatchEvent(new CustomEvent('variant', { detail: v }));
    });
  }

  // ---------- A·B안: the give dock (the give bar's summary, on the right edge) · B안: the panel the masthead opens ----------
  const dock = $('.vb-dock'), dr = $('#give-drawer'), veil = $('.gd-veil');
  if (dock && dr) {
    const isB = () => html.dataset.v === 'b', docked = () => html.dataset.v !== 'c';
    const onDonate = document.body.dataset.page === 'donate';
    const seg = $$('.vd-seg button', dock), go = $('.vd-go', dock);
    // the give bar on the first screen: the A home has two (one in the snap film, one on the road), and the one its mode
    // does not use is display:none, which has no box
    const bars = $$('.qgive'), foot = $('.foot');
    const barNow = () => bars.find(q => q.getClientRects().length);
    const paint = () => {
      seg.forEach((b, i) => b.setAttribute('aria-pressed', i === give.mode));
      go.href = seg[give.mode].dataset.href;
      go.setAttribute('aria-label', seg[give.mode].dataset.label || '');
    };
    seg.forEach((b, i) => b.addEventListener('click', () => { give.mode = i; share(null); }));
    document.addEventListener('give', paint); paint();
    // it waits until the cover's bar has gone (or, on other pages, until the first screen has), and steps aside for the footer
    const show = () => {
      let v = docked() && !onDonate && !dr.classList.contains('open');
      const qbar = barNow();
      // the bar fades by an inline opacity on B's cover (b.js) and by --ho in the A hero (home.css): the computed value
      if (v && qbar) { const r = qbar.getBoundingClientRect(), o = parseFloat(qbar.style.opacity || getComputedStyle(qbar).opacity);
        v = !(o > .5 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(qbar).visibility !== 'hidden'); }
      // no bar: a page waits until its first screen has gone. The A home's snap film keeps the page still and, on a phone,
      // has no room for the bar: there the dock is the bar, from the start
      else if (v && !html.classList.contains('snap')) v = scrollY > innerHeight * .7;
      // (the A home in film mode draws no footer: display:none has no box, and its top would read 0)
      if (v && foot && foot.getClientRects().length) v = foot.getBoundingClientRect().top > innerHeight - 24;
      dock.classList.toggle('in', v);
    };
    window.weactDock = show;
    addEventListener('scroll', show, { passive: true }); addEventListener('resize', show); document.addEventListener('variant', show); show();
    // a bar that has finished fading in or out moves the dock even when nothing scrolled (the snap film's bar goes with
    // its first words; B's settles .25 s after the last scroll)
    bars.forEach(q => q.addEventListener('transitionend', e => { if (e.target === q) show(); }));
    let back = null;
    const open = () => {
      back = document.activeElement; dr.hidden = false; veil.hidden = false;
      requestAnimationFrame(() => { dr.classList.add('open'); veil.classList.add('open'); show(); });
      $('.seg [aria-selected=true]', dr).focus();
    };
    const close = () => {
      dr.classList.remove('open'); veil.classList.remove('open'); show();
      setTimeout(() => { if (!dr.classList.contains('open')) { dr.hidden = true; veil.hidden = true; } }, reduce ? 0 : 360);
      back && back.focus && back.focus();
    };
    $('.gd-x', dr).addEventListener('click', close); veil.addEventListener('click', close);
    addEventListener('keydown', e => { if (e.key === 'Escape' && dr.classList.contains('open')) close(); });
    // in B the masthead's 후원하기 opens the same panel (the full page stays one link away inside it)
    $$('.top .give').forEach(a => a.addEventListener('click', e => { if (isB() && !onDonate) { e.preventDefault(); open(); } }));
  }

  // ---------- B안 dog page: hearts kept in this browser, the wide photo carousel ----------
  const favKey = 'weact-fav';
  const favs = () => { try { return JSON.parse(localStorage.getItem(favKey) || '[]'); } catch (e) { return []; } };
  $$('[data-fav]').forEach(b => {
    const k = b.dataset.fav, set = on => { b.setAttribute('aria-pressed', on); b.querySelector('span').textContent = on ? tr('관심 아이로 저장됨', 'Saved to favourites') : tr('관심 아이로 저장', 'Save to favourites'); };
    set(favs().includes(k));
    b.addEventListener('click', () => {
      const f = favs(), on = !f.includes(k), next = on ? [...f, k] : f.filter(x => x !== k);
      try { localStorage.setItem(favKey, JSON.stringify(next)); } catch (e) {}
      set(on);
    });
  });
  $$('.car').forEach(car => {
    const track = $('.car-track', car), n = $$('img', track).length, cnt = $('.car-n', car);
    const step = () => { const im = $('img', track); return im ? im.getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || 0) : track.clientWidth; };
    const upd = () => { if (cnt) cnt.textContent = `${Math.min(n, Math.round(track.scrollLeft / step()) + 1)} / ${n}`; };
    $$('[data-step]', car).forEach(b => b.addEventListener('click', () => track.scrollBy({ left: step() * +b.dataset.step, behavior: reduce ? 'auto' : 'smooth' })));
    track.addEventListener('scroll', upd, { passive: true }); upd();
  });

  // ---------- numbers that count up once they come into view (입양) ----------
  // (on the home in film mode the stations are fixed layers, so home.js starts theirs when you arrive)
  const counts = $$('[data-count]').filter(el => !(html.classList.contains('film') && el.closest('.stop')));
  const run = el => {
    const to = +el.dataset.count, t0 = performance.now(), dur = 1600, id = (el._run = (el._run || 0) + 1);
    const step = now => {
      if (el._run !== id) return;   // a newer run took over
      const t = Math.min(1, (now - t0) / dur);
      el.textContent = Math.round(to * (1 - Math.pow(1 - t, 3))).toLocaleString('ko-KR');
      if (t < 1) requestAnimationFrame(step);
    };
    el.textContent = '0';
    requestAnimationFrame(step);
  };
  window.weactCount = reduce ? () => {} : run;
  if (counts.length && !reduce && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); run(e.target); } }), { threshold: .4 });
    counts.forEach(el => { el.textContent = '0'; io.observe(el); });
  }

  // ---------- dog gallery ----------
  const gal = $('.gal');
  if (gal) {
    const main = $('.gal .main img');
    $$('.gal .thumbs button').forEach(b => b.addEventListener('click', () => {
      main.src = b.dataset.src; $$('.gal .thumbs button').forEach(x => x.setAttribute('aria-current', x === b));
    }));
  }
  // ---------- 한국어 ↔ English: the same page in the other language, at the same place on it ----------
  document.querySelectorAll('a.lang').forEach(a => a.addEventListener('click', () => { if (location.hash) a.href = a.href.split('#')[0] + location.hash; }));
})();
