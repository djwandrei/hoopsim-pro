import React from 'react';
import { Ban } from 'lucide-react';
import CourtFloor from '@/components/dailyGames/CourtFloor';
import CourtPlayerMarker from '@/components/dailyGames/CourtPlayerMarker';
import { allocateCourtSlots, projectCourt } from '@/components/dailyGames/courtGeometry';

export default function LineupCourt({ lineup = [], removedPlayerRef, incomingPlayer, incomingLabel = 'Incoming', slim = false }) {
  const players = lineup.slice(0, 5);
  const slots = allocateCourtSlots(players);
  return (
    <div className={`dg-court ${slim ? 'dg-court--slim' : ''}`} role="group" aria-label="Starting five on a perspective basketball court">
      <CourtFloor />
      {players.map((player, index) => {
        const swapped = player.playerRef === removedPlayerRef;
        const replacement = swapped && incomingPlayer;
        return (
          <CourtPlayerMarker
            key={player.playerRef}
            player={replacement || player}
            point={projectCourt(slots[index].x, slots[index].depth)}
            tone={swapped ? replacement ? 'in' : 'out' : 'starter'}
            tag={swapped ? replacement ? incomingLabel : 'Outgoing' : null}
            sub={replacement ? player.displayName : null}
          />
        );
      })}
      {removedPlayerRef && <span className="dg-court__badge"><Ban className="h-2.5 w-2.5 text-trim" /> marked swap</span>}
    </div>
  );
}