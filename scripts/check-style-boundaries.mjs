import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const sourceRoots = [
  path.join(root, 'src'),
  path.join(root, 'apps/web/src'),
];

const toPosix = (file) => file.split(path.sep).join('/');

const listFiles = (dir) => {
  const entries = readdirSync(dir);
  return entries.flatMap((entry) => {
    const absolutePath = path.join(dir, entry);
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) return listFiles(absolutePath);
    return [toPosix(path.relative(root, absolutePath))];
  });
};

const isCodeOrCss = (file) => /\.(css|tsx?)$/.test(file);
const isDesignSystemOwner = (file) => (
  file.startsWith('apps/web/src/shared/ui/design-system/')
  || file === 'apps/web/src/app/lib/theme.ts'
);

const isOverlayConsumer = (file) => (
  file.startsWith('apps/web/src/features/Auth/')
  || file.startsWith('apps/web/src/features/SpotSearch/')
  || file.startsWith('apps/web/src/features/Upload/ui/popovers/')
  || file.startsWith('apps/web/src/shared/ui/BaseLightbox/')
  || file.startsWith('apps/web/src/shared/ui/CarouselLightbox/')
  || file === 'apps/web/src/features/Upload/ui/UploadGallery/StepModeModal.tsx'
  || file === 'apps/web/src/shared/ui/DatePickerPopover/DatePickerPopover.tsx'
);

const isMigratedMaterialSurface = (file) => (
  isOverlayConsumer(file)
  || file.startsWith('apps/web/src/features/Cart/')
  || file.startsWith('apps/web/src/features/Purchases/')
  || file.startsWith('apps/web/src/features/Upload/ui/UploadGallery/')
  || file === 'apps/web/src/features/Upload/ui/steps/helpers.tsx'
  || file.startsWith('apps/web/src/shared/ui/BaseGallery/')
  || file.startsWith('apps/web/src/shared/ui/BaseLightbox/')
  || file.startsWith('apps/web/src/shared/ui/CarouselLightbox/')
  || file.startsWith('apps/web/src/shared/ui/PanelGalleryLayout')
  || file.startsWith('apps/web/src/entities/SurfSession/ui/')
  || file.startsWith('apps/web/src/widgets/SidePanel/SessionFeed')
  || file.startsWith('apps/web/src/widgets/SidePanel/SidePanel')
  || file.startsWith('apps/web/src/widgets/AppNavigation/AppNavigation')
  || file.startsWith('apps/web/src/widgets/BrowseSectionBar/')
  || file.startsWith('apps/web/src/shared/ui/SectionSwitcher/')
  || file === 'apps/web/src/widgets/AppNavigation/CartControl.tsx'
  || file.startsWith('apps/web/src/views/GlobeScene/')
  || file === 'apps/web/src/widgets/GlobeMap/LocationPicker.module.css'
  || /^src\/app\/routes\/_panel.*\.tsx$/.test(file)
);

const routePanelCssModulePattern = /^src\/app\/routes\/_panel.*\.module\.css$/;
const routeCodeFilePattern = /^src\/app\/routes\/.*\.tsx?$/;

const isIgnoredRouteTest = (file) => (
  routeCodeFilePattern.test(file)
  && path.basename(file).startsWith('-')
  && /\.(?:test|spec)\.tsx?$/.test(file)
);

const tanStackRouteFactoryNames = new Set([
  'createFileRoute',
  'createRootRoute',
  'createRootRouteWithContext',
]);

const getCalledIdentifier = (expression) => {
  let current = expression;
  while (ts.isCallExpression(current)) current = current.expression;
  return ts.isIdentifier(current) ? current.text : undefined;
};

const declaresTanStackRoute = (contents, file) => {
  const scriptKind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, contents, ts.ScriptTarget.Latest, false, scriptKind);
  const importedRouteFactories = new Set();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement)
      || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== '@tanstack/react-router'
      || !statement.importClause?.namedBindings
      || !ts.isNamedImports(statement.importClause.namedBindings)
    ) continue;

    for (const element of statement.importClause.namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      if (tanStackRouteFactoryNames.has(importedName)) {
        importedRouteFactories.add(element.name.text);
      }
    }
  }

  return sourceFile.statements.some((statement) => {
    if (!ts.isVariableStatement(statement)) return false;
    const isExported = statement.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (!isExported) return false;

    return statement.declarationList.declarations.some((declaration) => (
      ts.isIdentifier(declaration.name)
      && declaration.name.text === 'Route'
      && declaration.initializer
      && importedRouteFactories.has(getCalledIdentifier(declaration.initializer))
    ));
  });
};

const panelInsetConsumers = new Set([
  'apps/web/src/shared/ui/PanelGalleryLayout.module.css',
  'apps/web/src/shared/ui/PanelRouteLayout.module.css',
  'apps/web/src/shared/ui/PanelScrollChrome.module.css',
  'apps/web/src/shared/ui/VirtualGallery/VirtualGallery.module.css',
  'apps/web/src/widgets/SidePanel/SessionFeed.module.css',
]);

const panelGridGapConsumers = new Set([
  'apps/web/src/shared/ui/PanelCollectionGrid/PanelCollectionGrid.module.css',
  'apps/web/src/shared/ui/VirtualGallery/VirtualGallery.module.css',
]);

const panelGridSpacingPropConsumers = new Set([
  'apps/web/src/app/routes/_panel.me.collections.index.tsx',
  'apps/web/src/features/PublicGallery/PublicGallery.tsx',
  'apps/web/src/shared/ui/PanelContentSkeleton/PanelContentSkeleton.tsx',
]);

const ordinaryPanelCollectionCssConsumers = new Set([
  'apps/web/src/shared/ui/BaseGallery/BaseGallery.module.css',
  'apps/web/src/widgets/SidePanel/SessionDetail.module.css',
  'apps/web/src/widgets/SidePanel/SessionFeed.module.css',
]);

const panelLocalResponsiveCssConsumers = new Set([
  ...ordinaryPanelCollectionCssConsumers,
  'apps/web/src/features/Collections/ui/CollectionsToolbar.module.css',
]);

const sessionFeedLayoutConsumers = new Set([
  'apps/web/src/app/routes/_panel.$spotId.index.tsx',
  'apps/web/src/app/routes/_panel.index.tsx',
  'apps/web/src/widgets/SidePanel/SessionFeed.tsx',
]);

const panelLoadingCollectionConsumers = new Set([
  'apps/web/src/app/routes/_panel.me.collections.index.tsx',
  'apps/web/src/shared/ui/PanelContentSkeleton/PanelContentSkeleton.tsx',
]);

const requiredPanelSpacingTokensByFile = new Map([
  ['apps/web/src/features/PublicGallery/PublicGallery.tsx', ['--wa-panel-content-inset', '--wa-panel-grid-gap']],
]);

const requiredResponsiveLayoutTokens = [
  '--wa-shell-edge-clearance',
  '--wa-panel-content-inset',
  '--wa-panel-grid-gap',
  '--wa-panel-section-chrome-height',
  '--wa-control-size-compact',
  '--wa-control-height-default',
  '--wa-control-size-navigation',
  '--wa-control-size-navigation-compact',
  '--wa-control-width-section-navigation',
  '--wa-sheet-grabber-width',
  '--wa-sheet-grabber-height',
  '--wa-grabber-gap',
  '--wa-floating-chrome-edge-gap',
  '--wa-floating-chrome-bottom-offset',
  '--wa-browse-sheet-leading-gap',
  '--wa-upload-sheet-gap',
  '--wa-panel-stack-gap',
  '--wa-motion-duration-control',
  '--wa-motion-duration-chrome',
  '--wa-motion-easing-standard',
  '--wa-safe-area-top',
  '--wa-safe-area-right',
  '--wa-safe-area-bottom',
  '--wa-safe-area-left',
  '--wa-z-panel-chrome',
  '--wa-z-modal-content',
  '--wa-z-modal-interrupt',
  '--wa-radius-sheet',
];

const requiredFloatingChromeOffsetStyles = [
  [
    'flat 4px browser-tab clearance regardless of pointer type',
    /--wa-floating-chrome-bottom-offset:\s*var\(--wa-floating-chrome-edge-gap\)/,
  ],
  [
    'standalone mobile clearance around the physical iOS home indicator',
    /@media\s*\(pointer:\s*coarse\)\s*\{[\s\S]*?\[data-app-display-mode='standalone'\]\s*\{[\s\S]*?--wa-floating-chrome-bottom-offset:\s*calc\(\s*2\s*\*\s*var\(--wa-floating-chrome-edge-gap\)\s*\+\s*var\(--wa-sheet-grabber-height\)\s*\)/s,
  ],
];

// Modal-tier z-index must come from a semantic role token, never a portal
// mount-order default: the content surface (lightbox) and the interrupt above
// it (auth) each declare their tier so an interrupt always outranks content.
const requiredModalRoleTokenByFile = new Map([
  ['apps/web/src/shared/ui/CarouselLightbox/CarouselLightbox.tsx', 'var(--wa-z-modal-content)'],
  ['apps/web/src/features/Auth/AuthModalProvider.tsx', 'var(--wa-z-modal-interrupt)'],
]);

const requiredResponsiveTokensByFile = new Map([
  ['apps/web/src/features/Auth/AuthModalProvider.module.css', [
    '--wa-shell-edge-clearance',
    '--wa-safe-area-top',
    '--wa-safe-area-right',
    '--wa-safe-area-bottom',
    '--wa-safe-area-left',
    '--wa-surface-dialog-opaque',
    '--wa-radius-dialog',
    '--wa-control-size-compact',
  ]],
  ['apps/web/src/features/Auth/ui/AuthForm.module.css', [
    '--wa-control-height-default',
    '--wa-radius-chrome',
    '--wa-radius-pill',
    '--wa-font-size-base',
    '--wa-control-fill',
    '--wa-control-border',
    '--wa-surface-dialog-opaque',
    '--wa-text-primary',
    '--wa-text-muted',
    '--wa-text-on-accent',
    '--wa-accent-spot',
  ]],
  ['apps/web/src/widgets/AppNavigation/MenuControl.module.css', [
    '--wa-control-indicator',
    '--wa-radius-control-md',
  ]],
  ['apps/web/src/shared/ui/DrawerShell/DrawerShell.module.css', [
    '--wa-safe-area-top',
    '--wa-safe-area-right',
    '--wa-safe-area-bottom',
    '--wa-safe-area-left',
    '--wa-radius-panel',
    '--wa-radius-sheet',
    '--wa-sheet-grabber-width',
    '--wa-sheet-grabber-height',
    '--wa-grabber-gap',
  ]],
  ['apps/web/src/shared/ui/BaseGallery/BaseGallery.module.css', [
    '--wa-motion-duration-chrome',
    '--wa-motion-easing-standard',
    '--wa-z-panel-chrome',
  ]],
  ['apps/web/src/shared/ui/PanelCollectionGrid/PanelCollectionGrid.module.css', [
    '--wa-panel-grid-gap',
  ]],
  ['apps/web/src/shared/ui/VirtualGallery/VirtualGallery.module.css', [
    '--wa-panel-grid-gap',
    '--wa-panel-section-chrome-height',
    '--wa-panel-stack-gap',
    '--wa-motion-duration-chrome',
    '--wa-motion-easing-standard',
    '--wa-z-panel-chrome',
  ]],
  ['apps/web/src/widgets/AppNavigation/AppNavigation.module.css', [
    '--wa-shell-edge-clearance',
    '--wa-control-size-navigation',
    '--wa-control-size-navigation-compact',
    '--wa-safe-area-top',
    '--wa-safe-area-left',
    '--wa-safe-area-right',
  ]],
  ['apps/web/src/widgets/BrowseSectionBar/BrowseSectionBar.module.css', [
    '--wa-floating-chrome-bottom-offset',
    '--wa-z-floating-chrome',
  ]],
  ['apps/web/src/features/Collections/ui/CollectionsSectionBar.module.css', [
    '--wa-floating-chrome-bottom-offset',
    '--wa-z-floating-chrome',
  ]],
  // Followed the pill/item declarations here when BrowseSectionBar's visual
  // styling was extracted into the shared SectionSwitcher so a second
  // consumer (CollectionsSectionBar) would not duplicate it — the rule
  // travels with the declarations, not the original filename.
  ['apps/web/src/shared/ui/SectionSwitcher/SectionSwitcher.module.css', [
    '--wa-control-size-navigation',
    '--wa-control-width-section-navigation',
    '--wa-motion-duration-control',
    '--wa-motion-easing-standard',
  ]],
  ['apps/web/src/widgets/SidePanel/SidePanel.module.css', [
    '--wa-control-size-compact',
    '--wa-panel-content-inset',
    '--wa-motion-duration-control',
    '--wa-motion-easing-standard',
  ]],
  // Followed the sticky chrome row here when F12n-b collapsed the two chrome
  // paths onto one seam: the layer token was required of
  // PanelScrollChrome.module.css before that file was deleted, and the rule
  // must travel with the declarations, not die with the filename.
  ['apps/web/src/shared/ui/PanelLayout/PanelLayout.module.css', [
    '--wa-sheet-grabber-height',
    '--wa-grabber-gap',
    '--wa-browse-sheet-leading-gap',
    '--wa-panel-stack-gap',
    '--wa-panel-chrome-paint-allowance',
    '--wa-z-panel-chrome',
  ]],
  ['apps/web/src/shared/ui/PanelRouteLayout.module.css', [
    '--wa-control-height-default',
    '--wa-safe-area-top',
    '--wa-shell-edge-clearance',
    '--wa-z-floating-chrome',
    '--wa-panel-content-inset',
    '--wa-panel-grid-gap',
    '--wa-radius-panel',
    '--wa-panel-stack-gap',
    '--wa-gallery-tile-comfortable',
  ]],
  ['apps/web/src/features/Upload/ui/UploadSidebar.module.css', [
    '--wa-control-height-default',
  ]],
  ['apps/web/src/features/AddSpot/ui/AddSpotPanel.module.css', [
    '--wa-control-height-default',
    '--wa-radius-control-md',
    '--wa-radius-sheet',
    '--wa-accent-spot',
  ]],
  ['apps/web/src/widgets/SidePanel/FilterPills.module.css', [
    '--wa-control-height-default',
    '--wa-panel-content-inset',
  ]],
  ['apps/web/src/features/Collections/ui/CollectionsToolbar.module.css', [
    '--wa-control-height-default',
  ]],
  ['apps/web/src/features/PublicGallery/ui/GalleryDateJumpHeading.module.css', [
    '--wa-control-height-default',
  ]],
]);

const requiredDrawerShellStyles = [
  ['dynamic viewport height', /height:\s*100dvh/],
  ['top safe-area projection', /--wa-safe-area-top/],
  ['right safe-area projection', /--wa-safe-area-right/],
  ['bottom safe-area projection', /--wa-safe-area-bottom/],
  ['left safe-area projection', /--wa-safe-area-left/],
  [
    'side-overlay content free of horizontal physical safe areas',
    /\.surface\[data-drawer-presentation='sideOverlay'\]\s*\{[^}]*padding-inline:\s*0/s,
  ],
  [
    'side-workspace content free of horizontal physical safe areas',
    /\.surface\[data-drawer-presentation='sideWorkspace'\]\s*\{[^}]*padding-inline:\s*0/s,
  ],
  [
    'side-workspace radius only on the exposed inline-start edge',
    /\.surface\[data-drawer-presentation='sideWorkspace'\]\s*\{[^}]*border-radius:\s*var\(--wa-radius-panel\)\s+0\s+0\s+var\(--wa-radius-panel\)\s*;/s,
  ],
  [
    'bottom-sheet content free of duplicated vertical physical safe areas',
    /\.surface\[data-drawer-presentation='bottomSheet'\]\s*\{[^}]*padding-block:\s*0/s,
  ],
  [
    'sheet handle band using the semantic 8px top clearance',
    /\.dragHandle\s*\{[^}]*height:\s*var\(--wa-sheet-drag-handle-height\);[^}]*padding-top:\s*var\(--wa-grabber-gap\)/s,
  ],
  [
    'header-bearing Upload handle using its independent 8px trailing gap',
    /\[data-drawer-sheet-has-header\]\s+\.dragHandle\s*\{[^}]*height:\s*var\(--wa-upload-sheet-drag-handle-height\)/s,
  ],
  [
    'full-screen workspaces painting through the iOS bottom safe area while retaining keyboard clearance',
    /\.surface\[data-drawer-presentation='fullScreen'\]\s*\{[^}]*padding-block-end:\s*var\(--wa-keyboard-inset-bottom,\s*0px\)/s,
  ],
  [
    'full-screen workspaces with square viewport edges',
    /\.surface\[data-drawer-presentation='fullScreen'\]\s*\{[^}]*border-radius:\s*0\s*;/s,
  ],
];

const requiredDrawerShellRuntime = [
  [
    'presentation-aware bottom inset included in the rendered sheet-content height',
    /--wa-sheet-visible-height': `\$\{heights\[snap\] \+ sheetBottomInsetPx\}px`/,
  ],
  [
    'standalone-only bottom inset for sheet geometry',
    /const sheetBottomInsetPx = isStandalone \? safeAreaBottomPx : 0/,
  ],
  ['controlled sheet release without independent drag momentum', /dragMomentum=\{false\}/],
  [
    'measured drawer geometry publication',
    /publishDrawerGeometry\(/,
  ],
  [
    'live geometry sampling during an active sheet drag',
    /\bonDrag=\{/,
  ],
  [
    'dragging flag cleared when the gesture ends or the sheet unmounts',
    /publishDrawerDragging\(false\)/,
  ],
  [
    'header-bearing sheet marker',
    /data-drawer-sheet-has-header=\{peekIncludesHeader\s*\?\s*true\s*:\s*undefined\}/,
  ],
];

const requiredSidePanelStyles = [
  [
    'header horizontal edges aligned with the panel card inset',
    /\.panelTop\s*\{[^}]*padding-inline-start:\s*calc\(\s*var\(--wa-panel-content-inset\)\s*\+\s*var\(--wa-fullscreen-rail-inset,\s*0px\)\s*\)[^}]*padding-inline-end:\s*var\(--wa-panel-content-inset\)/s,
  ],
  [
    'header row with no added vertical padding',
    /\.panelTop\s*\{[^}]*padding-block:\s*0/s,
  ],
];

const requiredCompactBrowseNavigationRuntime = [
  ['composition-owned browse surface input', /\buseBrowseSurface\b/],
  ['DrawerShell-owned live sheet placement projection', /\buseBrowseSheetNavigationPlacement\b/],
  ['full-sheet interaction removal', /\binert=\{hidden\}/],
  [
    'switcher decoupled from the account/cart corner for the sideWorkspace map strip',
    /\bdecoupleSwitcher\s*=\s*presentation\s*===\s*'compactRail'\s*&&\s*drawerPresentation\s*===\s*'sideWorkspace'/,
  ],
];

const requiredCompactBrowseNavigationStyles = [
  [
    'top-bar notch clearance matching its inline edge clearance',
    /\.root\[data-navigation-presentation='topBar'\]\s*\{[^}]*top:\s*calc\(var\(--wa-safe-area-top\)\s*\+\s*var\(--wa-shell-edge-clearance\)\)[^}]*right:\s*calc\(var\(--wa-safe-area-right\)\s*\+\s*var\(--wa-shell-edge-clearance\)\)/s,
  ],
  [
    'middle-snap placement beside the sheet',
    /\.root\[data-navigation-presentation='topBar'\]\[data-sheet-snap='half'\]\s*\{[^}]*--wa-browse-navigation-translate-y:\s*-100%[^}]*top:\s*calc\(var\(--wa-browse-sheet-top\)\s*-\s*var\(--wa-shell-edge-clearance\)\)/s,
  ],
  [
    'continuous opacity driven by the live placement projection',
    /\.root\[data-navigation-presentation='topBar'\]\s*\{[^}]*opacity:\s*var\(--wa-browse-navigation-opacity/s,
  ],
  [
    'transition suppressed while live-tracking a drag',
    /\[data-navigation-tracking\]\s*\{[^}]*transition:\s*none/s,
  ],
  [
    'semantic snap transition',
    /\.root\[data-navigation-presentation='topBar'\]\s*\{[^}]*transition:[^}]*var\(--wa-motion-duration-chrome\)[^}]*var\(--wa-motion-easing-standard\)/s,
  ],
  [
    'side-overlay navigation using the larger safe-area or ordinary edge clearance',
    /\.root\[data-navigation-presentation='compactRail'\]\[data-drawer-presentation='sideOverlay'\]\s*\{[^}]*top:\s*max\(var\(--wa-safe-area-top\),\s*var\(--wa-shell-edge-clearance\)\)[^}]*left:\s*max\(var\(--wa-safe-area-left\),\s*var\(--wa-shell-edge-clearance\)\)/s,
  ],
  [
    'constrained horizontal navigation preserving Account-before-Cart DOM order',
    /\.root\[data-navigation-presentation='compactBar'\]\s+\.stack\s*\{[^}]*flex-direction:\s*row/s,
  ],
  [
    'shared navigation controls using the navigation-size token for both pointer-target dimensions',
    /\.button\s*\{[^}]*width:\s*var\(--wa-control-size-navigation\)[^}]*height:\s*var\(--wa-control-size-navigation\)/s,
  ],
  [
    'switcher anchor centered independently of the account/cart corner, with the same left-edge clearance',
    /\.switcherAnchor\s*\{[^}]*top:\s*50%[^}]*left:\s*calc\(var\(--wa-safe-area-left\)\s*\+\s*var\(--wa-shell-edge-clearance\)\)[^}]*transform:\s*translateY\(-50%\)/s,
  ],
];

const forbiddenCompactBrowseNavigationStyles = [
  [
    'a side-workspace override that pulls the rail away from the shared top-left corner clearance every other presentation uses',
    /\.root\[data-navigation-presentation='compactRail'\]\[data-drawer-presentation='sideWorkspace'\]\s*\{[^}]*top:/s,
  ],
];

const requiredCollectionsToolbarStyles = [
  [
    'content-fit width capped in the landscape workspace header',
    /\.spotSelectHeader\s*\{[^}]*min-width:\s*min-content;[^}]*max-width:\s*140px/s,
  ],
  [
    'equal vertical breathing room in the landscape workspace header',
    /\.spotSelectHeader\s*\{[^}]*margin-block:\s*4px/s,
  ],
];

const requiredUploadSidebarStyles = [
  [
    'compact short-landscape spacing owned by the side-overlay presentation',
    /:global\(\[data-drawer-presentation='sideOverlay'\]\)\s+\.sidebar\s*\{[^}]*--upload-gutter:\s*12px;[^}]*--upload-section-gap:\s*12px;[^}]*--upload-compact-inset:\s*4px;[^}]*--upload-block-padding-top:\s*8px;[^}]*--upload-block-padding-bottom:\s*8px;[^}]*--upload-label-gap:\s*8px;[^}]*--upload-nested-gap:\s*8px;[^}]*--upload-empty-padding:\s*12px;/s,
  ],
  [
    'portrait Upload search using the shared 8px inset below its unpadded header',
    /\.spotSection\s*\{[^}]*padding:\s*var\(--upload-compact-inset\)\s+var\(--upload-gutter\)/s,
  ],
  [
    'Upload search at Peek clearing the true screen edge by the flat bottom-plate gap',
    /:global\(\[data-panel-layout\]\[data-sheet-snap='peek'\]\)\s+\.spotSection\s*\{[^}]*padding-block-end:\s*var\(--wa-floating-chrome-edge-gap\)/s,
  ],
  [
    'Upload search at Peek in standalone taking the full shared gap-grabber-gap offset',
    /:global\(\[data-app-display-mode='standalone'\]\)\s*:global\(\[data-panel-layout\]\[data-sheet-snap='peek'\]\)\s+\.spotSection\s*\{[^}]*padding-block-end:\s*var\(--wa-floating-chrome-bottom-offset\)/s,
  ],
  [
    'Upload action bar narrowing portrait, short-landscape, and desktop chrome without owning bottom placement',
    /\[data-panel-layout\]\[data-sheet-snap\][^{]*\[data-panel-layout-footer\]:has\(\[data-upload-publish-footer\]\),\s*:global\(\[data-panel-layout\]\[data-drawer-presentation='sideOverlay'\]\)[^{]*\[data-panel-layout-footer\]:has\(\[data-upload-publish-footer\]\),\s*:global\(\[data-panel-layout\]\[data-drawer-presentation='persistent'\]\)[^{]*\[data-panel-layout-footer\]:has\(\[data-upload-publish-footer\]\)\s*\{[^}]*width:\s*fit-content;[^}]*margin-bottom:\s*0;[^}]*padding:\s*8px;/s,
  ],
];

const requiredCartCheckoutFooterStyles = [
  [
    'checkout card stripping the shared floating-footer chrome down to an invisible shrink-to-fit box on every floating presentation (sheet, side-overlay, fullScreen, sideWorkspace, persistent), since the card paints its own complete glass pill',
    /\[data-panel-layout\]\[data-sheet-snap\][^{]*\[data-panel-layout-footer\]:has\(\[data-cart-checkout-footer\]\),\s*:global\(\[data-panel-layout\]\[data-drawer-presentation='sideOverlay'\]\)[^{]*\[data-panel-layout-footer\]:has\(\[data-cart-checkout-footer\]\),\s*:global\(\[data-panel-layout\]\[data-drawer-presentation='fullScreen'\]\)[^{]*\[data-panel-layout-footer\]:has\(\[data-cart-checkout-footer\]\),\s*:global\(\[data-panel-layout\]\[data-drawer-presentation='sideWorkspace'\]\)[^{]*\[data-panel-layout-footer\]:has\(\[data-cart-checkout-footer\]\),\s*:global\(\[data-panel-layout\]\[data-drawer-presentation='persistent'\]\)[^{]*\[data-panel-layout-footer\]:has\(\[data-cart-checkout-footer\]\)\s*\{[^}]*width:\s*fit-content;[^}]*background:\s*none;[^}]*border:\s*none;[^}]*box-shadow:\s*none;/s,
  ],
];

const requiredBrowseSectionBarRuntime = [
  [
    'measured drawer-adjacent placement',
    /\buseDrawerAdjacentInlineEndInset\b/,
  ],
];

const requiredBrowseSectionBarStyles = [
  [
    'presentation-aware bottom clearance for the floating switcher',
    /\.root\s*\{[^}]*bottom:\s*var\(--wa-floating-chrome-bottom-offset\)/s,
  ],
  [
    'centering within the measured map remainder',
    /\.root\[data-drawer-adjacent\]\s*\{[^}]*inset-inline-start:\s*calc\(\(100%\s*-\s*var\(--wa-browse-section-drawer-inset\)\)\s*\/\s*2\)/s,
  ],
  [
    'drawer-adjacent bottom chrome preserving the same presentation-aware clearance',
    /\.root\[data-drawer-adjacent\]\s*\{[^}]*bottom:\s*var\(--wa-floating-chrome-bottom-offset\)/s,
  ],
];

const requiredCollectionsSectionBarStyles = [
  [
    'floating collections navigation preserving the same presentation-aware clearance as Browse',
    /\.floating\s*\{[^}]*bottom:\s*var\(--wa-floating-chrome-bottom-offset\)/s,
  ],
];

const requiredCompactBrowseToolbarStyles = [
  [
    'bottom-sheet search row filling the shared panel inset without a card-width dependency',
    /\[data-drawer-presentation='bottomSheet'\][^{]*\.toolbarMain\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none;[^}]*margin-inline:\s*0/s,
  ],
  [
    'bottom-sheet 12px gap between search and filter rows',
    /\[data-panel-layout\]\[data-sheet-snap='half'\][^{]*\.toolbar\[data-expanded\],\s*:global\(\[data-panel-layout\]\[data-sheet-snap='full'\]\)\s+\.toolbar\[data-expanded\]\s*\{[^}]*gap:\s*var\(--wa-panel-stack-gap\)/s,
  ],
  [
    'desktop one-column search group isolated from mobile presentations',
    /data-panel-layout\]:not\(\[data-drawer-presentation='bottomSheet'\]\):not\(\[data-drawer-presentation='sideOverlay'\]\):has\(\[data-panel-collection-grid\]\[data-columns='1'\]\)[^{]*\.toolbarMainExpanded\s*\{[^}]*flex:\s*0\s+0\s+auto;[^}]*width:\s*100%;[^}]*max-width:\s*none/s,
  ],
  [
    'desktop two-column search group isolated from mobile presentations',
    /data-panel-layout\]:not\(\[data-drawer-presentation='bottomSheet'\]\):not\(\[data-drawer-presentation='sideOverlay'\]\):has\(\[data-panel-collection-grid\]\[data-columns='2'\]\)[^{]*\.toolbarMainExpanded\s*\{[^}]*flex:\s*0\s+0\s+auto;[^}]*width:\s*calc\(\(100%\s*-\s*var\(--wa-panel-grid-gap\)\)\s*\/\s*2\)/s,
  ],
  [
    'desktop three-column search group isolated from mobile presentations',
    /data-panel-layout\]:not\(\[data-drawer-presentation='bottomSheet'\]\):not\(\[data-drawer-presentation='sideOverlay'\]\):has\(\[data-panel-collection-grid\]\[data-columns='3'\]\)[^{]*\.toolbarMainExpanded\s*\{[^}]*flex:\s*0\s+0\s+auto;[^}]*width:\s*calc\(\(100%\s*-\s*2\s*\*\s*var\(--wa-panel-grid-gap\)\)\s*\/\s*3\)/s,
  ],
  [
    'even compact bottom-sheet toolbar breathing room',
    /\[data-drawer-presentation='bottomSheet'\][^{]*\.toolbar:not\(\[data-expanded\]\)\s*\{[^}]*margin-block:\s*4px/s,
  ],
  [
    'short side-overlay toolbar stacking',
    /\[data-drawer-presentation='sideOverlay'\][^{]*\.toolbar\s*\{[^}]*flex-direction:\s*column[^}]*align-items:\s*stretch/s,
  ],
  [
    'side-overlay 12px gap between search and filter rows',
    /\[data-drawer-presentation='sideOverlay'\][^{]*\.toolbar\[data-expanded\]\s*\{[^}]*gap:\s*var\(--wa-panel-stack-gap\)/s,
  ],
];

const requiredSessionFeedStyles = [
  [
    'bottom-sheet card grid yielding its top padding to the shared 12px chrome gap',
    /\[data-panel-layout\]\[data-sheet-snap='half'\][^{]*\.grid,\s*:global\(\[data-panel-layout\]\[data-sheet-snap='full'\]\)\s+\.grid\s*\{[^}]*padding-block-start:\s*0/s,
  ],
  [
    'side-overlay card grid yielding its top padding to the shared 12px chrome gap',
    /\[data-panel-layout\]\[data-drawer-presentation='sideOverlay'\][^{]*\.grid\s*\{[^}]*padding-block-start:\s*0/s,
  ],
];

const requiredFilterPillStyles = [
  [
    'a horizontally scrollable owner',
    /\.root\[data-horizontal-scroll\]\s*\{[^}]*overflow-x:\s*auto/s,
  ],
  [
    'a no-wrap pill row inside that owner',
    /\.root\[data-horizontal-scroll\]\s+\.row\s*\{[^}]*flex-wrap:\s*nowrap/s,
  ],
];

const requiredPanelLayoutStyles = [
  ['one vertical scroll owner', /overflow-y:\s*auto/],
  ['scroll overscroll containment', /overscroll-behavior:\s*contain/],
  ['panel container-query context', /container-type:\s*inline-size/],
  // The pinned row is an overlay sibling of the clipped scroll owner. Its
  // measured height is projected as the owner's initial top space, preserving
  // the old in-flow geometry without subjecting chrome paint to the clip.
  ['one chrome overlay seam beside the scroll owner', /\.scrollRegion\s*{[^}]*position:\s*relative[\s\S]*\.chromeViewport\s*{[^}]*position:\s*absolute/s],
  ['measured chrome space projected into scrolling content', /\.scroller\s*{[^}]*padding-block-start:\s*var\(--wa-panel-chrome-height,\s*0px\)/s],
  [
    'header-bearing panels clip returning chrome at the header edge',
    /\.root:has\(>\s*\[data-panel-layout-header\]\)\s+\.chromeViewport\s*{[^}]*inset-block-start:\s*0[^}]*padding-block-start:\s*0/s,
  ],
  ['content that flexes rather than claiming full height', /\.content\s*{[^}]*flex:\s*1\s+0\s+auto/s],
  [
    'primary and replacement chrome stacked in one constant-geometry grid cell',
    /\.stickyChrome\s+\[data-panel-scroll-chrome-primary\],\s*\n\s*\.stickyChrome\s+\[data-panel-scroll-chrome-replacement\]\s*\{[^}]*grid-area:\s*1\s*\/\s*1/s,
  ],
  [
    'one shared row cross-fading primary and replacement chrome when a replacement exists',
    /\.stickyChrome\[data-hidden\]:has\(\[data-panel-scroll-chrome-replacement\]\)\s+\[data-panel-scroll-chrome-primary\]\s*\{[^}]*opacity:\s*0[\s\S]*\.stickyChrome\[data-hidden\]\s+\[data-panel-scroll-chrome-replacement\]\s*\{[^}]*opacity:\s*1/s,
  ],
  [
    'a replacement-less row slides itself (not just its content) through its own top edge',
    /\.stickyChrome\[data-hidden\]:not\(:has\(\[data-panel-scroll-chrome-replacement\]\)\)\s*\{[^}]*transform:\s*translateY\(calc\(-100%\s*-\s*var\(--wa-panel-chrome-paint-allowance\)\)\)/s,
  ],
  [
    // Reaching the top is what orders the row back, so a list standing at the top
    // under a still-travelling row is a contradiction. The slide is a fixed
    // duration and the scroll-back that triggers it can be shorter, so the
    // transition has to end on arrival rather than run on past it.
    'a row that stops sliding the moment its list reaches the top',
    /\.stickyChrome:not\(\[data-hidden\]\):not\(\[data-scrolled-from-top\]\)\s*\{[^}]*transition:\s*translate\s/s,
  ],
  [
    'reduced motion swaps chrome instantly instead of animating',
    /prefers-reduced-motion:\s*reduce\)\s*\{[^{}]*\.stickyChrome,[\s\S]*?\.stickyChrome\s+\[data-panel-scroll-chrome-primary\][\s\S]*?transition:\s*none/s,
  ],
  [
    'hideable chrome cannot feed layout shifts back into scroll direction',
    /^\.scroller\s*\{[^}]*overflow-anchor:\s*none/ms,
  ],
  [
    // The compact toolbar already contributes 4px margin-block, the flat
    // bottom-plate edge gap, so this row adds nothing below it — only 16px
    // above it, after the sheet grabber.
    'peek search row uses 16px above and the flat edge gap below',
    /\.root\[data-sheet-snap='peek'\]\s+\.stickyChrome\s*\{[^}]*padding-block:\s*calc\(var\(--wa-browse-sheet-leading-gap\)\s*-\s*4px\)\s+calc\(var\(--wa-floating-chrome-edge-gap\)\s*-\s*4px\)/s,
  ],
  [
    'peek search row in standalone taking the full shared gap-grabber-gap offset below',
    /:global\(\[data-app-display-mode='standalone'\]\)\s+\.root\[data-sheet-snap='peek'\]\s+\.stickyChrome\s*\{[^}]*padding-block-end:\s*calc\(var\(--wa-floating-chrome-bottom-offset\)\s*-\s*4px\)/s,
  ],
  [
    // DrawerShell publishes the snap's reachable content height: safe-area strips are
    // already outside that budget. PanelLayout owns only the drag handle's share, so
    // subtracting a safe-area inset here would charge it twice and clip Peek's input.
    'sheet content height subtracts only the drag handle from the reachable snap height',
    /\.root\[data-sheet-snap\]\s*\{[^}]*height:\s*calc\(\s*var\(--wa-sheet-visible-height\)\s*-\s*var\(--wa-sheet-drag-handle-height\)\s*\)/s,
  ],
  [
    'peek content begins at the grabber bottom and owns the remaining visible height',
    /\.root\[data-sheet-snap='peek'\]\s*\{[^}]*height:\s*calc\([^}]*var\(--wa-sheet-visible-height\)[^}]*var\(--wa-grabber-gap\)[^}]*var\(--wa-sheet-grabber-height\)[^}]*\);[^}]*margin-top:\s*calc\(var\(--wa-grabber-gap\)\s*\+\s*var\(--wa-sheet-grabber-height\)\)/s,
  ],
  [
    'half and full sticky chrome leave 12px after the filter row',
    /\.root\[data-sheet-snap='half'\]\s+\.stickyChrome,\s*\.root\[data-sheet-snap='full'\]\s+\.stickyChrome\s*\{[^}]*padding-block:\s*0\s+var\(--wa-panel-stack-gap\)/s,
  ],
  [
    // On `translate`, so it composes with the hide/reveal slide on `transform`
    // instead of one rule replacing the other and jerking the row mid-motion.
    'scrolled half and full chrome paints 8px below the sheet top without resizing its layout box',
    /\.root\[data-sheet-snap='half'\]\s+\.stickyChrome\[data-scrolled-from-top\],\s*\.root\[data-sheet-snap='full'\]\s+\.stickyChrome\[data-scrolled-from-top\]\s*\{[^}]*translate:\s*0\s+var\(--wa-grabber-gap\)/s,
  ],
  [
    'compact Gallery delegates its first 12px content gap to the first date divider',
    /\.root\[data-sheet-snap='half'\]\s+\.stickyChrome:has\(\[data-panel-scroll-chrome-replacement\]\),\s*\.root\[data-sheet-snap='full'\]\s+\.stickyChrome:has\(\[data-panel-scroll-chrome-replacement\]\)\s*\{[^}]*padding-block-end:\s*0/s,
  ],
  [
    'full-screen flush route chrome does not stack padding around its content',
    /\.root\[data-drawer-presentation='fullScreen'\]\s+\.stickyChrome:has\(\[data-panel-scroll-chrome-spacing='flush'\]\)\s*\{[^}]*padding-block:\s*0/s,
  ],
  [
    'side-overlay sticky chrome uses the shared 12px stack gap',
    /\.root\[data-drawer-presentation='sideOverlay'\]\s+\.stickyChrome\s*\{[^}]*padding-block:\s*var\(--wa-panel-stack-gap\)/s,
  ],
  [
    'side-overlay footer preserves its approved 6px panel-edge offset in every display mode',
    /\.root\[data-drawer-presentation='sideOverlay'\]\s+\.footer\s*\{[^}]*bottom:\s*6px/s,
  ],
  [
    'side-workspace footer preserves its approved 20px bottom padding',
    /\.root\[data-drawer-presentation='sideWorkspace'\]\s+\.footer\s*\{[^}]*padding-block-end:\s*20px/s,
  ],
  [
    'header-bearing Upload sheet subtracts its independent 8px handle band',
    /\[data-drawer-sheet-has-header\][^{]*\.root\[data-sheet-snap\]\s*\{[^}]*var\(--wa-upload-sheet-drag-handle-height\)/s,
  ],
  [
    'full-screen footer actions clearing the bottom by the same offset every other floating footer uses',
    /\.root\[data-drawer-presentation='fullScreen'\]\s+\.footer\s*\{[^}]*padding-block-end:\s*var\(--wa-floating-chrome-bottom-offset\)/s,
  ],
  [
    'full-screen, side-workspace, and persistent footer joining the sheet and side-overlay footer as a floating overlay above content, not a normal-flow row inside the drawer surface',
    /\.root\[data-sheet-snap\]\s+\.footer,\s*\.root\[data-drawer-presentation='sideOverlay'\]\s+\.footer,\s*\.root\[data-drawer-presentation='fullScreen'\]\s+\.footer,\s*\.root\[data-drawer-presentation='sideWorkspace'\]\s+\.footer,\s*\.root\[data-drawer-presentation='persistent'\]\s+\.footer\s*\{[^}]*position:\s*absolute/s,
  ],
  [
    'full-screen, side-workspace, and persistent scroll content reserving space for the floating footer the same way sheet and side-overlay content already do',
    /\.root\[data-sheet-snap\]\s+\.content,\s*\.root\[data-drawer-presentation='sideOverlay'\]\s+\.content,\s*\.root\[data-drawer-presentation='fullScreen'\]\s+\.content,\s*\.root\[data-drawer-presentation='sideWorkspace'\]\s+\.content,\s*\.root\[data-drawer-presentation='persistent'\]\s+\.content\s*\{[^}]*padding-bottom:\s*calc\(var\(--wa-panel-footer-height/s,
  ],
];

const forbiddenPanelLayoutStyles = [
  [
    'scroll-state-dependent positioning for full-screen flush route chrome',
    /\.root\[data-drawer-presentation='fullScreen'\]\s+\.stickyChrome\[data-scrolled-from-top\][^{]*:has\(\[data-panel-scroll-chrome-spacing='flush'\]\)\s*\{/s,
  ],
  [
    // The hide/reveal slide owns `transform` alone. Putting a second offset back
    // on it means the more specific rule replaces the slide outright rather than
    // adding to it, which is exactly the mid-motion 8px jump this separation
    // removed. Any further row offset belongs on `translate`.
    'a second row offset sharing the hide slide’s own transform property',
    /\.stickyChrome\[data-scrolled-from-top\][^{]*\{[^}]*transform:/s,
  ],
];

const requiredMobileGalleryLargeTextStyles = [
  [
    'apps/web/src/shared/ui/VirtualGallery/VirtualGallery.module.css',
    'the first compact date divider owning the 12px gap below filter pills',
    /\.container\[data-dense\]\s+\[data-index='0'\]\s+\.divider\s*\{[^}]*align-items:\s*flex-start;[^}]*box-sizing:\s*border-box;[^}]*padding-block-start:\s*var\(--wa-panel-stack-gap\)/s,
  ],
  [
    'apps/web/src/shared/ui/VirtualGallery/VirtualGallery.module.css',
    'semantic minimum height for gallery date dividers',
    /\.divider\s*\{[^}]*min-height:\s*var\(--wa-panel-section-chrome-height\)/s,
  ],
  [
    'apps/web/src/shared/ui/VirtualGallery/VirtualGallery.module.css',
    'overflow wrapping for gallery date dividers',
    /\.dividerText\s*\{[^}]*overflow-wrap:\s*anywhere/s,
  ],
  [
    'apps/web/src/shared/ui/BaseGallery/BaseCard.module.css',
    'a capped width so the card overlay badge row wraps within the card instead of overflowing it',
    /\.overlays\s*\{[^}]*max-width:/s,
  ],
  [
    'apps/web/src/shared/ui/CarouselLightbox/CarouselLightbox.module.css',
    'a caption that stretches to the media frame width instead of clipping at its content width',
    /\.mediaCaption\s*\{[^}]*max-width:\s*100%/s,
  ],
  [
    'apps/web/src/shared/ui/CarouselLightbox/CarouselLightbox.module.css',
    'a media-unavailable placeholder that grows instead of clipping its label',
    /\.mediaUnavailable\s*\{[^}]*min-height:/s,
  ],
  [
    'apps/web/src/shared/ui/CarouselLightbox/CarouselLightbox.module.css',
    'overflow wrapping for the media-unavailable label',
    /\.mediaUnavailableLabel\s*\{[^}]*overflow-wrap:\s*anywhere/s,
  ],
];

const mobileGalleryLargeTextCssConsumers = new Set([
  'apps/web/src/features/PublicGallery/ui/GalleryDateJumpHeading.module.css',
  'apps/web/src/features/PublicGallery/ui/GalleryDateMonthList.module.css',
  'apps/web/src/shared/ui/VirtualGallery/VirtualGallery.module.css',
]);

const requiredGalleryDateMonthListConsumers = [
  'apps/web/src/features/PublicGallery/ui/GalleryDateJumpHeading.tsx',
  'apps/web/src/features/PublicGallery/ui/GalleryDateSidebar.tsx',
];

// The component owns the count (F12k); the stylesheet must not re-column.
const forbiddenPanelCollectionGridStyles = [
  ['column ownership', /grid-template-columns/],
  ['panel container-query re-columning', /@container\s+panel/],
  ['drawer-state column override', /\[data-drawer-state/],
];

const isServerNonTestFile = (file) => (
  file.startsWith('apps/api/src/')
  && !/\.test\.tsx?$/.test(file)
);

const isRuntimeTypeScript = (file) => (
  /\.tsx?$/.test(file)
  && !/\.(?:test|spec)\.tsx?$/.test(file)
);

const sessionLifecycleInvalidationCallers = new Set([
  'apps/web/src/entities/SurfSession/model/usePublishedSession.ts',
  'apps/web/src/features/Upload/model/usePublishUploadSession.ts',
]);

const isAddSpotUi = (file) => file.startsWith('apps/web/src/features/AddSpot/ui/');

const mantineRadiusLiteralConsumers = new Set([
  'apps/web/src/features/Upload/ui/UploadGallery/UploadZone.tsx',
  'apps/web/src/features/SpotSearch/SpotSearch.tsx',
  'apps/web/src/features/Upload/ui/steps/TimeStep.tsx',
]);

const rules = [
  {
    id: 'api-origin-has-one-owner',
    message: 'Read the deployed API origin through shared/lib/apiOrigin so auth and data requests cannot drift apart.',
    pattern: /\bVITE_API_URL\b/,
    include: isRuntimeTypeScript,
    exclude: file => file === 'apps/web/src/shared/lib/apiOrigin.ts',
  },
  {
    id: 'no-route-panel-css-modules',
    message: 'Panel route files must compose shared/feature UI instead of owning CSS modules.',
    pattern: /./,
    include: file => routePanelCssModulePattern.test(file),
  },
  {
    id: 'no-legacy-route-intent-vocabulary',
    message: 'Import AppRouteIntent from shared/model/appRouteIntent instead of recreating legacy route state.',
    pattern: /\b(?:panelMode|PanelRouteMode|getPanelRouteMode|isFullPageRouteActive|isUploadSpotSelectionActive)\b/,
    include: file => /\.tsx?$/.test(file),
  },
  {
    id: 'viewport-capabilities-have-one-owner',
    message: 'Read viewport size and media capabilities through shared/model/viewportCapabilities.',
    pattern: /\b(?:innerWidth|innerHeight|matchMedia)\b/,
    include: isRuntimeTypeScript,
    exclude: file => (
      file === 'apps/web/src/shared/model/viewportCapabilities.ts'
      || file === 'apps/web/src/shared/model/viewportMetrics.ts'
    ),
  },
  {
    id: 'viewport-metrics-owns-visual-viewport',
    message: 'Read visual-viewport geometry (the keyboard-aware viewport) through shared/model/viewportMetrics.',
    pattern: /\bvisualViewport\b/,
    include: isRuntimeTypeScript,
    exclude: file => file === 'apps/web/src/shared/model/viewportMetrics.ts',
  },
  {
    id: 'viewport-metrics-owns-safe-area-insets',
    message: 'Read safe-area insets as px through shared/model/viewportMetrics (safeAreaTopPx/safeAreaBottomPx), not a raw env() probe.',
    pattern: /safe-area-inset-(?:top|right|bottom|left)/,
    include: isRuntimeTypeScript,
    exclude: file => file === 'apps/web/src/shared/model/viewportMetrics.ts',
  },
  {
    id: 'app-shell-layout-policy-has-one-owner',
    message: 'Derive shell presentation through shared/model/appShellLayoutPolicy.',
    pattern: /\b(?:deriveAppChromePolicy|derivePanelTargetPolicy|deriveGlobeInteractionPolicy|deriveDesktopFoundationAppShellLayoutPolicy)\b/,
    include: isRuntimeTypeScript,
    exclude: file => file === 'apps/web/src/shared/model/appShellLayoutPolicy.ts',
  },
  {
    id: 'app-shell-policy-is-reached-through-the-presentation-seam',
    message: 'Derive shell presentation through shared/model/appShellPresentation, which applies the mounted-band gate.',
    pattern: /\bderiveAppShellLayoutPolicy\b/,
    include: isRuntimeTypeScript,
    exclude: file => (
      file === 'apps/web/src/shared/model/appShellPresentation.tsx'
      || file === 'apps/web/src/shared/model/appShellLayoutPolicy.ts'
    ),
  },
  {
    id: 'activation-matrix-vocabulary-is-confined-to-the-policy-provider',
    message: 'The activation matrix is temporary scaffolding owned by the policy provider; consumers read the semantic policy through useAppShellLayoutPolicy.',
    pattern: /\b(?:ACTIVE_CELLS|ActivationCell|isCellActive|resolveShellLayoutPolicy)\b/,
    include: isRuntimeTypeScript,
    exclude: file => file === 'apps/web/src/shared/model/appShellPresentation.tsx',
  },
  {
    id: 'app-shell-policy-provider-is-mounted-at-the-composition-root',
    message: 'Mount the shell policy provider once at the composition root.',
    pattern: /\bAppShellLayoutPolicyProvider\b/,
    include: isRuntimeTypeScript,
    exclude: file => (
      file === 'apps/web/src/shared/model/appShellPresentation.tsx'
      || file === 'apps/web/src/app/routes/__root.tsx'
    ),
  },
  {
    id: 'browse-surface-provider-is-mounted-at-the-composition-root',
    message: 'Mount the browse surface provider once at the composition root.',
    pattern: /<BrowseSurfaceProvider[\s>]/,
    include: isRuntimeTypeScript,
    exclude: file => file === 'apps/web/src/app/routes/__root.tsx',
  },
  {
    id: 'browse-surface-has-bounded-consumers',
    message: 'Only the panel route, map scene, and app navigation may consume the composition-owned browse surface.',
    pattern: /\buseBrowseSurface\b/,
    include: isRuntimeTypeScript,
    exclude: file => (
      file === 'apps/web/src/shared/ui/DrawerShell/browseSurface.tsx'
      || file === 'apps/web/src/shared/ui/DrawerShell/index.ts'
      || file === 'apps/web/src/app/routes/_panel.tsx'
      || file === 'apps/web/src/widgets/AppNavigation/AppNavigation.tsx'
      || file === 'apps/web/src/views/GlobeScene/GlobeScene.tsx'
    ),
  },
  {
    id: 'browse-section-bar-is-mounted-by-the-panel-route',
    message: 'Mount compact browse section navigation once from the panel route.',
    pattern: /<BrowseSectionBar[\s>]/,
    include: isRuntimeTypeScript,
    exclude: file => file === 'apps/web/src/app/routes/_panel.tsx',
  },
  {
    id: 'app-navigation-is-mounted-once-by-the-shell',
    message: 'Navigation is mounted once by AppShell from the shell policy; features and routes must not mount a navigation presentation.',
    // JSX-mount only, not the bare identifier: routes/features may still import the
    // AppNavigationSupplement portal named export from the same module.
    pattern: /<AppNavigation[\s/>]/,
    include: isRuntimeTypeScript,
    exclude: file => (
      file === 'apps/web/src/app/AppShell.tsx'
      || file.startsWith('apps/web/src/widgets/AppNavigation/')
    ),
  },
  {
    id: 'no-legacy-navigation-placement-vocabulary',
    message: 'Navigation is named by role, not placement: use AppNavigation with the policy presentation instead of LeftStrip.',
    pattern: /\bLeftStrip\b/,
    include: file => /\.tsx?$/.test(file),
  },
  {
    id: 'no-legacy-rendered-panel-snapshot',
    message: 'Read actual rendered bounds from the DrawerShell geometry projection instead of a boolean snapshot.',
    pattern: /\b(?:getRenderedPanelExpandedSnapshot|setRenderedPanelExpandedSnapshot|subscribeRenderedPanelExpandedSnapshot|useRenderedPanelExpandedSnapshot)\b/,
    include: file => /\.tsx?$/.test(file),
  },
  {
    id: 'drawer-shell-owns-geometry-publication',
    message: 'Only DrawerShell may publish rendered or target drawer geometry; other modules consume the read-only projections.',
    pattern: /\bpublishDrawer(?:Target)?Geometry\b/,
    include: isRuntimeTypeScript,
    exclude: file => (
      file === 'apps/web/src/shared/ui/DrawerShell/DrawerShell.tsx'
      || file === 'apps/web/src/shared/ui/DrawerShell/geometry.ts'
    ),
  },
  {
    id: 'globe-scene-consumes-drawer-owned-geometry',
    message: 'GlobeScene must consume DrawerShell geometry instead of reconstructing sheet-snap geometry.',
    pattern: /\b(?:useBrowseSheetNavigationPlacement|resolveSheetSnapHeights|SHEET_PEEK_HEIGHT_PX)\b/,
    include: file => file === 'apps/web/src/views/GlobeScene/GlobeScene.tsx',
  },
  {
    id: 'globe-camera-insets-use-measured-drawer',
    message: 'The map camera must consume four-sided insets derived from measured drawer bounds, not local panel-width or expansion heuristics.',
    pattern: /\b(?:PANEL_WIDTH_VW|isRenderedPanelExpanded)\b/,
    include: file => (
      file === 'apps/web/src/views/GlobeScene/GlobeScene.tsx'
      || file === 'apps/web/src/views/GlobeScene/model/mapCameraInsets.ts'
      || file === 'apps/web/src/widgets/GlobeMap/GlobeMapComponent.tsx'
    ),
  },
  {
    id: 'no-legacy-right-edge-map-occlusion',
    message: 'Map camera occlusion is a four-sided inset projection (M00b); the right-edge-only occlusion vocabulary is retired.',
    pattern: /\b(?:rightOccludedPx|sidebarOccludedPx|deriveDrawerViewportOcclusionPx|drawerViewportOcclusion)\b/,
    include: file => /\.tsx?$/.test(file),
  },
  {
    id: 'no-legacy-site-workspace-escape-hatches',
    message: 'siteWorkspace geometry and column density are owned by DrawerShell and PanelCollectionGrid; the per-route width/column overrides and outside-drawer floating mount this replaces must not be reintroduced.',
    pattern: /\b(?:sideOverlayWidthVw|galleryMaxColumns|COLLECTIONS_SIDE_OVERLAY_WIDTH_VW|COLLECTIONS_SIDE_OVERLAY_MAX_COLUMNS|SidePanelFloating)\b/,
    include: file => /\.tsx?$/.test(file),
  },
  {
    id: 'drawer-shell-owns-adjacent-control-placement',
    message: 'Place drawer-adjacent controls from DrawerShell measured geometry, not local viewport formulas.',
    pattern: /\bPANEL_WIDTH_VW\b|\b25vw\b|calc\([^)]*\bvw\b/,
    include: file => (
      file === 'apps/web/src/app/routes/_panel.tsx'
      || file.startsWith('apps/web/src/shared/ui/PanelRouteLayout')
    ),
  },
  {
    id: 'drawer-shell-owns-surface-runtime',
    message: 'Drawer animation and width application belong in shared/ui/DrawerShell.',
    pattern: /from\s+['"]framer-motion['"]|\bmotion\.|\b(?:PANEL_WIDTH_VW|SIDE_PANEL_TRANSITION)\b/,
    include: file => file === 'apps/web/src/widgets/SidePanel/SidePanel.tsx',
  },
  {
    id: 'drawer-shell-owns-surface-styles',
    message: 'Drawer positioning and the scroll container belong in shared/ui/DrawerShell.',
    pattern: /position:\s*fixed|overflow-y:\s*auto|overscroll-behavior|safe-area-inset|height:\s*100dvh/,
    include: file => file === 'apps/web/src/widgets/SidePanel/SidePanel.module.css',
  },
  {
    id: 'drawer-shell-owns-sheet-snap-geometry',
    message: 'Bottom-sheet snap positions and heights belong to shared/ui/DrawerShell; consume the shell instead of declaring snap geometry.',
    pattern: /\bSHEET_(?:SNAP_FRACTIONS|HALF_HEIGHT_FRACTION|FULL_TOP_INSET_PX|PEEK_HEIGHT_PX|PEEK_WITH_HEADER_HEIGHT_PX)\b|\bresolveSheetSnapHeights\b|\bnearestSheetSnap\b|\bresolveBrowseSheetNavigationOpacity\b|\[data-drawer-snap/,
    include: file => /\.(?:css|tsx?)$/.test(file) && !file.startsWith('apps/web/src/shared/ui/DrawerShell/'),
  },
  {
    id: 'panel-layout-owns-standard-scrolling',
    message: 'Standard panel scrolling belongs to shared/ui/PanelLayout, not DrawerShell or browse/session content.',
    pattern: /data-panel-scroll-owner|overflowY|overflowX|overflow-y:\s*auto|overflow-x:\s*(?:auto|hidden|scroll)|overscroll-behavior/,
    include: file => (
      file === 'apps/web/src/shared/ui/DrawerShell/DrawerShell.tsx'
      || file === 'apps/web/src/shared/ui/DrawerShell/DrawerShell.module.css'
      || file === 'apps/web/src/widgets/SidePanel/SessionFeed.tsx'
      || file === 'apps/web/src/widgets/SidePanel/SessionFeed.module.css'
      || file === 'apps/web/src/shared/ui/PanelGalleryLayout.tsx'
      || file === 'apps/web/src/shared/ui/PanelGalleryLayout.module.css'
    ),
  },
  {
    id: 'panel-sticky-chrome-has-one-mount',
    message: 'Only PanelLayout may render the panel\'s sticky chrome row; publish content through PanelLayoutStickyChrome.',
    pattern: /<PanelScrollChrome[\s/>]|data-panel-scroll-chrome/,
    include: file => (
      (isRuntimeTypeScript(file) || file.endsWith('.module.css'))
      && file !== 'apps/web/src/shared/ui/PanelLayout/PanelLayout.tsx'
      && file !== 'apps/web/src/shared/ui/PanelLayout/PanelLayout.module.css'
    ),
  },
  {
    id: 'panel-layout-owns-footer-placement',
    message: 'Project panel actions into PanelLayout footer slots instead of owning local sticky/absolute placement or clearance.',
    pattern: /\bgalleryInsetWithFooter\b|\bdata-panel-gallery-footer\b|padding-bottom:\s*92px|position:\s*(?:absolute|sticky)/,
    include: file => (
      file === 'apps/web/src/shared/ui/PanelGalleryLayout.tsx'
      || file === 'apps/web/src/shared/ui/PanelGalleryLayout.module.css'
      || file === 'apps/web/src/features/Upload/ui/UploadSidebar.tsx'
      || file === 'apps/web/src/features/Upload/ui/UploadSidebar.module.css'
    ),
  },
  {
    id: 'no-local-overlay-props',
    message: 'Overlay material belongs in apps/web/src/app/lib/theme.ts, not local overlayProps/backgroundOpacity props.',
    pattern: /\boverlayProps\b|\bbackgroundOpacity\b/,
    include: isOverlayConsumer,
  },
  {
    id: 'no-local-mantine-material-styles',
    message: 'Mantine glass material belongs in the theme/design-system adapter, not local styles props.',
    pattern: /\bstyles=\{\{/,
    include: isOverlayConsumer,
  },
  {
    id: 'no-local-glass-rgba',
    message: 'Raw glass RGBA values belong in design-system tokens.',
    pattern: /rgba\(\s*(?:255\s*,\s*255\s*,\s*255|13\s*,\s*22\s*,\s*42|0\s*,\s*0\s*,\s*0)\s*,/,
    include: file => isCodeOrCss(file) && isMigratedMaterialSurface(file),
    exclude: isDesignSystemOwner,
  },
  {
    id: 'no-local-glass-blur',
    message: 'Glass blur values belong in design-system tokens or the Mantine theme adapter.',
    pattern: /blur\(12px\)|saturate\(140%\)/,
    include: file => isCodeOrCss(file) && isMigratedMaterialSurface(file),
    exclude: isDesignSystemOwner,
  },
  {
    id: 'no-local-panel-inset',
    message: 'Panel outer spacing must use --wa-panel-content-inset.',
    pattern: /padding:[^;]*\b12px\b/,
    include: file => panelInsetConsumers.has(file),
  },
  {
    id: 'no-local-panel-grid-gap',
    message: 'Panel collections must use --wa-panel-grid-gap.',
    pattern: /gap:\s*(?:10px|12px)/,
    include: file => panelGridGapConsumers.has(file),
  },
  {
    id: 'no-local-panel-grid-spacing-prop',
    message: 'Panel loading grids must use --wa-panel-grid-gap.',
    pattern: /\bspacing=(?:\{10\}|"xs")/,
    include: file => panelGridSpacingPropConsumers.has(file),
  },
  {
    id: 'ordinary-panel-collection-grid-has-one-owner',
    message: 'Ordinary panel collection columns belong to shared/ui/PanelCollectionGrid.',
    pattern: /grid-template-columns/,
    include: file => ordinaryPanelCollectionCssConsumers.has(file),
  },
  {
    id: 'panel-collection-columns-have-one-owner',
    message: 'Only shared/ui/PanelCollectionGrid/PanelCollectionGrid.tsx may set gridTemplateColumns; every panel collection grid derives its column count from that component.',
    pattern: /gridTemplateColumns/,
    include: file => file.endsWith('.tsx'),
    exclude: file => file === 'apps/web/src/shared/ui/PanelCollectionGrid/PanelCollectionGrid.tsx',
  },
  {
    id: 'panel-local-responsiveness-uses-container-queries',
    message: 'Panel-local responsive styling must use the PanelLayout container instead of viewport media queries.',
    pattern: /@media\s*\([^)]*(?:min|max)-width/,
    include: file => panelLocalResponsiveCssConsumers.has(file),
  },
  {
    id: 'session-feed-layout-is-container-owned',
    message: 'SessionFeed density belongs to PanelCollectionGrid, not a binary expanded prop.',
    pattern: /\bexpanded\b/,
    include: file => sessionFeedLayoutConsumers.has(file),
  },
  {
    id: 'panel-loading-collections-use-shared-grid',
    message: 'Panel loading collections must use shared/ui/PanelCollectionGrid.',
    pattern: /\bSimpleGrid\b/,
    include: file => panelLoadingCollectionConsumers.has(file),
  },
  {
    id: 'responsive-safe-areas-have-one-owner',
    message: 'Safe-area environment values belong in design-system tokens.',
    pattern: /safe-area-inset-(?:top|right|bottom|left)/,
    include: file => file.endsWith('.css'),
    exclude: isDesignSystemOwner,
  },
  {
    id: 'no-local-shell-edge-clearance',
    message: 'Shell-external chrome must use --wa-shell-edge-clearance.',
    pattern: /\b(?:top|left):\s*12px/,
    include: file => file === 'apps/web/src/widgets/AppNavigation/AppNavigation.module.css',
  },
  {
    id: 'no-local-panel-chrome-layer',
    message: 'Panel sticky chrome must use --wa-z-panel-chrome.',
    pattern: /z-index:\s*10/,
    include: file => (
      file === 'apps/web/src/shared/ui/BaseGallery/BaseGallery.module.css'
      || file === 'apps/web/src/shared/ui/PanelScrollChrome.module.css'
      || file === 'apps/web/src/shared/ui/VirtualGallery/VirtualGallery.module.css'
    ),
  },
  {
    id: 'no-local-panel-chrome-motion',
    message: 'Panel sticky chrome must use the semantic chrome motion tokens.',
    pattern: /transition:\s*transform\s+220ms\s+ease/,
    include: file => (
      file === 'apps/web/src/shared/ui/BaseGallery/BaseGallery.module.css'
      || file === 'apps/web/src/shared/ui/PanelScrollChrome.module.css'
      || file === 'apps/web/src/shared/ui/VirtualGallery/VirtualGallery.module.css'
    ),
  },
  {
    id: 'no-local-responsive-control-dimensions',
    message: 'Responsive shell and panel controls must use semantic control-dimension tokens.',
    pattern: /(?:width|height):\s*(?:32px|36px|44px|2\.25rem)|--upload-control-height:\s*36px/,
    include: file => (
      file === 'apps/web/src/widgets/AppNavigation/AppNavigation.module.css'
      || file === 'apps/web/src/widgets/BrowseSectionBar/BrowseSectionBar.module.css'
      || file === 'apps/web/src/widgets/SidePanel/SidePanel.module.css'
      || file === 'apps/web/src/shared/ui/PanelRouteLayout.module.css'
      || file === 'apps/web/src/features/Upload/ui/UploadSidebar.module.css'
      || file === 'apps/web/src/widgets/SidePanel/FilterPills.module.css'
      || file === 'apps/web/src/features/Collections/ui/CollectionsToolbar.module.css'
      || file === 'apps/web/src/features/PublicGallery/ui/GalleryDateJumpHeading.module.css'
    ),
  },
  {
    id: 'no-filter-pill-row-centering',
    message: 'The filter-pill row must stay left-aligned, flush with the card grid below it, not centered (user-confirmed 2026-08-07).',
    pattern: /justify-content:\s*(?:safe\s+)?center|margin-inline:\s*auto/,
    include: file => file === 'apps/web/src/widgets/SidePanel/FilterPills.module.css',
  },
  {
    id: 'mobile-gallery-large-text-uses-minimum-heights',
    message: 'Mobile Gallery date chrome must use semantic minimum heights so large text can grow.',
    pattern: /^\s*height:\s*var\(--wa-(?:panel-section-chrome-height|control-size-compact)\)\s*;/m,
    include: file => mobileGalleryLargeTextCssConsumers.has(file),
  },
  {
    id: 'mobile-gallery-preview-metadata-wraps',
    message: 'Mobile Gallery preview metadata must wrap rather than clip at large text.',
    pattern: /wrap=["\']nowrap["\']/,
    include: file => file === 'apps/web/src/features/PublicGallery/ui/MediaLightbox.tsx'
      || file === 'apps/web/src/features/PublicGallery/ui/cards/PublicCard.tsx',
  },
  {
    id: 'no-local-panel-chrome-height',
    message: 'Panel chrome bands must use semantic chrome-height tokens.',
    pattern: /height:\s*32px/,
    include: file => file === 'apps/web/src/shared/ui/VirtualGallery/VirtualGallery.module.css',
  },
  {
    id: 'no-local-panel-header-height',
    message: 'The panel header band must size itself from its content (the back button\'s own --wa-control-size-compact), not a hardcoded height.',
    pattern: /(?:min-)?height:\s*52px|padding:\s*10px\s+8px/,
    include: file => file === 'apps/web/src/widgets/SidePanel/SidePanel.module.css',
  },
  {
    id: 'no-local-responsive-control-motion',
    message: 'Shell controls must use the semantic control motion tokens.',
    pattern: /transition:[^;]*150ms\s+ease/,
    include: file => (
      file === 'apps/web/src/widgets/SidePanel/SidePanel.module.css'
      || file === 'apps/web/src/widgets/SidePanel/ModeSwitcher.module.css'
    ),
  },
  {
    id: 'ledger-owns-money-writes',
    message: 'User.balance mutations and Transaction writes belong in LedgerRepository (single money write path, roadmap S1b).',
    pattern: /balance:\s*(\{\s*(increment|decrement)|-?\d)|\btransaction\.create(Many)?\(/,
    include: isServerNonTestFile,
    exclude: file => file === 'apps/api/src/repositories/LedgerRepository.ts',
  },
  {
    id: 'surf-session-owns-lifecycle-invalidation',
    message: 'Session lifecycle projections must be invalidated through useSessionLifecycleInvalidation.',
    pattern: /\btrpc\.sessions\.(?:list|mine|byId|media)\.(?:pathFilter|queryFilter)\b/,
    include: file => sessionLifecycleInvalidationCallers.has(file),
  },
  {
    id: 'no-duplicated-flash-border',
    message: 'Flash-border motion belongs in apps/web/src/shared/ui/design-system/motion.module.css.',
    pattern: /@keyframes\s+flashBorder|\.flashBorder\b/,
    include: file => file.endsWith('.css'),
    exclude: file => file === 'apps/web/src/shared/ui/design-system/motion.module.css',
  },
  {
    id: 'no-viewport-width-breakpoints',
    message: 'Viewport width queries are forbidden in feature and shared CSS; use container queries or shell/policy-owned presentation.',
    pattern: /@media[^{]*\bwidth\b/,
    include: file => file.endsWith('.css'),
    exclude: isDesignSystemOwner,
  },
  {
    id: 'container-queries-are-compact-first',
    message: 'Container queries must be compact-first: use min-width so wider layouts are additive over the base. A max-width container query authors a wide-first override cascade.',
    pattern: /@container[^{]*max-width/,
    include: file => file.endsWith('.css'),
    exclude: isDesignSystemOwner,
  },
  {
    id: 'safe-area-insets-have-one-owner',
    message: 'Read safe-area insets through the --wa-safe-area-* custom properties in design-system/tokens.css instead of a raw env() call.',
    pattern: /env\(\s*safe-area-inset-/,
    include: file => file.endsWith('.css'),
    exclude: file => file === 'apps/web/src/shared/ui/design-system/tokens.css',
  },
  {
    id: 'no-raw-mantine-radius-literal',
    message: 'Upload/Search/Add Spot controls must resolve their radius from a --wa-radius-* token, not a raw Mantine radius prop or inline style literal.',
    pattern: /\bradius="|\bborderRadius\s*:/,
    include: file => mantineRadiusLiteralConsumers.has(file) || isAddSpotUi(file),
  },
  {
    id: 'add-spot-controls-use-radius-tokens',
    message: 'Add Spot surface and control radii must use the shared --wa-radius-* tokens.',
    pattern: /border-radius:(?!\s*var\(--wa-radius-)[^;]+/,
    include: file => file === 'apps/web/src/features/AddSpot/ui/AddSpotPanel.module.css',
  },
];

const files = sourceRoots.flatMap(listFiles).filter(isCodeOrCss);
const violations = [];

const webAppManifest = JSON.parse(
  readFileSync(path.join(root, 'apps/web/public/site.webmanifest'), 'utf8'),
);
for (const field of ['id', 'start_url', 'scope']) {
  if (webAppManifest[field] === '/') continue;
  violations.push({
    file: 'apps/web/public/site.webmanifest',
    line: 1,
    rule: 'home-screen-manifest-rooted',
    message: `Web app manifest ${field} must be explicitly rooted at "/".`,
  });
}

const designSystemTokens = readFileSync(
  path.join(root, 'apps/web/src/shared/ui/design-system/tokens.css'),
  'utf8',
);
for (const token of requiredResponsiveLayoutTokens) {
  if (designSystemTokens.includes(`${token}:`)) continue;
  violations.push({
    file: 'apps/web/src/shared/ui/design-system/tokens.css',
    line: 1,
    rule: 'required-responsive-layout-token',
    message: `Missing responsive layout token ${token}.`,
  });
}

for (const [requirement, pattern] of requiredFloatingChromeOffsetStyles) {
  if (pattern.test(designSystemTokens)) continue;
  violations.push({
    file: 'apps/web/src/shared/ui/design-system/tokens.css',
    line: 1,
    rule: 'floating-chrome-offset-follows-display-mode',
    message: `Floating chrome is missing ${requirement}.`,
  });
}

for (const [file, requiredToken] of requiredModalRoleTokenByFile) {
  const contents = readFileSync(path.join(root, file), 'utf8');
  if (contents.includes(requiredToken)) continue;
  violations.push({
    file,
    line: 1,
    rule: 'modal-tier-z-index-from-role-token',
    message: `Modal-tier z-index must come from ${requiredToken}, not a portal mount-order default.`,
  });
}

const drawerShellStyles = readFileSync(
  path.join(root, 'apps/web/src/shared/ui/DrawerShell/DrawerShell.module.css'),
  'utf8',
);
for (const [requirement, pattern] of requiredDrawerShellStyles) {
  if (pattern.test(drawerShellStyles)) continue;
  violations.push({
    file: 'apps/web/src/shared/ui/DrawerShell/DrawerShell.module.css',
    line: 1,
    rule: 'drawer-shell-required-styles',
    message: `DrawerShell is missing ${requirement}.`,
  });
}

const drawerShellRuntime = readFileSync(
  path.join(root, 'apps/web/src/shared/ui/DrawerShell/DrawerShell.tsx'),
  'utf8',
);
for (const [requirement, pattern] of requiredDrawerShellRuntime) {
  if (pattern.test(drawerShellRuntime)) continue;
  violations.push({
    file: 'apps/web/src/shared/ui/DrawerShell/DrawerShell.tsx',
    line: 1,
    rule: 'drawer-shell-required-runtime',
    message: `DrawerShell is missing ${requirement}.`,
  });
}

const sidePanelStyles = readFileSync(
  path.join(root, 'apps/web/src/widgets/SidePanel/SidePanel.module.css'),
  'utf8',
);
for (const [requirement, pattern] of requiredSidePanelStyles) {
  if (pattern.test(sidePanelStyles)) continue;
  violations.push({
    file: 'apps/web/src/widgets/SidePanel/SidePanel.module.css',
    line: 1,
    rule: 'side-panel-required-styles',
    message: `SidePanel is missing ${requirement}.`,
  });
}

const compactBrowseNavigationRuntime = readFileSync(
  path.join(root, 'apps/web/src/widgets/AppNavigation/AppNavigation.tsx'),
  'utf8',
);
for (const [requirement, pattern] of requiredCompactBrowseNavigationRuntime) {
  if (pattern.test(compactBrowseNavigationRuntime)) continue;
  violations.push({
    file: 'apps/web/src/widgets/AppNavigation/AppNavigation.tsx',
    line: 1,
    rule: 'compact-browse-navigation-required-runtime',
    message: `Compact browse navigation is missing ${requirement}.`,
  });
}

const compactBrowseNavigationStyles = readFileSync(
  path.join(root, 'apps/web/src/widgets/AppNavigation/AppNavigation.module.css'),
  'utf8',
);
for (const [requirement, pattern] of requiredCompactBrowseNavigationStyles) {
  if (pattern.test(compactBrowseNavigationStyles)) continue;
  violations.push({
    file: 'apps/web/src/widgets/AppNavigation/AppNavigation.module.css',
    line: 1,
    rule: 'compact-browse-navigation-required-styles',
    message: `Compact browse navigation is missing ${requirement}.`,
  });
}

for (const [requirement, pattern] of forbiddenCompactBrowseNavigationStyles) {
  if (!pattern.test(compactBrowseNavigationStyles)) continue;
  violations.push({
    file: 'apps/web/src/widgets/AppNavigation/AppNavigation.module.css',
    line: 1,
    rule: 'compact-browse-navigation-forbidden-styles',
    message: `Compact browse navigation must not use ${requirement}.`,
  });
}

const collectionsToolbarStyles = readFileSync(
  path.join(root, 'apps/web/src/features/Collections/ui/CollectionsToolbar.module.css'),
  'utf8',
);
for (const [requirement, pattern] of requiredCollectionsToolbarStyles) {
  if (pattern.test(collectionsToolbarStyles)) continue;
  violations.push({
    file: 'apps/web/src/features/Collections/ui/CollectionsToolbar.module.css',
    line: 1,
    rule: 'collections-toolbar-required-styles',
    message: `Collections toolbar is missing ${requirement}.`,
  });
}

const uploadSidebarStyles = readFileSync(
  path.join(root, 'apps/web/src/features/Upload/ui/UploadSidebar.module.css'),
  'utf8',
);
for (const [requirement, pattern] of requiredUploadSidebarStyles) {
  if (pattern.test(uploadSidebarStyles)) continue;
  violations.push({
    file: 'apps/web/src/features/Upload/ui/UploadSidebar.module.css',
    line: 1,
    rule: 'upload-sidebar-required-styles',
    message: `Upload sidebar is missing ${requirement}.`,
  });
}

const cartCheckoutFooterStyles = readFileSync(
  path.join(root, 'apps/web/src/features/Cart/ui/CartCheckoutFooter.module.css'),
  'utf8',
);
for (const [requirement, pattern] of requiredCartCheckoutFooterStyles) {
  if (pattern.test(cartCheckoutFooterStyles)) continue;
  violations.push({
    file: 'apps/web/src/features/Cart/ui/CartCheckoutFooter.module.css',
    line: 1,
    rule: 'cart-checkout-footer-required-styles',
    message: `Cart checkout footer is missing ${requirement}.`,
  });
}

const browseSectionBarRuntime = readFileSync(
  path.join(root, 'apps/web/src/widgets/BrowseSectionBar/BrowseSectionBar.tsx'),
  'utf8',
);
for (const [requirement, pattern] of requiredBrowseSectionBarRuntime) {
  if (pattern.test(browseSectionBarRuntime)) continue;
  violations.push({
    file: 'apps/web/src/widgets/BrowseSectionBar/BrowseSectionBar.tsx',
    line: 1,
    rule: 'browse-section-bar-required-runtime',
    message: `Browse section navigation is missing ${requirement}.`,
  });
}

const browseSectionBarStyles = readFileSync(
  path.join(root, 'apps/web/src/widgets/BrowseSectionBar/BrowseSectionBar.module.css'),
  'utf8',
);
for (const [requirement, pattern] of requiredBrowseSectionBarStyles) {
  if (pattern.test(browseSectionBarStyles)) continue;
  violations.push({
    file: 'apps/web/src/widgets/BrowseSectionBar/BrowseSectionBar.module.css',
    line: 1,
    rule: 'browse-section-bar-required-styles',
    message: `Browse section navigation is missing ${requirement}.`,
  });
}

const collectionsSectionBarStyles = readFileSync(
  path.join(root, 'apps/web/src/features/Collections/ui/CollectionsSectionBar.module.css'),
  'utf8',
);
for (const [requirement, pattern] of requiredCollectionsSectionBarStyles) {
  if (pattern.test(collectionsSectionBarStyles)) continue;
  violations.push({
    file: 'apps/web/src/features/Collections/ui/CollectionsSectionBar.module.css',
    line: 1,
    rule: 'collections-section-bar-required-styles',
    message: `Collections section navigation is missing ${requirement}.`,
  });
}

const compactBrowseToolbarStyles = readFileSync(
  path.join(root, 'apps/web/src/shared/ui/PanelRouteLayout.module.css'),
  'utf8',
);
for (const [requirement, pattern] of requiredCompactBrowseToolbarStyles) {
  if (pattern.test(compactBrowseToolbarStyles)) continue;
  violations.push({
    file: 'apps/web/src/shared/ui/PanelRouteLayout.module.css',
    line: 1,
    rule: 'compact-browse-toolbar-required-styles',
    message: `Compact browse toolbar is missing ${requirement}.`,
  });
}

const sessionFeedStyles = readFileSync(
  path.join(root, 'apps/web/src/widgets/SidePanel/SessionFeed.module.css'),
  'utf8',
);
for (const [requirement, pattern] of requiredSessionFeedStyles) {
  if (pattern.test(sessionFeedStyles)) continue;
  violations.push({
    file: 'apps/web/src/widgets/SidePanel/SessionFeed.module.css',
    line: 1,
    rule: 'session-feed-required-styles',
    message: `Session feed is missing ${requirement}.`,
  });
}

const filterPillStylesPath = path.join(root, 'apps/web/src/widgets/SidePanel/FilterPills.module.css');
const filterPillStyles = statSync(filterPillStylesPath, { throwIfNoEntry: false })?.isFile()
  ? readFileSync(filterPillStylesPath, 'utf8')
  : '';
for (const [requirement, pattern] of requiredFilterPillStyles) {
  if (pattern.test(filterPillStyles)) continue;
  violations.push({
    file: 'apps/web/src/widgets/SidePanel/FilterPills.module.css',
    line: 1,
    rule: 'filter-pill-required-styles',
    message: `Filter pills are missing ${requirement}.`,
  });
}

const panelLayoutStyles = readFileSync(
  path.join(root, 'apps/web/src/shared/ui/PanelLayout/PanelLayout.module.css'),
  'utf8',
);
for (const [requirement, pattern] of requiredPanelLayoutStyles) {
  if (pattern.test(panelLayoutStyles)) continue;
  violations.push({
    file: 'apps/web/src/shared/ui/PanelLayout/PanelLayout.module.css',
    line: 1,
    rule: 'panel-layout-required-styles',
    message: `PanelLayout is missing ${requirement}.`,
  });
}

for (const [requirement, pattern] of forbiddenPanelLayoutStyles) {
  if (!pattern.test(panelLayoutStyles)) continue;
  violations.push({
    file: 'apps/web/src/shared/ui/PanelLayout/PanelLayout.module.css',
    line: 1,
    rule: 'panel-layout-forbidden-styles',
    message: `PanelLayout must not use ${requirement}.`,
  });
}

for (const [file, requirement, pattern] of requiredMobileGalleryLargeTextStyles) {
  const contents = readFileSync(path.join(root, file), 'utf8');
  if (pattern.test(contents)) continue;
  violations.push({
    file,
    line: 1,
    rule: 'mobile-gallery-large-text-required-styles',
    message: `Mobile Gallery is missing ${requirement}.`,
  });
}

for (const file of requiredGalleryDateMonthListConsumers) {
  const contents = readFileSync(path.join(root, file), 'utf8');
  if (/GalleryDateMonthList/.test(contents)) continue;
  violations.push({
    file,
    line: 1,
    rule: 'shared-gallery-date-navigation-owner',
    message: 'Gallery date presentations must reuse GalleryDateMonthList so their fold and active states cannot diverge.',
  });
}

const panelCollectionGridStyles = readFileSync(
  path.join(root, 'apps/web/src/shared/ui/PanelCollectionGrid/PanelCollectionGrid.module.css'),
  'utf8',
);
for (const [requirement, pattern] of forbiddenPanelCollectionGridStyles) {
  if (!pattern.test(panelCollectionGridStyles)) continue;
  violations.push({
    file: 'apps/web/src/shared/ui/PanelCollectionGrid/PanelCollectionGrid.module.css',
    line: 1,
    rule: 'panel-collection-grid-forbidden-styles',
    message: `PanelCollectionGrid must not re-column via ${requirement}; the component owns the count.`,
  });
}

for (const [file, tokens] of requiredPanelSpacingTokensByFile) {
  const contents = readFileSync(path.join(root, file), 'utf8');
  for (const token of tokens) {
    if (contents.includes(token)) continue;
    violations.push({
      file,
      line: 1,
      rule: 'required-panel-spacing-token',
      message: `Missing required panel spacing token ${token}.`,
    });
  }
}

for (const [file, tokens] of requiredResponsiveTokensByFile) {
  const contents = readFileSync(path.join(root, file), 'utf8');
  for (const token of tokens) {
    if (contents.includes(token)) continue;
    violations.push({
      file,
      line: 1,
      rule: 'required-responsive-token-consumer',
      message: `Missing required responsive token ${token}.`,
    });
  }
}

for (const file of files) {
  const contents = readFileSync(path.join(root, file), 'utf8');
  const lines = contents.split('\n');

  if (
    routeCodeFilePattern.test(file)
    && !isIgnoredRouteTest(file)
    && !declaresTanStackRoute(contents, file)
  ) {
    violations.push({
      file,
      line: 1,
      rule: 'routes-contain-route-declarations-only',
      message: 'Move route support code outside apps/web/src/app/routes; this directory is scanned by TanStack Router.',
    });
  }

  for (const rule of rules) {
    if (!rule.include(file) || rule.exclude?.(file)) continue;

    lines.forEach((lineText, index) => {
      if (!rule.pattern.test(lineText)) return;
      violations.push({
        file,
        line: index + 1,
        rule: rule.id,
        message: rule.message,
      });
    });
  }
}

if (violations.length > 0) {
  console.error('Style boundary violations found:\n');
  for (const violation of violations) {
    console.error(`${violation.file}:${violation.line} [${violation.rule}] ${violation.message}`);
  }
  process.exit(1);
}

console.log('Style boundary check passed.');
