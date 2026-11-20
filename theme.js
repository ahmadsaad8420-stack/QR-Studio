'use strict';
// Shared by every page: theme (light/dark) handling and footer year.
(() => {
  const KEY = 'qr-studio-theme';
  const store = {
    get() { try { return localStorage.getItem(KEY); } catch { return null; } },
    set(v) { try { localStorage.setItem(KEY, v); } catch { /* storage unavailable */ } }
  };
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const valid = v => (v === 'dark' || v === 'light') ? v : null;

  function apply(theme, persist) {
    const t = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = t;
    document.documentElement.style.colorScheme = t;
    const btn = document.getElementById('themeToggle');
    if (btn) {
      const label = t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
      btn.textContent = t === 'dark' ? '☀' : '◐';
      btn.setAttribute('aria-label', label);
      btn.title = label;
    }
    if (persist) store.set(t);
  }

  apply(valid(store.get()) || (media && media.matches ? 'dark' : 'light'), false);

  if (media) {
    const onChange = e => { if (!valid(store.get())) apply(e.matches ? 'dark' : 'light', false); };
    if (media.addEventListener) media.addEventListener('change', onChange);
    else if (media.addListener) media.addListener(onChange);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const year = document.getElementById('year');
    if (year) year.textContent = new Date().getFullYear();
    const btn = document.getElementById('themeToggle');
    if (btn) {
      apply(document.documentElement.dataset.theme, false);
      btn.addEventListener('click', () =>
        apply(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true));
    }
  });
})();
