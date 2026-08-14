import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
  type UIEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { IconChevronLeft, IconMaximize, IconMinimize } from '@tabler/icons-react';
import type { AppShellLayoutPolicy } from 'shared/model/appShellLayoutPolicy';
import { useNavigationRailGeometry } from 'shared/model/navigationRailGeometry';
import {
  DrawerShell,
  type DrawerShellModality,
  type DrawerShellPresentation,
  type SheetSnap,
} from 'shared/ui/DrawerShell';
import { PanelScrollChromeStateProvider } from 'shared/ui/PanelScrollChrome';
import { PanelLayout, PanelChromeSlot, PanelLayoutStickyChrome } from 'shared/ui/PanelLayout';
import { isPanelCollectionScrollCorrection } from 'shared/ui/PanelCollectionGrid';
import styles from './SidePanel.module.css';

interface PanelTopStyle extends CSSProperties {
  '--wa-fullscreen-rail-inset'?: string;
}

const SCROLL_DIRECTION_THRESHOLD_PX = 8;

function hasMeaningfulVerticalScrollTravel(
  scrollTarget: HTMLElement,
  pinnedChromeHeightPx: number,
): boolean {
  return scrollTarget.scrollHeight - scrollTarget.clientHeight
    - pinnedChromeHeightPx
    >= SCROLL_DIRECTION_THRESHOLD_PX;
}

interface ScrollPosition {
  anchor: number;
}

interface ScrollChromeState {
  hidden: boolean;
  scrolledFromTop: boolean;
  sheetSnap: SheetSnap | undefined;
  open: boolean;
}

const SidePanelHeaderTrailingTargetContext = createContext<HTMLElement | null>(null);

/**
 * The header row's trailing slot, beside the back/expand button and the
 * centered title — e.g. a route-owned filter control. Portaled so a route
 * deep inside SidePanel's children can reach the single header row SidePanel
 * itself owns. Renders nothing when mounted outside SidePanel, or when the
 * header row isn't shown at all (headerFullWidth, or no header/back/expand).
 */
export function SidePanelHeaderTrailing({ children }: { children: ReactNode }) {
  const target = useContext(SidePanelHeaderTrailingTargetContext);
  return target ? createPortal(children, target) : null;
}

interface SidePanelProps {
  drawerPresentation?: DrawerShellPresentation;
  drawerModality?: DrawerShellModality;
  /** Keeps a side overlay mounted while removing it from view and interaction. */
  open?: boolean;
  /**
   * The shell's navigation presentation, used only to detect when the floating
   * compact rail hovers over this panel's own top-left corner (fullScreen +
   * compactRail) so the back/expand button can clear it. Omit outside that
   * combination; the panel behaves exactly as before.
   */
  navigation?: AppShellLayoutPolicy['navigation'];
  /** Sheet position. Required when drawerPresentation is 'bottomSheet', ignored otherwise. */
  sheetSnap?: SheetSnap;
  /** Called when the sheet lands on a new snap. Required when drawerPresentation is 'bottomSheet'. */
  onSheetSnapChange?: (snap: SheetSnap) => void;
  /** True when this sheet keeps its own header row visible at Peek — see DrawerShell's
   *  identically named prop, which this passes straight through. */
  sheetPeekIncludesHeader?: boolean;
  /** Snaps this sheet may land on when dragged or flicked. Defaults to all three. */
  sheetAvailableSnaps?: readonly SheetSnap[];
  restoreFocusRef?: RefObject<HTMLElement | null>;
  /** Expands the panel to cover most of the viewport width. */
  expanded?: boolean;
  /** Called when the expand/collapse toggle is clicked. */
  onExpandToggle?: () => void;
  /** When provided, replaces the expand toggle with a ‹ back button. */
  onBack?: () => void;
  /** Visible label for the back button when the context needs more clarity. */
  backLabel?: string;
  /** Disables the visible back control without removing it from the title row. */
  backDisabled?: boolean;
  /** Center slot in the top bar (e.g. ModeSwitcher or search bar). */
  header?: ReactNode;
  /** Allows rich headers, such as cart controls, to span the full top row. */
  headerFullWidth?: boolean;
  /**
   * Pinned search/filter row for the panel. Mounted once into PanelLayout's
   * sticky-chrome slot inside the panel scroll owner, where it hides on scroll
   * down and reveals on scroll up.
   */
  subheader?: ReactNode;
  /** Navigation rendered over the compact sheet, outside its moving surface. */
  bottomBar?: ReactNode;
  children?: ReactNode;
}

export function SidePanel({
  drawerPresentation = 'persistent',
  drawerModality = 'nonmodal',
  open = true,
  navigation,
  sheetSnap,
  onSheetSnapChange,
  sheetPeekIncludesHeader,
  sheetAvailableSnaps,
  restoreFocusRef,
  expanded,
  onExpandToggle,
  onBack,
  backLabel,
  backDisabled,
  header,
  headerFullWidth,
  subheader,
  bottomBar,
  children,
}: SidePanelProps) {
  const [headerTrailingTarget, setHeaderTrailingTarget] = useState<HTMLElement | null>(null);
  const scrollPositionByTargetRef = useRef<WeakMap<HTMLElement, ScrollPosition>>(new WeakMap());
  const scrollChromeTrackerRef = useRef<ScrollChromeState>({
    hidden: false,
    scrolledFromTop: false,
    sheetSnap,
    open,
  });
  const [scrollChromeState, setScrollChromeState] = useState<ScrollChromeState>({
    hidden: false,
    scrolledFromTop: false,
    sheetSnap,
    open,
  });
  if (scrollChromeState.sheetSnap !== sheetSnap || scrollChromeState.open !== open) {
    setScrollChromeState({ hidden: false, scrolledFromTop: false, sheetSnap, open });
  }

  useLayoutEffect(() => {
    scrollChromeTrackerRef.current = {
      hidden: false,
      scrolledFromTop: false,
      sheetSnap,
      open,
    };
  }, [open, sheetSnap]);

  // While pinned, the exposed `hidden` fact freezes regardless of scroll
  // direction — an open date-jump menu's own trigger must not be swapped out
  // from under it by the user scrolling the gallery beneath. Scroll tracking
  // itself keeps running underneath, so unpinning immediately reflects
  // whatever direction the user actually last scrolled.
  const [chromePinned, setChromePinned] = useState(false);
  const hidden = chromePinned || scrollChromeState.hidden;

  const handleBodyScrollCapture = useCallback((
    event: UIEvent<HTMLDivElement>,
    pinnedChromeHeightPx: number,
  ) => {
    if (!open) return;

    const scrollTarget = event.target;
    if (!(scrollTarget instanceof HTMLElement)) return;

    const currentScrollTop = scrollTarget.scrollTop;
    const position = scrollPositionByTargetRef.current.get(scrollTarget) ?? {
      anchor: 0,
    };
    const chromeTracker = scrollChromeTrackerRef.current;
    if (chromeTracker.sheetSnap !== sheetSnap || chromeTracker.open !== open) {
      chromeTracker.hidden = false;
      chromeTracker.scrolledFromTop = false;
      chromeTracker.sheetSnap = sheetSnap;
      chromeTracker.open = open;
    }
    let nextHidden = chromeTracker.hidden;
    let nextScrolledFromTop = chromeTracker.scrolledFromTop;

    // Nested interactive scrollers own their movement, and collection reflows are
    // internal layout corrections. Neither is a user gesture that should move chrome.
    if (scrollTarget.closest('[data-scroll-direction-isolated]')
      || isPanelCollectionScrollCorrection(scrollTarget)) {
      position.anchor = currentScrollTop;
      scrollPositionByTargetRef.current.set(scrollTarget, position);
      return;
    }

    if (!hasMeaningfulVerticalScrollTravel(scrollTarget, pinnedChromeHeightPx)) {
      position.anchor = 0;
      nextHidden = false;
      nextScrolledFromTop = false;
    } else if (currentScrollTop <= 0) {
      position.anchor = 0;
      nextHidden = false;
      nextScrolledFromTop = false;
    } else if (nextHidden) {
      nextScrolledFromTop = true;
      if (currentScrollTop > position.anchor) position.anchor = currentScrollTop;
      else if (position.anchor - currentScrollTop >= SCROLL_DIRECTION_THRESHOLD_PX) {
        position.anchor = currentScrollTop;
        nextHidden = false;
      }
    } else {
      nextScrolledFromTop = true;
      if (currentScrollTop < position.anchor) position.anchor = currentScrollTop;
      else if (currentScrollTop - position.anchor >= SCROLL_DIRECTION_THRESHOLD_PX) {
        position.anchor = currentScrollTop;
        nextHidden = true;
      }
    }

    chromeTracker.hidden = nextHidden;
    chromeTracker.scrolledFromTop = nextScrolledFromTop;
    setScrollChromeState((current) => {
      return current.hidden === nextHidden
        && current.scrolledFromTop === nextScrolledFromTop
        && current.sheetSnap === sheetSnap
        && current.open === open
        ? current
        : { hidden: nextHidden, scrolledFromTop: nextScrolledFromTop, sheetSnap, open };
    });
    scrollPositionByTargetRef.current.set(scrollTarget, position);
  }, [open, sheetSnap]);

  const showExpandToggle = Boolean(onExpandToggle)
    && drawerPresentation !== 'bottomSheet'
    && drawerPresentation !== 'sideOverlay';
  const hasPanelTop = Boolean(header || onBack || showExpandToggle);

  // The compact rail (account/cart/any route-supplied switcher) floats over the
  // fullScreen panel's own top-left corner rather than beside it — fullScreen
  // spans the whole viewport, unlike sideWorkspace, which already starts past the
  // rail's measured edge. Without this, the back button renders directly under
  // the rail's own box and is neither visible nor clickable.
  const reservesRailInset = navigation === 'compactRail' && drawerPresentation === 'fullScreen';
  const railGeometry = useNavigationRailGeometry();
  const panelTopStyle: PanelTopStyle | undefined = reservesRailInset && railGeometry
    ? { '--wa-fullscreen-rail-inset': `${railGeometry.right}px` }
    : undefined;

  const panelLayout = (
    <PanelLayout
      onScrollCapture={handleBodyScrollCapture}
      header={hasPanelTop ? (
        <div className={styles.panelTop} style={panelTopStyle}>
          {!headerFullWidth && (
            onBack || showExpandToggle ? (
              <button
                className={`${styles.topBtn} ${backLabel ? styles.topBtnLabeled : ''}`}
                onClick={onBack ?? onExpandToggle}
                disabled={backDisabled}
                aria-label={onBack ? backLabel ?? 'Back' : expanded ? 'Collapse panel' : 'Expand panel'}
              >
                {onBack ? (
                  <>
                    <IconChevronLeft size={16} />
                    {backLabel && <span>{backLabel}</span>}
                  </>
                ) : expanded ? (
                  <IconMinimize size={16} />
                ) : (
                  <IconMaximize size={16} />
                )}
              </button>
            ) : (
              <div aria-hidden="true" />
            )
          )}

          {header && (
            <PanelChromeSlot className={headerFullWidth ? styles.headerSlotFull : styles.headerSlot}>
              {header}
            </PanelChromeSlot>
          )}
          {!headerFullWidth && <div ref={setHeaderTrailingTarget} className={styles.headerTrailing} />}
        </div>
      ) : undefined}
    >
      {subheader && <PanelLayoutStickyChrome>{subheader}</PanelLayoutStickyChrome>}
      {children}
    </PanelLayout>
  );

  return (
    <SidePanelHeaderTrailingTargetContext.Provider value={headerTrailingTarget}>
      <PanelScrollChromeStateProvider
        value={{
          hidden,
          scrolledFromTop: scrollChromeState.scrolledFromTop,
          sheetSnap,
          drawerPresentation,
          pinChromeHidden: setChromePinned,
        }}
      >
        {drawerPresentation === 'bottomSheet' && sheetSnap !== undefined && onSheetSnapChange !== undefined ? (
          <DrawerShell
            presentation="bottomSheet"
            modality={drawerModality}
            restoreFocusRef={restoreFocusRef}
            snap={sheetSnap}
            onSnapChange={onSheetSnapChange}
            peekIncludesHeader={sheetPeekIncludesHeader}
            availableSnaps={sheetAvailableSnaps}
          >
            {panelLayout}
          </DrawerShell>
        ) : drawerPresentation !== 'bottomSheet' ? (
          <DrawerShell
            presentation={drawerPresentation}
            state={expanded ? 'expanded' : 'compact'}
            open={open}
            modality={drawerModality}
            restoreFocusRef={restoreFocusRef}
            onEscape={onBack}
          >
            {panelLayout}
          </DrawerShell>
        ) : null}
        {bottomBar}
      </PanelScrollChromeStateProvider>
    </SidePanelHeaderTrailingTargetContext.Provider>
  );
}
