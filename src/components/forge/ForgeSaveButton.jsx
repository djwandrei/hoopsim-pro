import React, { useState } from 'react';
import { saveForgeBuild } from './forgeSession.js';
export default function ForgeSaveButton({ payload }) {
  const [message, setMessage] = useState('');
  return <div className="space-y-1"><button type="button" className="min-h-10 rounded-lg border border-border px-4 text-xs" onClick={() => setMessage(saveForgeBuild(payload, `${payload.mode} · ${payload.year} season`) ? 'Build saved on this device.' : 'Browser storage is unavailable; use the build link.')}>Save build on this device</button>{message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}</div>;
}
