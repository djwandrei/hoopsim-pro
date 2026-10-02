import ForgeDraftGame from '@/components/forge/ForgeDraftGame';

// Pick & Spin: arm a skill chip first, spin the reels, keep or respin the offer.
export default function ForgePickDraft(props) {
  return <ForgeDraftGame {...props} mode="pick" />;
}