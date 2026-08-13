import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Group, MantineProvider } from '@mantine/core';
import '@fontsource/geist-sans/400.css';
import '@mantine/core/styles.css';
import 'shared/ui/design-system/tokens.css';
import 'app/app.css';
import { PanelSearchToolbar } from 'shared/ui/PanelRouteLayout';
import {
  PanelLayoutFooter,
  PanelLayoutStickyChromeReplacement,
} from 'shared/ui/PanelLayout';
import { SidePanel } from 'widgets/SidePanel/SidePanel';
import { FilterPills } from 'widgets/SidePanel/FilterPills';
import type { SheetSnap } from 'shared/ui/DrawerShell';
import { theme, cssVariablesResolver } from 'app/lib/theme';
import virtualGalleryStyles from 'shared/ui/VirtualGallery/VirtualGallery.module.css';
import { BrowseSectionBar } from 'widgets/BrowseSectionBar';
import { useViewportCapabilities } from 'shared/model/viewportCapabilities';
import uploadStyles from 'features/Upload/ui/UploadSidebar.module.css';
import { TimeStep } from 'features/Upload/ui/steps/TimeStep';

type ContractMode = 'sessions' | 'gallery';

function ContractUploadContent() {
  return (
    <div className={uploadStyles.sidebar} data-contract-upload>
      <div className={uploadStyles.spotSection} data-contract-upload-spot-section>
        Landscape Upload content
      </div>
      <PanelLayoutFooter>
        <footer className={uploadStyles.publishFooter} data-contract-upload-footer>
          <Group className={uploadStyles.footerActions} gap="sm" justify="center">
            <button type="button" style={{ height: 44 }}>Cancel</button>
            <button type="button" style={{ height: 44 }}>Publish</button>
          </Group>
        </footer>
      </PanelLayoutFooter>
    </div>
  );
}

function ContractTimeStep() {
  const [date, setDate] = useState<Date | null>(new Date('2026-08-12T00:00:00'));
  const [range, setRange] = useState<[number, number]>([360, 600]);

  return (
    <div className={uploadStyles.sidebar} data-contract-time-step>
      <TimeStep
        date={date}
        range={range}
        onChange={(nextDate, nextRange) => {
          setDate(nextDate);
          setRange(nextRange);
        }}
        onCommit={() => { }}
      />
    </div>
  );
}

function searchInput() {
  return (
    <input
      aria-label="Search"
      placeholder="Search for a spot..."
      style={{ width: '100%', height: 44, boxSizing: 'border-box', borderRadius: 20 }}
    />
  );
}

function ContractNavigation({ mode, onModeChange }: {
  mode: ContractMode;
  onModeChange: (mode: ContractMode) => void;
}) {
  return (
    <BrowseSectionBar
      active={mode}
      onMap={() => { }}
      onSectionChange={onModeChange}
    />
  );
}

function MobileLayoutContract() {
  const params = new URLSearchParams(window.location.search);
  const drawerPresentation = params.get('presentation') === 'sideOverlay'
    ? 'sideOverlay'
    : 'bottomSheet';
  const showsUploadContract = params.get('surface') === 'upload';
  const showsTimeStepContract = params.get('surface') === 'timeStep';
  const { isStandalone } = useViewportCapabilities();
  const [snap, setSnap] = useState<SheetSnap>('half');
  const [mode, setMode] = useState<ContractMode>('sessions');

  return (
    <div data-app-display-mode={isStandalone ? 'standalone' : 'browser'} data-mobile-layout-contract>
      <div style={{ position: 'fixed', top: 0, left: 0, zIndex: 1000 }}>
        <button onClick={() => setSnap('peek')}>Peek</button>
        <button onClick={() => setSnap('half')}>Half</button>
        <button onClick={() => setSnap('full')}>Full</button>
        <button onClick={() => setMode('sessions')}>Feed state</button>
        <button onClick={() => setMode('gallery')}>Gallery state</button>
        <button
          onClick={() => {
            const scroller = document.querySelector<HTMLElement>('[data-panel-scroll-owner]');
            if (!scroller) return;
            scroller.scrollTop = 120;
            scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
          }}
        >
          Scroll down
        </button>
        <button
          onClick={() => {
            const scroller = document.querySelector<HTMLElement>('[data-panel-scroll-owner]');
            if (!scroller) return;
            scroller.scrollTop = 104;
            scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
          }}
        >
          Scroll up
        </button>
      </div>

      <SidePanel
        drawerPresentation={drawerPresentation}
        open
        expanded
        sheetSnap={drawerPresentation === 'bottomSheet' ? snap : undefined}
        onSheetSnapChange={drawerPresentation === 'bottomSheet' ? setSnap : undefined}
        subheader={(
          <PanelSearchToolbar
            expanded={snap !== 'peek'}
            primary={searchInput()}
            action={<button type="button" style={{ height: 44 }}>Upload</button>}
            trailing={snap !== 'peek' ? (
              <FilterPills active={null} onChange={() => { }} />
            ) : undefined}
          />
        )}
        bottomBar={drawerPresentation === 'bottomSheet' && snap === 'peek' ? undefined : (
          <ContractNavigation mode={mode} onModeChange={setMode} />
        )}
      >
        {showsUploadContract && <ContractUploadContent />}
        {showsTimeStepContract && <ContractTimeStep />}
        {mode === 'gallery' && (
          <PanelLayoutStickyChromeReplacement>
            <button type="button" aria-label="Jump to date" style={{ height: 44 }}>12 August 2026</button>
          </PanelLayoutStickyChromeReplacement>
        )}
        {mode === 'gallery' ? (
          <div className={virtualGalleryStyles.container} data-dense>
            <div data-index="0">
              <div className={virtualGalleryStyles.divider} data-contract-gallery-divider>
                <span className={virtualGalleryStyles.dividerText} data-contract-gallery-first-content>
                  12 August 2026
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div data-contract-card style={{ height: 260, margin: '0 12px 12px', background: 'rgba(255,255,255,.1)' }} />
        )}
        <div data-contract-card style={{ height: 1000, margin: '0 12px', background: 'rgba(255,255,255,.05)' }} />
      </SidePanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark" cssVariablesResolver={cssVariablesResolver}>
      <MobileLayoutContract />
    </MantineProvider>
  </React.StrictMode>,
);
