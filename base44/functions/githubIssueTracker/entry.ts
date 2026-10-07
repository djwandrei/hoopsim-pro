// Issue tracker: files a deduped GitHub issue for tool failures reported from
// the studio. Anonymous OK (crash reports come from public visitors) — abuse
// is bounded by whitelisted sources/kinds, hard field caps and fingerprint
// dedupe against open issues.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { GITHUB_REPO, getGithubToken, sha256Hex, fileIssue } from '../../shared/githubMonitorCore.ts';

const SOURCES = new Set([
  'lineup-lab', 'season-lab', 'player-lab', 'chemistry-lab', 'forge-lab',
  'game-lab', 'career-lab', 'spin-room', 'book-room', 'virtual-packs',
  'draft-night', 'fix-the-five', 'playbook', 'studio',
]);
const KINDS = new Set(['boot-failure', 'solver-failure', 'data-source-error', 'crash', 'other']);

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    let payload = {};
    try { payload = await req.json(); } catch { /* defaults below */ }

    const source = SOURCES.has(payload.source) ? payload.source : 'studio';
    const kind = KINDS.has(payload.kind) ? payload.kind : 'other';
    const message = String(payload.message || '').slice(0, 2000);
    if (!message.trim()) return Response.json({ ok: false, reason: 'A message is required.' }, { status: 400 });
    const stack = String(payload.stack || '').slice(0, 4000);

    const token = await getGithubToken(base44);
    if (!token) return Response.json({ ok: false, reason: 'GitHub connection missing.' });

    // Same message, tool and kind → same fingerprint → one open issue.
    const normalized = message.toLowerCase().replace(/\s+/g, ' ').trim();
    const fingerprint = (await sha256Hex(`${source}|${kind}|${normalized}`)).slice(0, 16);

    const stackBlock = stack ? '\n\nStack:\n```\n' + stack + '\n```' : '';
    const result = await fileIssue(token, {
      title: `[swishiq] ${kind} — ${source}`,
      body: `Automatic issue report from the SwishIQ Studio.\n\nSource: ${source}\nKind: ${kind}\nMessage: ${message}${stackBlock}`,
      labels: ['swishiq', kind],
      fingerprint,
    });
    return Response.json({ ok: !result.error, ...result });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}