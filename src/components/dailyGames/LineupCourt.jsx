import React from 'react';
import { Ban } from 'lucide-react';
import CourtFloor from '@/components/dailyGames/CourtFloor';
import CourtPlayerMarker from '@/components/dailyGames/CourtPlayerMarker';
import { allocateCourtSlots, projectCourt } from '@/components/dailyGames/courtGeometry';

export default function LineupCourt({ lineup = [], removedPlayerRef, incomingPlayer, incomingLabel = 'Incoming', slim = false, palette = null }) {
  const players = lineup.slice(0, 5);
  const slots = allocateCourtSlots(players);
  const teamCode = players.find((player) => player.teamCode)?.teamCode || '';
  return (
    <div className={`dg-court ${slim ? 'dg-court--slim' : ''}`} role="group" aria-label="Starting five on a perspective basketball court">
      <CourtFloor teamCode={teamCode} palette={palette} />
      {players.map((player, index) => {
        const swapped = player.playerRef === removedPlayerRef;
        const replacement = swapped && incomingPlayer;
        // Perspective scale: players nearer the camera render larger.
        const scale = 0.8 + (1 / (1.48 - 0.48 * slots[index].depth / 47) - 0.676) * 0.87;
        return (
          <CourtPlayerMarker
            key={player.playerRef}
            player={replacement || player}
            point={projectCourt(slots[index].x, slots[index].depth)}
            scale={scale}
            tone={swapped ? replacement ? 'in' : 'out' : 'starter'}
            tag={swapped ? replacement ? incomingLabel : 'Outgoing' : null}
            sub={replacement ? player.displayName : null} />);


      })}
      
    </div>);

}