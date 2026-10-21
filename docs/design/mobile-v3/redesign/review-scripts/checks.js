return (function () {
  const app = document.querySelector('.app'); if (!app) return { err: 'no .app' };
  const ar = app.getBoundingClientRect();
  const scrollers = [...document.querySelectorAll('.chips,.days,.leagues,.yours,.ptype')];
  const off = [];
  app.querySelectorAll('*').forEach((el) => {
    if (el.closest('svg') && el.tagName !== 'svg') return;
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return;
    if (el.closest('.sheet--closed')) return;
    if (scrollers.some((s) => s !== el && s.contains(el))) return;
    if (el.classList.contains('hbg') || el.classList.contains('gbg') || el.classList.contains('feat__ph') || el.classList.contains('dhero__ph')) return;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
    if (r.right > ar.right + 1 || r.left < ar.left - 1) off.push((el.className && el.className.baseVal === undefined ? el.className : el.tagName) + ' ' + Math.round(r.left) + '..' + Math.round(r.right) + ' "' + (el.textContent || '').trim().slice(0, 24) + '"');
  });
  const trunc = [];
  app.querySelectorAll('.gr__nm span,.prow__nm,.prow__t > em,.pcard__t b,.pcard__t em,.shead__t h2,.sg__t,.sg__m,.mk__t b,.scr__t b,.duel__k,.gsb__t b,.sbx__t b').forEach((el) => { if (el.scrollWidth > el.clientWidth + 1) trunc.push(el.textContent.trim().slice(0, 30)); });
  const small = [];
  app.querySelectorAll('button,a').forEach((el) => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (!r.width || !r.height || cs.visibility === 'hidden' || el.closest('.sheet--closed') || el.closest('svg')) return;
    let w = r.width, h = r.height; const a = getComputedStyle(el, '::after');
    if (a.content !== 'none' && a.position === 'absolute') { const px = (v) => parseFloat(v) || 0; w = r.width - px(a.left) - px(a.right); h = r.height - px(a.top) - px(a.bottom); }
    if (h < 43.5 || w < 43.5) small.push((el.className || el.tagName) + ' ' + Math.round(w) + 'x' + Math.round(h) + ' "' + (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 20) + '"');
  });
  const fs = []; // text under 12px
  const walker = document.createTreeWalker(app, NodeFilter.SHOW_TEXT); let n;
  while ((n = walker.nextNode())) { const t = n.nodeValue.trim(); if (!t) continue; const el = n.parentElement; if (!el || el.closest('svg,.sr,.sheet--closed,.status')) continue; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue; const r = el.getBoundingClientRect(); if (!r.width) continue; if (parseFloat(cs.fontSize) < 11.5 && !el.closest('.tab')) fs.push(parseFloat(cs.fontSize) + 'px "' + t.slice(0, 18) + '"'); }
  return { appW: Math.round(ar.width), docW: document.documentElement.scrollWidth, off: off.slice(0, 12), trunc, small: small.slice(0, 25), under12: fs.slice(0, 8),
    fonts: { geist: document.fonts.check('16px Geist'), sora: document.fonts.check('700 16px Sora') },
    support: { backdrop: CSS.supports('backdrop-filter', 'blur(1px)'), webkitBackdrop: CSS.supports('-webkit-backdrop-filter', 'blur(1px)'), inset: CSS.supports('inset', '0'), gap: CSS.supports('gap', '1px'), textWrap: CSS.supports('text-wrap', 'balance'), container: CSS.supports('container-type', 'inline-size'), maskImage: CSS.supports('-webkit-mask-image', 'linear-gradient(#000,transparent)'), inert: 'inert' in HTMLElement.prototype, sticky: CSS.supports('position', 'sticky') } };
})();
