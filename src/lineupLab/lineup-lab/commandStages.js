// Keep the native phase buttons and their validation/navigation handlers.
export default function commandStages(shell) {
  const rail = shell.querySelector('.journey-rail');
  const canvas = shell.querySelector('.journey-canvas');
  if (!rail || !canvas) return;
  rail.classList.add('command-stages');
  const ticket = rail.querySelector('.journey-ticket');
  const heading = canvas.querySelector('.journey-heading');
  if (ticket && heading) {
    ticket.classList.add('command-ticket');
    heading.after(ticket);
  }
}