import { actionClauses } from '@/components/playbook/playClauses';
// Preserve the named passer; "O5 hands to O2" must never draw O1 → O2.
// Read/if menus do not transfer possession. The alignment identifies DHO hubs.
export function detectPasses(text, startOwner) {
  const passes = [];
  let owner = startOwner;
  for (const clause of actionClauses(text)) {
    const passer = clause.actors[0];
    const body = clause.body;
    let receiver;
    let giver = passer;
    const arrow = /^\s*(?:→|->)\s*(O[1-5])\b/i.exec(body);
    const pass = /\b(?:passes?|feeds?|pitches?|delivers?|throws?|hits?|gives?|hands?|enters?|inbounds?|skips?|reverses?)\b[\s\S]*?\b(?:to|into)\b[^.!?]{0,35}?\b(O[1-5])\b/i.exec(body);
    const receives = /\b(?:receives?|takes?)\b[^.!?]{0,35}?\bfrom\s+(O[1-5])\b/i.exec(body);
    if (arrow || pass) receiver = (arrow || pass)[1].toUpperCase();
    else if (receives) { giver = receives[1].toUpperCase(); receiver = passer; }
    else if (/\b(?:takes?|flows? directly.*into|flows? into)\b.*\b(?:DHO|handoff|exchange)\b/i.test(body) && passer !== owner) { giver = owner; receiver = passer; }
    if (receiver && receiver !== giver) {
      const handoff = /handoff|hand-off|\bDHO\b|\bhands?\b|exchange/i.test(body);
      passes.push({ from: giver, to: receiver, handoff });
      owner = receiver;
    }
  }
  return { passes, owner };
}