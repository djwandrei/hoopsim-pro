// Reuse the site's view controls, including their ids and accessibility labels.
export default function commandHeader(workspace) {
  const shell = workspace.querySelector(':scope > .shell');
  const switcher = shell?.querySelector('.experience-switcher');
  const navigation = shell?.querySelector('.tool-nav');
  if (!shell || !switcher || !navigation) return;
  const header = document.createElement('header');
  header.className = 'command-top';
  const title = document.createElement('h2');
  title.className = 'command-title';
  title.textContent = 'Find your best five.';
  header.append(title, switcher);
  shell.prepend(header);
  navigation.classList.add('command-navigation');
  header.after(navigation);
}