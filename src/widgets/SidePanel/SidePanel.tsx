import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type UIEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { IconChevronLeft, IconMaximize, IconMinimize } from '@tabler/icons-react';
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
  /** Sheet position. Required when drawerPresentation is 'bottomSheet', ignored otherwise. */
  sheetSnap?: SheetSnap;
  /** Called when the sheet lands on a new snap. Required when drawerPresentation is 'bottomSheet'. */
  onSheetSnapChange?: (snap: SheetSnap) => void;
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
  sheetSnap,
  onSheetSnapChange,
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
    sheetSnap,
    open,
  });
  const [scrollChromeState, setScrollChromeState] = useState<ScrollChromeState>({
    hidden: false,
    sheetSnap,
    open,
  });
  if (scrollChromeState.sheetSnap !== sheetSnap || scrollChromeState.open !== open) {
    setScrollChromeState({ hidden: false, sheetSnap, open });
  }

  useLayoutEffect(() => {
    scrollChromeTrackerRef.current = { hidden: false, sheetSnap, open };
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
      chromeTracker.sheetSnap = sheetSnap;
      chromeTracker.open = open;
    }
    let nextHidden = chromeTracker.hidden;

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
    } else if (currentScrollTop <= 0) {
      position.anchor = 0;
      nextHidden = false;
    } else if (nextHidden) {
      if (currentScrollTop > position.anchor) position.anchor = currentScrollTop;
      else if (position.anchor - currentScrollTop >= SCROLL_DIRECTION_THRESHOLD_PX) {
        position.anchor = currentScrollTop;
        nextHidden = false;
      }
    } else {
      if (currentScrollTop < position.anchor) position.anchor = currentScrollTop;
      else if (currentScrollTop - position.anchor >= SCROLL_DIRECTION_THRESHOLD_PX) {
        position.anchor = currentScrollTop;
        nextHidden = true;
      }
    }

    chromeTracker.hidden = nextHidden;
    setScrollChromeState((current) => {
      return current.hidden === nextHidden
        && current.sheetSnap === sheetSnap
        && current.open === open
        ? current
        : { hidden: nextHidden, sheetSnap, open };
    });
    scrollPositionByTargetRef.current.set(scrollTarget, position);
  }, [open, sheetSnap]);

  const showExpandToggle = Boolean(onExpandToggle)
    && drawerPresentation !== 'bottomSheet'
    && drawerPresentation !== 'sideOverlay';
  const hasPanelTop = Boolean(header || onBack || showExpandToggle);

  const panelLayout = (
    <PanelLayout
      onScrollCapture={handleBodyScrollCapture}
      header={hasPanelTop ? (
        <div className={styles.panelTop}>
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
