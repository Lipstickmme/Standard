/* ==========================================================================
   Motion for the public site.

   Everything here is decoration on top of pages that already work without it:
   with JavaScript off, or with reduced motion asked for, every element is
   simply where it belongs and every figure reads its real value.

   - Section content rises into place as it scrolls into view (the reveal
     machinery itself is SMB.observeReveals in main.js; this file only
     decides what takes part).
   - Figures count up from zero the first time they are seen.
   - Glass cards catch a soft light under the pointer.
   - The nav turns to frosted glass once the page moves under it.
   - The hero photograph drifts a little slower than the page.
   ========================================================================== */
(function () {
  'use strict';

  const SMB = window.SMB;
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- the nav: glass once scrolled ---- */
  const nav = document.querySelector('.rf-marketing-nav');
  const hero = document.querySelector('.rf-hero');
  const heroPhoto = hero && hero.querySelector('.rf-hero-photo');
  let ticking = false;
  function frame() {
    ticking = false;
    const y = window.scrollY || 0;
    if (nav) nav.classList.toggle('is-scrolled', y > 8);
    if (heroPhoto && !reduceMotion && y < window.innerHeight * 1.2) {
      heroPhoto.style.translate = `0 ${(y * 0.18).toFixed(1)}px`;
    }
  }
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(frame);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  frame();

  if (reduceMotion) return;
  document.documentElement.classList.add('rf-motion');

  /* ---- reveals ---- */
  const TARGETS = [
    '.rf-section .rf-eyebrow', '.rf-section h2', '.rf-section .section-lede',
    '.rf-section .rf-grid > *', '.rf-section blockquote', '.rf-section .rf-card',
    '.rf-section table', '.rf-section form', '.rf-cta-card',
  ].join(',');
  $$(TARGETS).forEach((el) => {
    // One reveal per branch: a card inside a revealing grid cell rides along
    // with its cell rather than arriving a second time.
    if (el.parentElement && el.parentElement.closest('[data-reveal]')) return;
    el.setAttribute('data-reveal', '');
  });
  if (SMB && SMB.observeReveals) SMB.observeReveals();

  /* ---- count-up figures ----
     Only the first text node holding a number moves, so "4.35% APY" keeps
     its <small> and "$25.00" keeps its dollar sign. Values with a slash
     ("24 / 7") are left alone: they are not quantities. */
  const FIGURES = '.rf-hero-stats .v, .rf-stat .v, .rf-product .rate, .rf-amt';
  const NUMBER = /^(\D*?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(.*)$/;

  function firstNumberNode(el) {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walk.nextNode())) if (/\d/.test(node.nodeValue)) return node;
    return null;
  }

  function countUp(node) {
    const text = node.nodeValue;
    if (text.includes('/')) return;
    const m = text.trim().match(NUMBER);
    if (!m) return;
    const [, prefix, whole, frac = '', suffix] = m;
    const lead = text.slice(0, text.indexOf(text.trim()));
    const decimals = frac ? frac.length - 1 : 0;
    const target = parseFloat(whole.replace(/,/g, '') + frac);
    const commas = whole.includes(',');
    const fmt = (v) => {
      const s = v.toFixed(decimals);
      if (!commas) return s;
      const [w, f] = s.split('.');
      return w.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : '');
    };
    const start = performance.now();
    const DURATION = 1400;
    const step = (now) => {
      const t = Math.min(1, (now - start) / DURATION);
      const eased = 1 - Math.pow(1 - t, 4);
      node.nodeValue = lead + prefix + fmt(target * eased) + suffix;
      if (t < 1) requestAnimationFrame(step);
      else node.nodeValue = text;
    };
    requestAnimationFrame(step);
  }

  if ('IntersectionObserver' in window) {
    const seen = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        seen.unobserve(e.target);
        const node = firstNumberNode(e.target);
        if (node) countUp(node);
      });
    }, { threshold: 0.4 });
    $$(FIGURES).forEach((el) => seen.observe(el));
  }

  /* ---- light under the pointer ---- */
  const LIT = '.rf-site .rf-card, .rf-site .rf-product, .rf-hero-stats, .rf-cta-card';
  document.addEventListener('pointermove', (e) => {
    const card = e.target.closest && e.target.closest(LIT);
    if (!card) return;
    const box = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${(e.clientX - box.left).toFixed(0)}px`);
    card.style.setProperty('--my', `${(e.clientY - box.top).toFixed(0)}px`);
  }, { passive: true });
})();
