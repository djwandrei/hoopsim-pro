import React from 'react';
import { RefreshCcw, TriangleAlert } from 'lucide-react';

// Render-time crash containment: a thrown error used to unmount the entire
// router, blanking every page. This boundary catches it, shows a recovery
// panel for the broken page, and keeps the rest of the app alive.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full border border-trim/40 bg-trim/10"><TriangleAlert className="h-7 w-7 text-trim-ink" /></span>
      <h1 className="font-display text-3xl tracking-wide">This view hit a snag</h1>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{String(this.state.error?.message || this.state.error || 'An unexpected error occurred.')}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={this.reset} className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-gold transition-colors hover:bg-gold/20">
          <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" /> Try again
        </button>
        <button type="button" onClick={() => window.location.assign('/')} className="rounded-lg border border-border/40 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold">
          Back to studio home
        </button>
      </div>
    </div>;
  }
}