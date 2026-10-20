return (function(){
  const app = document.querySelector('.app'); if(!app) return {err:'no .app'};
  const ar = app.getBoundingClientRect();
  const scrollers = [...document.querySelectorAll('.chips,.days,.following')];
  const off = [];
  app.querySelectorAll('*').forEach(el => {
    if (el.closest('svg') && el.tagName !== 'svg') return;
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return;
    if (el.closest('.sheet--closed')) return;
    if (scrollers.some(s => s !== el && s.contains(el))) return;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
    if (r.right > ar.right + 1 || r.left < ar.left - 1) off.push((el.className && el.className.baseVal === undefined ? el.className : el.tagName) + ' ' + Math.round(r.left) + '..' + Math.round(r.right) + ' "' + (el.textContent||'').trim().slice(0,24) + '"');
  });
  // text clipped by overflow:hidden + ellipsis (truncation) among visible nodes
  const trunc = [];
  app.querySelectorAll('.tm,.sig__t,.sig__m,.pl__t b,.shead__t h2').forEach(el => { if (el.scrollWidth > el.clientWidth + 1) trunc.push(el.textContent.trim().slice(0,30)); });
  const small = [];
  app.querySelectorAll('button,a').forEach(el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); if (r.width && r.height && cs.visibility !== 'hidden' && !el.closest('.sheet--closed') && (r.height < 43.5 || r.width < 43.5) && !el.closest('svg')) small.push((el.className||el.tagName)+' '+Math.round(r.width)+'x'+Math.round(r.height)+' "'+(el.getAttribute('aria-label')||el.textContent||'').trim().slice(0,20)+'"'); });
  return { appW: Math.round(ar.width), docW: document.documentElement.scrollWidth, off: off.slice(0,12), trunc, small: small.slice(0,25),
    fontBody: document.fonts && document.fonts.check('16px Barlow'), fontCond: document.fonts && document.fonts.check('700 16px "Barlow Condensed"'),
    support: { backdrop: CSS.supports('backdrop-filter','blur(1px)'), webkitBackdrop: CSS.supports('-webkit-backdrop-filter','blur(1px)'), inset: CSS.supports('inset','0'), gap: CSS.supports('gap','1px'), textWrap: CSS.supports('text-wrap','balance'), overscroll: CSS.supports('overscroll-behavior','contain'), inert: 'inert' in HTMLElement.prototype, sticky: CSS.supports('position','sticky') } };
})();
