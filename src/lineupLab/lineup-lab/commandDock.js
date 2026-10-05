// Style the real native navigation tray; don't expose submit ahead of the
// review step or bypass the workflow's validation and confirmed reset.
export default function commandDock(shell) {
  const navigation = shell.querySelector('.journey-navigation');
  const restart = shell.querySelector('.journey-restart');
  if (navigation) {
    navigation.classList.add('command-actions');
    if (restart) {
      restart.classList.add('button', 'button--quiet');
      navigation.prepend(restart);
    }
  }
  shell.querySelector('.journey-result-navigation')?.classList.add('command-actions');
}