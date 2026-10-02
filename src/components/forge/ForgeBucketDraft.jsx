import ForgeDraftGame from '@/components/forge/ForgeDraftGame';

// Wheel Draft: Build-A-Bucket reel flow — spin for team & player, tap a lit chip.
export default function ForgeBucketDraft(props) {
  return <ForgeDraftGame {...props} mode="wheel" />;
}