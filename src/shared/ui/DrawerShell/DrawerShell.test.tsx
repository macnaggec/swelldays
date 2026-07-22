import { act, screen } from '@testing-library/react';
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
