// @vitest-environment jsdom
//
// Tests the real hydration path (server-rendered markup, then hydrateRoot),
// not just a fresh client mount — a Suspense fallback like this one is
// always server-rendered first, so a hydration-specific failure wouldn't
// show up in a plain createRoot test. Written 2026-08-06 after a live report
// that the cycling fact text was permanently stuck on the first entry —
// first suspected as dev-server/HMR staleness, but it recurred in a fresh
// production deploy under a genuine ~90s cold Pipeline run, which is a
// realistic scenario for the fallback's DOM node to get torn down and
// recreated mid-wait. The "survives being remounted" test below is the one
// that actually covers that failure mode.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrictMode, act } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import Loading from './loading';

describe('Loading — hydration', () => {
  let container: HTMLDivElement;
  let root: Root | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it('cycles to a new fact after hydrating from server-rendered markup', async () => {
    const html = renderToString(<Loading />);
    container.innerHTML = html;

    await act(async () => {
      root = hydrateRoot(container, <Loading />);
    });

    const initialText = container.querySelector('[aria-live="polite"]')?.textContent;
    expect(initialText).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });

    const laterText = container.querySelector('[aria-live="polite"]')?.textContent;
    expect(laterText).not.toBe(initialText);
  });

  it('still cycles when hydrated under StrictMode (double-invoked effects)', async () => {
    const html = renderToString(
      <StrictMode>
        <Loading />
      </StrictMode>,
    );
    container.innerHTML = html;

    await act(async () => {
      root = hydrateRoot(
        container,
        <StrictMode>
          <Loading />
        </StrictMode>,
      );
    });

    const initialText = container.querySelector('[aria-live="polite"]')?.textContent;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });

    const laterText = container.querySelector('[aria-live="polite"]')?.textContent;
    expect(laterText).not.toBe(initialText);
  });

  it('picks up where it left off if the fallback is torn down and recreated mid-wait', async () => {
    // Simulates the real production failure mode: a long-held Suspense
    // fallback whose DOM node gets recreated partway through a ~90s wait.
    // A remount that resets to the first fact every time is exactly the bug
    // that was reported live; this proves the sessionStorage-anchored
    // elapsed-time approach doesn't regress to that.
    const html = renderToString(<Loading />);
    container.innerHTML = html;
    await act(async () => {
      root = hydrateRoot(container, <Loading />);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    const textBeforeRemount = container.querySelector('[aria-live="polite"]')?.textContent;

    // Tear down and recreate, as if the fallback's DOM node were replaced.
    act(() => root!.unmount());
    container.innerHTML = html;
    await act(async () => {
      root = hydrateRoot(container, <Loading />);
    });

    const textImmediatelyAfterRemount = container.querySelector('[aria-live="polite"]')?.textContent;
    expect(textImmediatelyAfterRemount).toBe(textBeforeRemount);

    // And it keeps advancing from there rather than getting stuck again.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });
    const textAfterMoreTime = container.querySelector('[aria-live="polite"]')?.textContent;
    expect(textAfterMoreTime).not.toBe(textImmediatelyAfterRemount);
  });
});
