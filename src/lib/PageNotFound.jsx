import { Link } from 'react-router-dom';

export default function PageNotFound() {
  return (
    <div className="court-panel mx-auto mt-16 max-w-md p-10 text-center">
      <h1 className="court-display text-6xl text-gold">404</h1>
      <div className="hero-rule mx-auto my-4" />
      <p className="text-sm text-muted-foreground">That page could not be found in the SwishIQ Studio.</p>
      <Link to="/" className="mt-6 inline-flex rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-sm text-gold transition-colors hover:bg-gold/20">Back to the studio</Link>
    </div>
  );
}