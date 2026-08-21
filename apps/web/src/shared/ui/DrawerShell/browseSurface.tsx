import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { useAppShellLayoutPolicy } from 'shared/model/appShellPresentation';
import type { SheetSnap } from './sheetSnapPolicy';

interface BrowseSurfaceState {
  mode: 'map' | 'results';
  snap: SheetSnap;
  setSnap: (snap: SheetSnap) => void;
  showMap: () => void;
  showResults: () => void;
}

const BrowseSurfaceContext = createContext<BrowseSurfaceState | null>(null);

export function BrowseSurfaceProvider({
  preferredExpanded,
  onPreferredExpandedChange,
  children,
}: {
  preferredExpanded: boolean;
  onPreferredExpandedChange: (expanded: boolean) => void;
  children: ReactNode;
}) {
  const isBrowseSheet = useAppShellLayoutPolicy().drawer.presentation === 'bottomSheet';
  const [snap, setSnapState] = useState<SheetSnap>(() => (
    preferredExpanded ? 'full' : 'half'
  ));
  const [mode, setMode] = useState<'map' | 'results'>('results');

  const setSnap = useCallback((nextSnap: SheetSnap) => {
    setSnapState(nextSnap);
    setMode(nextSnap === 'peek' ? 'map' : 'results');
    onPreferredExpandedChange(nextSnap === 'full');
  }, [onPreferredExpandedChange]);

  // Re-seed when the live presentation crosses into the sheet. A preference changed
  // while the wide panel was mounted must survive the crossing rather than being
  // replaced by the sheet's stale rendered position.
  const [sheetWasMounted, setSheetWasMounted] = useState(isBrowseSheet);
  if (sheetWasMounted !== isBrowseSheet) {
    setSheetWasMounted(isBrowseSheet);
    if (isBrowseSheet) {
      setSnapState(mode === 'map' ? 'peek' : preferredExpanded ? 'full' : 'half');
    }
  }

  const showMap = useCallback(() => {
    setMode('map');
    if (!isBrowseSheet) return;
    setSnapState('peek');
    onPreferredExpandedChange(false);
  }, [isBrowseSheet, onPreferredExpandedChange]);

  const showResults = useCallback(() => {
    setMode('results');
    if (!isBrowseSheet || snap !== 'peek') return;
    setSnapState('half');
    onPreferredExpandedChange(false);
  }, [isBrowseSheet, onPreferredExpandedChange, snap]);

  return (
    <BrowseSurfaceContext.Provider value={{ mode, snap, setSnap, showMap, showResults }}>
      {children}
    </BrowseSurfaceContext.Provider>
  );
}

export function useBrowseSurface(): BrowseSurfaceState {
  const position = useContext(BrowseSurfaceContext);
  if (!position) {
    throw new Error('useBrowseSurface must be used within BrowseSurfaceProvider');
  }
  return position;
}
