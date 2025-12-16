// app.js — полный файл, копируй целиком и заменяй свой

// 1. Активная ссылка в меню (все страницы)
(() => {
  const links = document.querySelectorAll('.nav-link');
  if (!links.length) return;

  const normalize = (p = '') => {
    try {
      const u = new URL(p, location.origin);
      let path = u.pathname.replace(/index\.html$/, '');
      if (path === '') path = '/';
      return path + u.hash;
    } catch {
      return p;
    }
  };

  const setActive = () => {
    const current = normalize(location.pathname + location.hash);
    links.forEach(l => l.classList.remove('is-active'));

    if (location.hash === '#contacts') {
      const link = [...links].find(l => l.getAttribute('href') === '#contacts');
      link && link.classList.add('is-active');
      return;
    }

    const match = [...links].find(l => normalize(l.getAttribute('href')) === current);
    match && match.classList.add('is-active');
  };

  setActive();
  window.addEventListener('hashchange', setActive);
})();

// 2. Рендер карточек акций на sales.html
document.addEventListener('DOMContentLoaded', () => {
  const grid  = document.getElementById('sales-products-grid');
  const empty = document.getElementById('sales-products-empty');
  if (!grid) return;                                      // не sales.html — выходим

  // Берём данные — работает при любом порядке подключения data.js
  const data = typeof PRODUCTS !== 'undefined' ? PRODUCTS : window.PRODUCTS || [];

  // Фильтр по акции
  const promoItems = data.filter(item => item.promo === 'sale');

  if (!promoItems.length) {
    empty && (empty.hidden = false);
    return;
  }
  empty && (empty.hidden = true);

  const placeholder = 'assets/placeholder-pack.webp';

  const resolveImg = (path) => {
    if (!path) return placeholder;
    const p = String(path).trim();
    if (p.startsWith('http') || p.startsWith('assets/')) return p;
    return 'assets/products/' + p.replace(/^[\.\/]+/, '');
  };

  const frag = document.createDocumentFragment();

  promoItems.forEach(item => {
    const link = document.createElement('a');
    link.className = 'card card--sale';
    link.href = `product.html?id=${encodeURIComponent(item.id)}`;

    const img = resolveImg(item.images?.pack);
    const title = (item.title_ru_catalog || item.title || '').trim();
    const brand = item.brand || '';
    const badge = (item.promo_text || 'Акция').trim();
    const details = item.promo_details?.trim() 
      ? `<p class="card-promo-details">${item.promo_details}</p>` 
      : '';

    link.innerHTML = `
      <div class="card-badge card-badge--sale">${badge}</div>
      <div class="card-media">
        <img src="${img}" alt="Корм ${title} — ${brand}" loading="lazy" onerror="this.src='${placeholder}'">
      </div>
      <div class="card-body">
        <div class="card-brand">${brand}</div>
        <h3 class="card-title">${title}</h3>
        ${details}
      </div>
    `;

    frag.appendChild(link);
  });

  grid.appendChild(frag);
});

// Почему так (коротко и по делу):
// • Убрал все лишние комментарии внутри кода — они больше не ломают синтаксис
// • Сократил код до минимума, но оставил всю защиту от undefined
// • resolveImg — 100% правильные пути к картинкам
// • promo_details рендерится ярким оранжевым (класс .card-promo-details из твоего styles.css)
// • DocumentFragment — одна вставка в DOM, быстро и без reflow
// • Работает даже если data.js подключён после app.js
