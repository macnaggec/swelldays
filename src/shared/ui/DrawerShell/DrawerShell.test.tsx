import { act, fireEvent, screen } from '@testing-library/react';
import { createRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { PANEL_WIDTH_VW } from 'shared/model/panelExpansionStore';
import {
  DrawerShell,
  useDrawerGeometry,
  useDrawerTargetGeometry,
  useRegisterSheetScrollOwner,
  useSheetContentScrollable,
} from './index';
import { DRAWER_SHELL_TRANSITION } from './motion';
import { resolveSheetSnapHeights, SHEET_PEEK_HEIGHT_PX, SHEET_SNAPS } from './sheetSnapPolicy';

const animateMock = vi.hoisted(() => vi.fn());
const nearestSheetSnapMock = vi.hoisted(() => vi.fn());

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, animate: animateMock };
});

vi.mock('./sheetSnapPolicy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./sheetSnapPolicy')>();
  nearestSheetSnapMock.mockImplementation(actual.nearestSheetSnap);
  return { ...actual, nearestSheetSnap: nearestSheetSnapMock };
});

/** Panel content carrying state a rebuilt subtree would silently discard. */
function DraftField() {
  const [draft, setDraft] = useState('');

  return (
    <input
      aria-label="Draft note"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
    />
  );
}

function GeometryProbe() {
  const geometry = useDrawerGeometry();
  const value = geometry
    ? `${geometry.left}:${geometry.top}:${geometry.right}:${geometry.bottom}:${geometry.width}:${geometry.height}`
    : 'unmeasured';

  return <output data-testid="drawer-geometry">{value}</output>;
}

function TargetGeometryProbe() {
  const geometry = useDrawerTargetGeometry();
  const value = geometry
    ? `${geometry.left}:${geometry.top}:${geometry.right}:${geometry.bottom}:${geometry.width}:${geometry.height}`
    : 'unmeasured';

  return <output data-testid="drawer-target-geometry">{value}</output>;
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

function ScrollOwnerProbe() {
  const registerScrollOwner = useRegisterSheetScrollOwner();
  const contentScrollable = useSheetContentScrollable();
  return (
    <div
      data-testid="scroll-owner"
      data-content-scroll={contentScrollable ? 'allowed' : 'locked'}
      ref={registerScrollOwner}
    />
  );
}

describe('DrawerShell bottom-sheet geometry', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([...SHEET_SNAPS])('publishes drawer geometry whose visible height matches the resolved %s height', (snap) => {
    const heights = resolveSheetSnapHeights({ viewportHeightPx: 844, peekHeightPx: SHEET_PEEK_HEIGHT_PX });
    const queuedFrames: FrameRequestCallback[] = [];

    class ResizeObserverHarness implements ResizeObserver {
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
          presentation="bottomSheet"
          modality="nonmodal"
          snap={snap}
          onSnapChange={() => {}}
        >
          Sheet content
        </DrawerShell>
        <GeometryProbe />
      </>,
    );

    const sheet = screen.getByRole('complementary', { name: 'Content drawer' });
    const visibleHeight = heights[snap];
    vi.spyOn(sheet, 'getBoundingClientRect').mockImplementation(() => (
      DOMRect.fromRect({ x: 0, y: 844 - visibleHeight, width: 390, height: visibleHeight })
    ));

    act(() => queuedFrames.shift()?.(0));

    expect(screen.getByTestId('drawer-geometry').textContent).toBe(
      `0:${844 - visibleHeight}:390:844:390:${visibleHeight}`,
    );
  });

  it('republishes the transformed bounds after the sheet lands at another snap', async () => {
    const heights = resolveSheetSnapHeights({ viewportHeightPx: 844, peekHeightPx: SHEET_PEEK_HEIGHT_PX });
    const queuedFrames: FrameRequestCallback[] = [];

    class ResizeObserverHarness implements ResizeObserver {
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

    const renderSheet = (snap: 'peek' | 'half') => (
      <>
        <DrawerShell
          presentation="bottomSheet"
          modality="nonmodal"
          snap={snap}
          onSnapChange={() => {}}
        >
          Sheet content
        </DrawerShell>
        <GeometryProbe />
      </>
    );

    const { rerender, unmount } = render(renderSheet('peek'));
    const sheet = screen.getByRole('complementary', { name: 'Content drawer' });
    let visibleHeight = heights.peek;
    vi.spyOn(sheet, 'getBoundingClientRect').mockImplementation(() => (
      DOMRect.fromRect({ x: 0, y: 844 - visibleHeight, width: 390, height: visibleHeight })
    ));
    act(() => queuedFrames.shift()?.(0));

    visibleHeight = heights.half;
    rerender(renderSheet('half'));

    await act(async () => {
      await vi.waitFor(() => expect(screen.getByTestId('drawer-geometry').textContent).toBe(
        `0:${844 - heights.half}:390:844:390:${heights.half}`,
      ));
    });

    unmount();
  });

  it('publishes the destination snap geometry before the measured sheet finishes moving', () => {
    const viewportHeightPx = window.innerHeight;
    const viewportWidthPx = window.innerWidth;
    const heights = resolveSheetSnapHeights({
      viewportHeightPx,
      peekHeightPx: SHEET_PEEK_HEIGHT_PX,
    });
    const renderSheet = (snap: 'peek' | 'half') => (
      <>
        <DrawerShell
          presentation="bottomSheet"
          modality="nonmodal"
          snap={snap}
          onSnapChange={() => {}}
        >
          Sheet content
        </DrawerShell>
        <TargetGeometryProbe />
      </>
    );

    const { rerender } = render(renderSheet('peek'));
    rerender(renderSheet('half'));

    expect(screen.getByTestId('drawer-target-geometry').textContent).toBe(
      `0:${viewportHeightPx - heights.half}:${viewportWidthPx}:${viewportHeightPx}:${viewportWidthPx}:${heights.half}`,
    );
  });

  it('publishes a zero-width destination when the side panel closes', () => {
    const viewportHeightPx = window.innerHeight;
    const viewportWidthPx = window.innerWidth;
    const renderPanel = (open: boolean) => (
      <>
        <DrawerShell
          presentation="sideOverlay"
          state="compact"
          modality="nonmodal"
          open={open}
        >
          Panel content
        </DrawerShell>
        <TargetGeometryProbe />
      </>
    );

    const { rerender } = render(renderPanel(true));
    rerender(renderPanel(false));

    expect(screen.getByTestId('drawer-target-geometry').textContent).toBe(
      `${viewportWidthPx}:0:${viewportWidthPx}:${viewportHeightPx}:0:${viewportHeightPx}`,
    );
  });

  it('publishes the persistent panel destination when its state changes', () => {
    const viewportHeightPx = window.innerHeight;
    const viewportWidthPx = window.innerWidth;
    const renderPanel = (state: 'compact' | 'expanded') => (
      <>
        <DrawerShell
          presentation="persistent"
          state={state}
          modality="nonmodal"
        >
          Panel content
        </DrawerShell>
        <TargetGeometryProbe />
      </>
    );

    const { rerender } = render(renderPanel('compact'));
    rerender(renderPanel('expanded'));

    const expandedWidthPx = viewportWidthPx * (PANEL_WIDTH_VW.expanded / 100);
    expect(screen.getByTestId('drawer-target-geometry').textContent).toBe(
      `${viewportWidthPx - expandedWidthPx}:0:${viewportWidthPx}:${viewportHeightPx}:${expandedWidthPx}:${viewportHeightPx}`,
    );
  });
});

describe('DrawerShell live drag geometry', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('publishes the sheet\'s live rendered edge while a drag is in progress, before the drag ends', async () => {
    class ResizeObserverHarness implements ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    const queuedFrames: FrameRequestCallback[] = [];
    vi.stubGlobal('ResizeObserver', ResizeObserverHarness);
    // Only the component's own mount-time measurement loop reads this stub (it looks up
    // the global at call time); framer-motion's internal frame scheduler captured the
    // real requestAnimationFrame at import time, so its onDrag callback still lands on a
    // genuine frame below, independent of this queue.
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      queuedFrames.push(callback);
      return queuedFrames.length;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const onSnapChange = vi.fn();

    render(
      <>
        <DrawerShell
          presentation="bottomSheet"
          modality="nonmodal"
          snap="half"
          onSnapChange={onSnapChange}
        >
          Sheet content
        </DrawerShell>
        <GeometryProbe />
      </>,
    );

    const sheet = screen.getByRole('complementary', { name: 'Content drawer' });
    let rect = DOMRect.fromRect({ x: 0, y: 500, width: 390, height: 344 });
    vi.spyOn(sheet, 'getBoundingClientRect').mockImplementation(() => rect);

    // Settle the mount-time measurement against the resting rect first, so the only
    // remaining path that can publish the dragged rect below is the live-drag wiring
    // under test, not a still-pending initial measurement.
    act(() => queuedFrames.shift()?.(0));
    expect(screen.getByTestId('drawer-geometry').textContent).toBe('0:500:390:844:390:344');

    const handle = sheet.querySelector('[data-drawer-sheet-handle]');
    if (!handle) throw new Error('Expected the drag handle to be rendered.');

    act(() => {
      // jsdom derives pageX/pageY from clientX/clientY (there is no real layout to
      // offset against), so the gesture must be driven through clientX/clientY for
      // framer-motion's pan session to see any movement at all.
      fireEvent.pointerDown(handle, { pointerId: 1, isPrimary: true, clientX: 195, clientY: 500 });
    });

    rect = DOMRect.fromRect({ x: 0, y: 420, width: 390, height: 424 });
    act(() => {
      fireEvent.pointerMove(handle, { pointerId: 1, isPrimary: true, clientX: 195, clientY: 420 });
    });

    // framer-motion schedules its onDrag callback through its own animation-frame
    // queue rather than synchronously, so the published geometry lands a real
    // frame after the pointermove — this waits for that frame rather than the
    // pointer gesture ending.
    await act(async () => {
      await vi.waitFor(() => {
        expect(screen.getByTestId('drawer-geometry').textContent).toBe('0:420:390:844:390:424');
      });
    });

    expect(onSnapChange).not.toHaveBeenCalled();

    // Release the drag framer-motion's pan session started above (M00c, found while
    // adding a later drag-end test in this file): an unfinished pointerDown/pointerMove
    // pair leaves that session dangling past this test's own render tree, and it then
    // swallows a later test's own drag gesture on an unrelated pointer id.
    act(() => {
      fireEvent.pointerUp(handle, { pointerId: 1, isPrimary: true, clientX: 195, clientY: 420 });
    });
  });
});

describe('DrawerShell scroll-to-snap coupling', () => {
  it('parks panel content scrolling until the sheet reaches its top snap', () => {
    const onSnapChange = vi.fn();
    const renderSheet = (snap: 'peek' | 'half' | 'full') => (
      <DrawerShell
        presentation="bottomSheet"
        modality="nonmodal"
        snap={snap}
        onSnapChange={onSnapChange}
      >
        <ScrollOwnerProbe />
      </DrawerShell>
    );

    const { rerender } = render(renderSheet('peek'));
    expect(screen.getByTestId('scroll-owner').getAttribute('data-content-scroll')).toBe('locked');

    rerender(renderSheet('half'));
    expect(screen.getByTestId('scroll-owner').getAttribute('data-content-scroll')).toBe('locked');

    rerender(renderSheet('full'));
    expect(screen.getByTestId('scroll-owner').getAttribute('data-content-scroll')).toBe('allowed');
  });

  it('does not promote the sheet when the list scrolls while the sheet is already full', () => {
    const onSnapChange = vi.fn();

    render(
      <DrawerShell
        presentation="bottomSheet"
        modality="nonmodal"
        snap="full"
        onSnapChange={onSnapChange}
      >
        <ScrollOwnerProbe />
      </DrawerShell>,
    );

    const scrollOwner = screen.getByTestId('scroll-owner');
    scrollOwner.scrollTop = 40;
    fireEvent.scroll(scrollOwner);

    expect(onSnapChange).not.toHaveBeenCalled();
  });
});

describe('DrawerShell presentation swap continuity', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the surface, panel content, draft, and focus intact when swapping from a panel presentation to bottomSheet', () => {
    const queuedFrames: FrameRequestCallback[] = [];

    class ResizeObserverHarness implements ResizeObserver {
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

    const { rerender, unmount } = render(
      <DrawerShell presentation="persistent" state="compact" modality="nonmodal">
        <DraftField />
      </DrawerShell>,
    );
    act(() => queuedFrames.shift()?.(0));

    const surface = screen.getByRole('complementary', { name: 'Content drawer' });
    const draft = screen.getByLabelText<HTMLInputElement>('Draft note');
    fireEvent.change(draft, { target: { value: 'half-written note' } });
    draft.focus();

    act(() => {
      rerender(
        <DrawerShell
          presentation="bottomSheet"
          modality="nonmodal"
          snap="peek"
          onSnapChange={() => {}}
        >
          <DraftField />
        </DrawerShell>,
      );
    });
    act(() => queuedFrames.shift()?.(0));

    expect(screen.getByRole('complementary', { name: 'Content drawer' })).toBe(surface);
    // The substance of F12d: a rebuilt subtree would silently reset the draft to '' and
    // drop focus to body, which a surface-identity assertion alone cannot see.
    expect(screen.getByLabelText('Draft note')).toBe(draft);
    expect(draft.value).toBe('half-written note');
    expect(document.activeElement).toBe(draft);
    // framer-motion's own animation engine settles this swap's y transition through its
    // real timing, independent of the stubbed frame loop above (which only serves this
    // component's own measurement loop). Unmounting before the test ends cancels that
    // in-flight animation rather than leaving it to resolve after the assertion.
    unmount();
  });
});

describe('DrawerShell presentation swap geometry', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('leaves no width from the panel presentation on the sheet when a live resize swaps them', async () => {
    class ResizeObserverHarness implements ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverHarness);

    const { rerender, unmount } = render(
      <DrawerShell presentation="persistent" state="expanded" modality="nonmodal">
        <DraftField />
      </DrawerShell>,
    );

    const surface = screen.getByRole('complementary', { name: 'Content drawer' });
    await vi.waitFor(() => expect(surface.style.width).toBe('75vw'));

    rerender(
      <DrawerShell
        presentation="bottomSheet"
        modality="nonmodal"
        snap="half"
        onSnapChange={() => {}}
      >
        <DraftField />
      </DrawerShell>,
    );

    // A sheet spans the viewport. Inheriting the panel's width would leave it a narrow
    // column pinned to one edge — what a live window resize showed before the swap
    // corrected both properties, while a reload looked right because it mounted as a sheet.
    await vi.waitFor(() => expect(surface.style.width).toBe('100%'));

    unmount();
  });

  it('leaves no sheet offset on the panel when the swap runs the other way', async () => {
    class ResizeObserverHarness implements ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverHarness);

    const { rerender, unmount } = render(
      <DrawerShell
        presentation="bottomSheet"
        modality="nonmodal"
        snap="half"
        onSnapChange={() => {}}
      >
        <DraftField />
      </DrawerShell>,
    );

    const restingOffsetPx = () => {
      const offset = /translateY\((-?[\d.]+)px\)/.exec(surface.style.transform);
      return offset ? Number(offset[1]) : 0;
    };

    const surface = screen.getByRole('complementary', { name: 'Content drawer' });
    await vi.waitFor(() => expect(restingOffsetPx()).toBeGreaterThan(0));

    rerender(
      <DrawerShell presentation="persistent" state="compact" modality="nonmodal">
        <DraftField />
      </DrawerShell>,
    );

    // Widening a phone window back to a desktop must not leave the panel pushed down the
    // screen by the height the sheet was resting at.
    await vi.waitFor(() => expect(restingOffsetPx()).toBe(0));

    unmount();
  });
});

describe('DrawerShell fullScreen geometry', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders a fullScreen drawer at the full viewport width, not the short side-overlay width', async () => {
    class ResizeObserverHarness implements ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverHarness);

    const { unmount } = render(
      <DrawerShell presentation="fullScreen" state="expanded" modality="modal" open>
        <DraftField />
      </DrawerShell>,
    );

    const surface = screen.getByRole('dialog', { name: 'Content drawer' });
    await vi.waitFor(() => expect(surface.style.width).toBe('100vw'));

    unmount();
  });
});

describe('DrawerShell modal focus and Escape', () => {
  it('moves focus inside the drawer surface when a modal drawer opens, instead of leaving it on document.body', async () => {
    render(
      <DrawerShell presentation="fullScreen" state="expanded" modality="modal" open>
        <button>Focus target</button>
      </DrawerShell>,
    );

    const surface = screen.getByRole('dialog', { name: 'Content drawer' });
    await vi.waitFor(() => {
      expect(document.activeElement).not.toBe(document.body);
      expect(surface).toContainElement(document.activeElement as HTMLElement);
    });
  });

  it('calls onEscape when Escape is pressed on a modal, open drawer', () => {
    const onEscape = vi.fn();

    render(
      <DrawerShell presentation="fullScreen" state="expanded" modality="modal" open onEscape={onEscape}>
        <button>Focus target</button>
      </DrawerShell>,
    );

    const surface = screen.getByRole('dialog', { name: 'Content drawer' });
    fireEvent.keyDown(surface, { key: 'Escape' });

    expect(onEscape).toHaveBeenCalledOnce();
  });

  it('does not call onEscape when Escape is pressed on a nonmodal drawer', () => {
    const onEscape = vi.fn();

    render(
      <DrawerShell presentation="persistent" state="compact" modality="nonmodal" onEscape={onEscape}>
        <button>Focus target</button>
      </DrawerShell>,
    );

    const surface = screen.getByRole('complementary', { name: 'Content drawer' });
    fireEvent.keyDown(surface, { key: 'Escape' });

    expect(onEscape).not.toHaveBeenCalled();
  });
});

describe('DrawerShell settles a drag release that resolves to the current snap', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('imperatively settles the surface when the resolved snap equals the pre-drag snap', async () => {
    nearestSheetSnapMock.mockReturnValueOnce('half');

    class ResizeObserverHarness implements ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    const queuedFrames: FrameRequestCallback[] = [];
    vi.stubGlobal('ResizeObserver', ResizeObserverHarness);
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      queuedFrames.push(callback);
      return queuedFrames.length;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const onSnapChange = vi.fn();

    render(
      <>
        <DrawerShell
          presentation="bottomSheet"
          modality="nonmodal"
          snap="half"
          onSnapChange={onSnapChange}
        >
          Sheet content
        </DrawerShell>
        <GeometryProbe />
      </>,
    );

    const sheet = screen.getByRole('complementary', { name: 'Content drawer' });
    let rect = DOMRect.fromRect({ x: 0, y: 500, width: 390, height: 344 });
    vi.spyOn(sheet, 'getBoundingClientRect').mockImplementation(() => rect);

    // Settle the mount-time measurement against the resting rect first, exactly as the
    // live-drag geometry test above does, so the drag below is the only thing that can
    // move the published geometry.
    act(() => queuedFrames.shift()?.(0));
    expect(screen.getByTestId('drawer-geometry').textContent).toBe('0:500:390:844:390:344');

    const handle = sheet.querySelector('[data-drawer-sheet-handle]');
    if (!handle) throw new Error('Expected the drag handle to be rendered.');

    act(() => {
      fireEvent.pointerDown(handle, { pointerId: 1, isPrimary: true, clientX: 195, clientY: 500 });
    });

    rect = DOMRect.fromRect({ x: 0, y: 460, width: 390, height: 384 });
    act(() => {
      fireEvent.pointerMove(handle, { pointerId: 1, isPrimary: true, clientX: 195, clientY: 460 });
    });

    // framer-motion schedules its onDrag callback through its own real animation-frame
    // queue rather than synchronously (see the live-drag geometry test above) — this
    // waits for that frame so the drag has genuinely started before ending it below. A
    // pointerUp fired immediately after pointerMove races ahead of that scheduling, and
    // the gesture is never recognized as a drag at all.
    await act(async () => {
      await vi.waitFor(() => {
        expect(screen.getByTestId('drawer-geometry').textContent).toBe('0:460:390:844:390:384');
      });
    });

    act(() => {
      fireEvent.pointerUp(handle, { pointerId: 1, isPrimary: true, clientX: 195, clientY: 460 });
    });

    const heights = resolveSheetSnapHeights({
      viewportHeightPx: window.innerHeight,
      peekHeightPx: SHEET_PEEK_HEIGHT_PX,
    });

    await act(async () => {
      await vi.waitFor(() => {
        expect(animateMock).toHaveBeenCalledWith(
          sheet,
          { y: window.innerHeight - heights.half },
          DRAWER_SHELL_TRANSITION,
        );
      });
    });

    expect(onSnapChange).not.toHaveBeenCalled();
  });
});
