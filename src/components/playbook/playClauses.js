// A player mentioned as a receiver, defender or screen reference is not the
// subject of the action. Never let a look-ahead spill into the next sentence.
export const offenseTokens = text => [...text.matchAll(/\b(O[1-5])\b/gi)].map(m => m[1].toUpperCase());
export function actionClauses(text) {
  const clauses = [];
  for (const sentence of text.split(/[.!?;]+/).filter(Boolean)) {
    const parts = sentence.split(/\b(?:while|then)\b|,\s*(?=O[1-5]\b\s+(?:back-screens?|cuts?|moves?|rolls?|pops?|sets?|screens?|dribbles?|passes?|clears?|lifts?|fills?|holds?|stays?))|,?\s+and\s+(?=O[1-5]\b\s+(?:cuts?|moves?|rolls?|pops?|sets?|screens?|dribbles?|passes?|clears?|lifts?|fills?|holds?|stays?))/i);
    for (const part of parts) {
      // Read menus describe possibilities; they are not executed actions.
      if (/\b(?:reads?|depending|can\b|could\b|may\b|either\b|if\b|unless\b)\b/i.test(part)) continue;
      const subject = /\b(O[1-5])\b((?:\s*(?:[/,&]|\band\b)\s*O[1-5])*)/i.exec(part);
      if (!subject) continue;
      const before = part.slice(0, subject.index);
      const body = part.slice(subject.index + subject[0].length).trim();
      // These tokens are objects of a preceding action, not actors.
      if (/\b(?:to|from|for|on|off|behind|toward|towards|around)\s*$/i.test(before) && !/\bplace\s*$/i.test(before)) continue;
      if (/^['’]s\b/.test(body)) continue;
      clauses.push({ actors: offenseTokens(subject[0]), body, before, text: part });
    }
  }
  return clauses;
}