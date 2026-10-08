import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSeasonSource from '@/hooks/useSeasonSource';
import useViewRefresh from '@/components/mobile/useViewRefresh';
import { loadSwishIQDailyBoard, swishIQDailyGameErrorKind, dailySeedFromPageSearch, normalizeGameFamily } from '@/lib/dailyGames/boardSource';
import { hydratePresentationBoard, loadSwishIqPlayerMetadata } from '@/lib/dailyGames/boardHydration';

const BOARD_ERROR_KINDS = ['board-unavailable', 'board-invalid', 'evaluator-unavailable', 'verification-error'];

// Shared board lifecycle for the two daily games: seed/board/error state, the
// season source the sim panels draw from, and hydrated presentation data. Each
// page restores its own saved run via onBoardReady.
export default function useDailyGameBoard({ gameKind, onBoardReady }) {
  const urlSeed = useMemo(() => dailySeedFromPageSearch(window.location.search), []);
  const urlFamily = useMemo(() => { try { return normalizeGameFamily(new URLSearchParams(window.location.search).get('family')); } catch { return ''; } }, []);
  const [seed, setSeed] = useState(urlSeed);
  const [board, setBoard] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const { year, setYear, source, league } = useSeasonSource();
  const readyRef = useRef(onBoardReady);
  readyRef.current = onBoardReady;

  const loadBoard = useCallback(async (targetSeed = seed) => {
    setStatus('loading'); setError(null); setNotice('');
    try {
      const loaded = await loadSwishIQDailyBoard({ gameKind, dailySeed: targetSeed, family: urlFamily });
      setBoard(loaded); setStatus('ready');
      readyRef.current?.(loaded);
    } catch (loadError) {
      setBoard(null); setError(loadError);
      const kind = swishIQDailyGameErrorKind(loadError);
      setStatus(BOARD_ERROR_KINDS.includes(kind) ? kind : 'error');
    }
  }, [gameKind, seed, urlFamily]);

  useViewRefresh(() => loadBoard(seed));
  useEffect(() => { loadBoard(seed); }, [seed, loadBoard]);
  useEffect(() => { loadSwishIqPlayerMetadata().then(setMetadata, () => setMetadata(null)); }, []);
  useEffect(() => {
    const boardYear = board?.packageRef?.scope?.seasonStartYear;
    if (boardYear && String(year) !== String(boardYear)) setYear(boardYear);
  }, [board, year, setYear]);

  const presentation = useMemo(() => board ? hydratePresentationBoard(board, { playerSeasons: source?.playerSeasons || [], metadata }) : null, [board, source, metadata]);

  return { seed, setSeed, board, presentation, status, error, notice, setNotice, loadBoard, league };
}