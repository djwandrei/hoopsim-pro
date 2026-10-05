export default function toolBodyState() {
  const body = document.body;
  const className = body.className, colorScheme = body.style.colorScheme;
  const attributes = ['data-experience-mode', 'data-page', 'data-fan-help'];
  const saved = attributes.map(name => body.getAttribute(name));
  let dark = true;
  try { dark = localStorage.getItem('theme') !== 'light'; } catch { /* Browser storage may be unavailable. */ }
  body.classList.add('court-themed', 'lab-guided');
  body.classList.toggle('dark-mode', dark);
  body.dataset.experienceMode = 'detailed';
  body.dataset.page = 'fan-tools';
  body.dataset.fanHelp = 'lineup';
  body.style.colorScheme = dark ? 'dark' : 'light';
  return () => {
    body.className = className;
    body.style.colorScheme = colorScheme;
    attributes.forEach((name, index) => {
      if (saved[index] === null) body.removeAttribute(name);
      else body.setAttribute(name, saved[index]);
    });
  };
}