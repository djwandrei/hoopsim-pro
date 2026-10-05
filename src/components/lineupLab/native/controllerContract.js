// Check the actual controller's required nodes before it binds any events.
// Missing controls are an integration error, not optional listener targets.
export default function controllerContract(root, source) {
  if (!root) throw new Error('The Lineup Lab workspace is not mounted.');
  const block = source.match(/const elements = \{([\s\S]*?)\n\};/);
  if (!block) throw new Error('The Lineup Lab control contract could not be read.');
  const selectors = [...block[1].matchAll(/\$\("([^"]+)"\)/g)].map(match => match[1]);
  const missing = selectors.filter(selector => !root.querySelector(selector));
  if (missing.length) {
    throw new Error(`The Lineup Lab could not start because required controls are missing: ${missing.join(', ')}.`);
  }
}