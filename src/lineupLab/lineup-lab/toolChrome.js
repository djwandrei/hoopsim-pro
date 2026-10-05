export default function toolChrome(root) {
  const nav = root.querySelector('#siteNav'), toggle = root.querySelector('#navToggle');
  const theme = root.querySelector('#themeToggle'), header = root.querySelector('.site-header');
  const backdrop = document.createElement('button');
  backdrop.type = 'button'; backdrop.className = 'site-nav-backdrop'; backdrop.setAttribute('aria-label', 'Close navigation menu');
  root.appendChild(backdrop);
  const setOpen = open => {
    nav?.classList.toggle('open', open);
    if (nav) { nav.hidden = !open; nav.inert = !open; }
    toggle?.setAttribute('aria-expanded', String(open)); toggle?.setAttribute('data-state', open ? 'open' : 'closed');
    document.body.classList.toggle('menu-open', open); backdrop.hidden = !open;
    if (open) nav?.querySelector('a[href]')?.focus();
  };
  const updateTheme = () => {
    const dark = document.body.classList.contains('dark-mode');
    theme?.setAttribute('data-theme-mode', dark ? 'dark' : 'light');
    if (theme) theme.textContent = dark ? 'Light Mode' : 'Dark Mode';
  };
  const click = event => {
    if (event.target.closest('#navToggle')) setOpen(toggle?.getAttribute('aria-expanded') !== 'true');
    else if (event.target === backdrop) setOpen(false);
    else if (event.target.closest('#siteNav a')) setTimeout(() => setOpen(false), 0);
    else if (event.target.closest('.submenu-toggle')) {
      const button = event.target.closest('.submenu-toggle'), item = button.closest('.primary-nav__item');
      const open = item?.classList.toggle('is-open'); button.setAttribute('aria-expanded', String(Boolean(open)));
    } else if (event.target.closest('#themeToggle')) {
      const dark = document.body.classList.toggle('dark-mode'); document.body.style.colorScheme = dark ? 'dark' : 'light';
      try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch { /* Storage may be unavailable. */ }
      updateTheme();
    }
  };
  const keydown = event => {
    if (toggle?.getAttribute('aria-expanded') !== 'true') return;
    if (event.key === 'Escape') { setOpen(false); toggle.focus(); }
    if (event.key !== 'Tab') return;
    const nodes = [toggle, ...(nav?.querySelectorAll('a[href], button') || [])].filter(node => node && node.offsetParent !== null);
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  const measure = () => {
    const height = `${header?.offsetHeight || 0}px`;
    header?.style.setProperty('--header-h', height); document.documentElement.style.setProperty('--djhc-header-h', height);
  };
  const observer = new ResizeObserver(measure); if (header) observer.observe(header);
  root.addEventListener('click', click); document.addEventListener('keydown', keydown); setOpen(false); updateTheme(); measure();
  return () => { root.removeEventListener('click', click); document.removeEventListener('keydown', keydown); observer.disconnect(); setOpen(false); backdrop.remove(); };
}