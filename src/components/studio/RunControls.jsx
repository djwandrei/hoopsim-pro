import React from 'react';
import { Pause, Play, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
export default function RunControls({ paused, onPause, onCancel, label = 'Changes take effect at the next simulation checkpoint.' }) {
  return <div className="court-panel flex flex-wrap items-center justify-between gap-3 px-4 py-3"><p className="text-xs text-muted-foreground" role="status">{paused ? 'Paused at checkpoint. ' : ''}{label}</p><div className="flex gap-2"><Button variant="outline" onClick={onPause}>{paused ? <Play /> : <Pause />}{paused ? 'Resume' : 'Pause'}</Button><Button variant="outline" onClick={onCancel}><Square />Cancel</Button></div></div>;
}