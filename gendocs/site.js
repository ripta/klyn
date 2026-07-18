(function () {
  var themeToggle = document.getElementById('themeToggle');
  var html = document.documentElement;

  function applyTheme(theme) {
    if (theme === 'dark') {
      html.setAttribute('data-theme', 'dark');
    } else {
      html.removeAttribute('data-theme');
    }
    themeToggle.setAttribute('aria-checked', theme === 'dark');
  }

  var savedTheme = localStorage.getItem('theme');
  var systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(savedTheme || (systemPrefersDark ? 'dark' : 'light'));

  themeToggle.addEventListener('click', function () {
    var newTheme = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
    if (!localStorage.getItem('theme')) {
      applyTheme(e.matches ? 'dark' : 'light');
    }
  });
})();

document.addEventListener('keydown', function (e) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    var input = document.querySelector('#search input');
    if (input) input.focus();
  }
});

(function () {
  var toc = document.querySelector('.toc');
  if (!toc) return;

  var savedTocOpen = localStorage.getItem('tocOpen');
  if (savedTocOpen !== null) {
    toc.open = savedTocOpen === 'true';
  }

  toc.addEventListener('toggle', function () {
    localStorage.setItem('tocOpen', toc.open);
  });
})();
