import { act, fireEvent, screen } from '@testing-library/react';
import { createRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { DrawerShell, useDrawerGeometry, useRegisterSheetScrollOwner } from './index';
import { resolveSheetSnapHeights, SHEET_PEEK_HEIGHT_PX, SHEET_SNAPS } from './sheetSnapPolicy';

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
  return <div data-testid="scroll-owner" ref={registerScrollOwner} />;
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
});

describe('DrawerShell scroll-to-snap coupling', () => {
  it('promotes the sheet and resets scrollTop when the list scrolls past the top while below full', () => {
    const onSnapChange = vi.fn();

    render(
      <DrawerShell
        presentation="bottomSheet"
        modality="nonmodal"
        snap="half"
        onSnapChange={onSnapChange}
      >
        <ScrollOwnerProbe />
      </DrawerShell>,
    );

    const scrollOwner = screen.getByTestId('scroll-owner');
    scrollOwner.scrollTop = 40;
    fireEvent.scroll(scrollOwner);

    expect(onSnapChange).toHaveBeenCalledWith('full');
    expect(scrollOwner.scrollTop).toBe(0);
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
