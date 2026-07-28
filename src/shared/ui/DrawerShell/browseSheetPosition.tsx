import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { useAppShellLayoutPolicy } from 'shared/model/appShellPresentation';
import type { SheetSnap } from './sheetSnapPolicy';

interface BrowseSheetPosition {
  snap: SheetSnap;
  setSnap: (snap: SheetSnap) => void;
}

const BrowseSheetPositionContext = createContext<BrowseSheetPosition | null>(null);

export function BrowseSheetPositionProvider({
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

  const setSnap = useCallback((nextSnap: SheetSnap) => {
    setSnapState(nextSnap);
    onPreferredExpandedChange(nextSnap === 'full');
  }, [onPreferredExpandedChange]);

  // Re-seed when the live presentation crosses into the sheet. A preference changed
  // while the wide panel was mounted must survive the crossing rather than being
  // replaced by the sheet's stale rendered position.
  const [sheetWasMounted, setSheetWasMounted] = useState(isBrowseSheet);
  if (sheetWasMounted !== isBrowseSheet) {
    setSheetWasMounted(isBrowseSheet);
    if (isBrowseSheet) setSnapState(preferredExpanded ? 'full' : 'half');
  }

  return (
    <BrowseSheetPositionContext.Provider value={{ snap, setSnap }}>
      {children}
    </BrowseSheetPositionContext.Provider>
  );
}

export function useBrowseSheetPosition(): BrowseSheetPosition {
  const position = useContext(BrowseSheetPositionContext);
  if (!position) {
    throw new Error('useBrowseSheetPosition must be used within BrowseSheetPositionProvider');
  }
  return position;
}
