'use client';

import { useEffect, useState } from 'react';

/**
 * Keeps a closing element mounted for its fade-out duration instead of
 * vanishing instantly on unmount — plain CSS `animation` has no notion of
 * "play this on the way out," so the closing state has to be held in JS
 * just long enough for the fade-out to actually play.
 *
 * The open→closed transition is caught *during render* (comparing against
 * `prevOpen`, React's own documented pattern for deriving state from a prop
 * change — see "Adjusting state when a prop changes" in the React docs),
 * not inside a useEffect. An effect only runs after React commits: catching
 * the transition there meant `mounted` rendered `false` for one real commit
 * before the effect's setTimeout could set `closing: true` back on — a
 * genuine unmount, followed a moment later by a genuine remount. Whether
 * the browser actually painted that blank gap in between was a real race,
 * and heavier content (more fields, longer text) took measurably longer to
 * lay out, making the gap far more likely to actually get painted — which
 * is why the flicker was consistently reproducible on specific claims
 * rather than random. Catching the transition during render instead means
 * React discards and reruns this render with the corrected state before
 * ever handing anything to the browser to paint — `mounted` never dips to
 * `false` at all across a close, so there's nothing to blink.
 */
export function useExitAnimation(open: boolean, fadeOutMs: number): { mounted: boolean; closing: boolean } {
  const [closing, setClosing] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    setPrevOpen(open);
    // Just closed -> start the fade-out. Just (re)opened -> cancel any
    // fade-out still in flight, immediately, same render.
    setClosing(!open);
  }

  useEffect(() => {
    if (!closing) return;
    const finish = setTimeout(() => setClosing(false), fadeOutMs);
    return () => clearTimeout(finish);
  }, [closing, fadeOutMs]);

  return { mounted: open || closing, closing };
}
