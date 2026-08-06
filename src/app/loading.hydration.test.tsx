// @vitest-environment jsdom
//
// Tests the real hydration path (server-rendered markup, then hydrateRoot),
// not just a fresh client mount — a Suspense fallback like this one is
// always server-rendered first, so a hydration-specific failure wouldn't
// show up in a plain createRoot test. Written 2026-08-06 after a live report
// that the cycling fact text was permanently stuck on the first entry.
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
});
