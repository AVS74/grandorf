// Активная ссылка меню (нормализация и хэши)
(function(){
  const links = Array.from(document.querySelectorAll('.nav-link'));
  if (!links.length) return;

  function normalizePath(p){
    // / и /index.html считаем одним и тем же
    if (!p) return '/';
    try {
      const u = new URL(p, location.origin);
      let path = u.pathname;
      if (path === '' || path === '/') path = '/';
      if (path.endsWith('/index.html')) path = '/';
      return path + (u.hash || '');
    } catch {
      return p;
    }
  }

  function setActive(){
    // снять активный класс со всех
    links.forEach(a => a.classList.remove('is-active'));

    const current = normalizePath(location.pathname + location.hash);

    // при #contacts помечаем "Контакты"
    if (location.hash === '#contacts') {
      const link = links.find(a => a.getAttribute('href') === '#contacts');
      if (link) link.classList.add('is-active');
      return;
    }

    // главная
    if (current === '/') {
      const link = links.find(a => a.getAttribute('href') === '/' || a.getAttribute('href') === '/index.html');
      if (link) link.classList.add('is-active');
      return;
    }

    // прочие страницы по точному пути
    const match = links.find(a => normalizePath(a.getAttribute('href')) === normalizePath(location.pathname));
    if (match) match.classList.add('is-active');
  }

  // первичная установка и слушатели
  setActive();
  window.addEventListener('hashchange', setActive);
})();

