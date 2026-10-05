export default function nativeErrors(root, list = []) {
  const panel = root.querySelector('#workflowErrors');
  root.querySelectorAll('[data-native-invalid]').forEach(node => { node.removeAttribute('aria-invalid'); delete node.dataset.nativeInvalid; });
  panel.replaceChildren();
  panel.hidden = !list.length;
  list.forEach(error => {
    const target = root.querySelector(`#${error.field}`);
    target?.setAttribute('aria-invalid', 'true');
    if (target) target.dataset.nativeInvalid = 'true';
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'text-button'; button.textContent = error.message;
    button.addEventListener('click', () => {
      if (target?.closest('.detailed-only') && document.body.dataset.experienceMode === 'simple') root.querySelector('#detailedModeButton').click();
      for (let parent = target?.parentElement; parent; parent = parent.parentElement) if (parent.matches('details')) parent.open = true;
      target?.scrollIntoView({ block: 'center', behavior: 'instant' }); target?.focus();
    });
    panel.append(button);
  });
  if (list.length) { panel.focus(); panel.scrollIntoView({ block: 'center', behavior: 'instant' }); }
}