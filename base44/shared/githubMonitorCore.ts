// Shared GitHub connector core for the release-pin monitor and issue tracker.
// Both backend functions import from here — never duplicate this logic.

export const GITHUB_REPO = "DustyBoio/DJs-House-Of-Cards-Comics";

// The engine file the studio's pin module mirrors, relative to the repo root.
export const PIN_FILE_PATH = "tools/swishiq-studio/engine/canonical-v4-studio-runtime-release-pin.js";

// The pin values the studio is vendored against (mirrors
// canonical-v4-studio-runtime-release-pin.js in public/tools/swishiq-studio/engine/).
export const EXPECTED_PIN = {
  version: "swishiq-v4-studio-runtime-release-pin-v2",
  bundleId: "swishiq-v4-canonical-2017-26-candidate",
  bundleVersion: "v4-canonical-20260929-102ef7d38481",
  registryUrl: "https://www.djshouseofcards-comics.com/tools/swishiq-studio/data/v4/releases/v4-site-12ad90dc8710/registry.json",
  registrySha256: "5d5719df127efb912add9db59b865892cf02d960d99b9f667268f1fdcef017a5",
  registryRevisionSha256: "c6bc7da85d74bd0546a9855b392a7ed9e5a0ddc4aedf058842b6caf370e51f30",
};

// Connector token (builder's shared GitHub connection) — never expose to the client.
export async function getGithubToken(base44) {
  try {
    const { accessToken } = await base44.asServiceRole.connectors.getConnection("github");
    return accessToken || null;
  } catch {
    return null;
  }
}

export async function ghRequest(token, path, init = {}) {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "swishiq-studio",
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(10000),
  });
}

// Parse the frozen pin object out of the vendored ESM release-pin module.
export function extractPinValues(sourceText) {
  const marker = sourceText.indexOf("Object.freeze(");
  if (marker === -1) return null;
  const start = sourceText.indexOf("{", marker);
  if (start === -1) return null;
  let depth = 0, inString = false, quote = "", escaped = false;
  for (let i = start; i < sourceText.length; i++) {
    const ch = sourceText[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inString = true; quote = ch; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(sourceText.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// File a GitHub issue, deduped by an embedded fingerprint: an identical report
// while a matching open issue exists never creates a duplicate.
export async function fileIssue(token, { title, body, labels, fingerprint }) {
  const search = await ghRequest(
    token,
    `/search/issues?q=${encodeURIComponent(`repo:${GITHUB_REPO} is:issue is:open "swishiq-fp:${fingerprint}"`)}`,
  );
  if (search.ok) {
    const found = await search.json();
    const item = found?.items?.[0];
    if (item) return { deduped: true, number: item.number, issueUrl: item.html_url };
  }
  const created = await ghRequest(token, `/repos/${GITHUB_REPO}/issues`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, body: `${body}\n\n\`swishiq-fp:${fingerprint}\``, labels }),
  });
  if (!created.ok) return { deduped: false, error: `GitHub responded ${created.status}` };
  const issue = await created.json();
  return { deduped: false, number: issue.number, issueUrl: issue.html_url };
}