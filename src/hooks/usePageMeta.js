import { useEffect } from 'react';

// Per-route document title and meta description; restores the shell values on
// unmount so every page keeps its own site-facing title.
export default function usePageMeta({ title, description }) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;
    const meta = document.querySelector('meta[name="description"]');
    const previousDescription = meta ? meta.getAttribute('content') : null;
    if (description && meta) meta.setAttribute('content', description);
    return () => {
      document.title = previousTitle;
      if (meta && previousDescription !== null) meta.setAttribute('content', previousDescription);
    };
  }, [title, description]);
}