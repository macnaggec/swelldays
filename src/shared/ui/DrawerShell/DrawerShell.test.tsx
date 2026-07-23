import { act, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { DrawerShell, useDrawerGeometry } from './index';

function GeometryProbe() {
  const geometry = useDrawerGeometry();
  const value = geometry
    ? `${geometry.left}:${geometry.top}:${geometry.right}:${geometry.bottom}:${geometry.width}:${geometry.height}`
    : 'unmeasured';

  return <output data-testid="drawer-geometry">{value}</output>;
}

describe('DrawerShell geometry projection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('publishes changed DOM bounds once on the next animation frame', () => {
    let triggerResize: (() => void) | undefined;
    const queuedFrames: FrameRequestCallback[] = [];

    class ResizeObserverHarness implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        triggerResize = () => callback([], this);
      }

      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverHarness);
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      queuedFrames.push(callback);
      return queuedFrames.length;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    render(
      <>
        <DrawerShell
          presentation="persistent"
          state="compact"
          modality="nonmodal"
        >
          Drawer content
        </DrawerShell>
        <GeometryProbe />
      </>,
    );

    const drawer = screen.getByRole('complementary', { name: 'Content drawer' });
    let bounds = DOMRect.fromRect({ x: 1080, y: 0, width: 360, height: 900 });
    vi.spyOn(drawer, 'getBoundingClientRect').mockImplementation(() => bounds);

    act(() => queuedFrames.shift()?.(0));
    expect(screen.getByTestId('drawer-geometry').textContent).toBe('1080:0:1440:900:360:900');

    bounds = DOMRect.fromRect({ x: 360, y: 0, width: 1080, height: 900 });
    act(() => {
      triggerResize?.();
      triggerResize?.();
    });

    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('drawer-geometry').textContent).toBe('1080:0:1440:900:360:900');

    act(() => queuedFrames.shift()?.(16));
    expect(screen.getByTestId('drawer-geometry').textContent).toBe('360:0:1440:900:1080:900');
  });
});

describe('DrawerShell focus continuity', () => {
  it('leaves focus untouched when the surface unmounts while focus is outside the drawer', () => {
    const triggerRef = createRef<HTMLButtonElement>();

    const { rerender } = render(
      <>
        <input aria-label="Outside field" />
        <button ref={triggerRef}>Drawer trigger</button>
        <DrawerShell
          presentation="persistent"
          state="compact"
          modality="nonmodal"
          restoreFocusRef={triggerRef}
        >
          Drawer content
        </DrawerShell>
      </>,
    );

    screen.getByLabelText('Outside field').focus();

    rerender(
      <>
        <input aria-label="Outside field" />
        <button ref={triggerRef}>Drawer trigger</button>
      </>,
    );

    expect(document.activeElement).toBe(screen.getByLabelText('Outside field'));
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Drawer trigger' }));
  });

  it('does not move focus when restoreFocusRef identity changes while the drawer stays mounted', () => {
    const refA = createRef<HTMLButtonElement>();
    const refB = createRef<HTMLButtonElement>();

    const { rerender } = render(
      <>
        <button ref={refA}>Drawer trigger A</button>
        <button ref={refB}>Drawer trigger B</button>
        <DrawerShell
          presentation="persistent"
          state="compact"
          modality="nonmodal"
          restoreFocusRef={refA}
        >
          <input aria-label="Draft note" />
        </DrawerShell>
      </>,
    );

    screen.getByLabelText('Draft note').focus();

    rerender(
      <>
        <button ref={refA}>Drawer trigger A</button>
        <button ref={refB}>Drawer trigger B</button>
        <DrawerShell
          presentation="persistent"
          state="compact"
          modality="nonmodal"
          restoreFocusRef={refB}
        >
          <input aria-label="Draft note" />
        </DrawerShell>
      </>,
    );

    expect(document.activeElement).toBe(screen.getByLabelText('Draft note'));
  });
});
