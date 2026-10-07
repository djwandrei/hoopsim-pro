// Release-pin monitor: verifies the repo's vendored engine release pin and the
// pinned registry against the studio's expected pin. Read-only; anonymous OK.
// On drift it files a deduped GitHub issue automatically (best-effort).

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { waitUntil } from 'base44:runtime';
import {
  GITHUB_REPO, PIN_FILE_PATH, EXPECTED_PIN,
  getGithubToken, ghRequest, extractPinValues, sha256Hex, fileIssue,
} from '../../shared/githubMonitorCore.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const token = await getGithubToken(base44);
    if (!token) return Response.json({ status: 'unavailable', reason: 'GitHub connection missing' });

    // 1. The repo's vendored pin module.
    let repoPin = null, repoError = null;
    try {
      const raw = await ghRequest(token, `/repos/${GITHUB_REPO}/contents/${PIN_FILE_PATH}`, {
        headers: { Accept: 'application/vnd.github.raw' },
      });
      if (!raw.ok) repoError = `GitHub responded ${raw.status}`;
      else repoPin = extractPinValues(await raw.text());
    } catch (error) {
      repoError = error.message;
    }

    // 2. The pinned registry: reachable, and its content matches one of the
    //    two registry digests declared in the pin.
    let registry = { reachable: false, digestMatched: false };
    try {
      const res = await fetch(EXPECTED_PIN.registryUrl, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const digest = await sha256Hex(await res.text());
        registry = {
          reachable: true,
          digestMatched: digest === EXPECTED_PIN.registrySha256 || digest === EXPECTED_PIN.registryRevisionSha256,
          digest,
        };
      }
    } catch { /* registry unreachable */ }

    let status = 'in_sync';
    if (repoError || !repoPin) status = 'unavailable';
    else if (
      repoPin.version !== EXPECTED_PIN.version ||
      repoPin.expectedIdentity?.bundle?.bundleVersion !== EXPECTED_PIN.bundleVersion ||
      repoPin.expectedIdentity?.bundle?.bundleId !== EXPECTED_PIN.bundleId
    ) status = 'drift';
    else if (!registry.reachable || !registry.digestMatched) status = 'degraded';

    if (status === 'drift') {
      waitUntil(fileIssue(token, {
        title: `[swishiq] Release-pin drift in ${GITHUB_REPO}`,
        body: [
          'The repo engine release pin no longer matches the studio\'s pinned bundle.',
          '',
          `Expected version: ${EXPECTED_PIN.version}`,
          `Expected bundle: ${EXPECTED_PIN.bundleId} @ ${EXPECTED_PIN.bundleVersion}`,
          `Repo version: ${repoPin?.version || 'unparseable'}`,
          `Repo bundle: ${repoPin?.expectedIdentity?.bundle?.bundleId || 'unparseable'} @ ${repoPin?.expectedIdentity?.bundle?.bundleVersion || 'unparseable'}`,
        ].join('\n'),
        labels: ['swishiq', 'release-pin-drift'],
        fingerprint: 'release-pin-drift',
      }));
    }

    return Response.json({
      repo: GITHUB_REPO,
      status,
      repoError,
      appPin: { version: EXPECTED_PIN.version, bundleId: EXPECTED_PIN.bundleId, bundleVersion: EXPECTED_PIN.bundleVersion },
      repoPin: repoPin
        ? {
          version: repoPin.version || null,
          bundleId: repoPin.expectedIdentity?.bundle?.bundleId || null,
          bundleVersion: repoPin.expectedIdentity?.bundle?.bundleVersion || null,
        }
        : null,
      registry,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}