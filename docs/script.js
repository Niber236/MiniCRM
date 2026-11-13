// Menu mobile et surlignage de la section visible. Aucune dépendance.
(function () {
  var toggle = document.querySelector('.nav-toggle');
  var menu = document.getElementById('menu');
  if (!toggle || !menu) return;

  function setOpen(open) {
    menu.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  }

  toggle.addEventListener('click', function () {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });
  menu.addEventListener('click', function (event) {
    if (event.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') setOpen(false);
  });

  // Surligne dans le menu la section affichée à l'écran.
  if (!('IntersectionObserver' in window)) return;
  var links = {};
  menu.querySelectorAll('a[href^="#"]').forEach(function (link) {
    links[link.getAttribute('href').slice(1)] = link;
  });
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var link = links[entry.target.id];
      if (link) link.classList.toggle('is-active', entry.isIntersecting);
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  Object.keys(links).forEach(function (id) {
    var section = document.getElementById(id);
    if (section) observer.observe(section);
  });
})();
