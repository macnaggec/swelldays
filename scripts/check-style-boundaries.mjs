import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const srcRoot = path.join(root, 'src');

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
  file.startsWith('src/shared/ui/design-system/')
  || file === 'src/app/lib/theme.ts'
);

const isOverlayConsumer = (file) => (
  file.startsWith('src/features/Auth/')
  || file.startsWith('src/features/SpotSearch/')
  || file.startsWith('src/features/Upload/ui/popovers/')
  || file.startsWith('src/shared/ui/BaseLightbox/')
  || file.startsWith('src/shared/ui/CarouselLightbox/')
  || file === 'src/features/Upload/ui/UploadGallery/StepModeModal.tsx'
  || file === 'src/shared/ui/DatePickerPopover/DatePickerPopover.tsx'
);

const isMigratedMaterialSurface = (file) => (
  isOverlayConsumer(file)
  || file.startsWith('src/features/Cart/')
  || file.startsWith('src/features/Purchases/')
  || file.startsWith('src/features/Upload/ui/UploadGallery/')
  || file === 'src/features/Upload/ui/steps/helpers.tsx'
  || file.startsWith('src/shared/ui/BaseGallery/')
  || file.startsWith('src/shared/ui/BaseLightbox/')
  || file.startsWith('src/shared/ui/CarouselLightbox/')
  || file.startsWith('src/shared/ui/PanelGalleryLayout')
  || file.startsWith('src/entities/SurfSession/ui/')
  || file.startsWith('src/widgets/SidePanel/SessionFeed')
  || file.startsWith('src/widgets/SidePanel/SidePanel')
  || file.startsWith('src/widgets/AppNavigation/AppNavigation')
  || file.startsWith('src/widgets/BrowseSectionBar/')
  || file === 'src/widgets/AppNavigation/CartControl.tsx'
  || file.startsWith('src/views/GlobeScene/')
  || file === 'src/widgets/GlobeMap/LocationPicker.module.css'
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
  'src/shared/ui/PanelGalleryLayout.module.css',
  'src/shared/ui/PanelRouteLayout.module.css',
  'src/shared/ui/PanelScrollChrome.module.css',
  'src/shared/ui/VirtualGallery/VirtualGallery.module.css',
  'src/widgets/SidePanel/SessionFeed.module.css',
]);

const panelGridGapConsumers = new Set([
  'src/shared/ui/PanelCollectionGrid/PanelCollectionGrid.module.css',
  'src/shared/ui/VirtualGallery/VirtualGallery.module.css',
]);

const panelGridSpacingPropConsumers = new Set([
  'src/app/routes/_panel.me.collections.index.tsx',
  'src/features/PublicGallery/PublicGallery.tsx',
  'src/shared/ui/PanelContentSkeleton/PanelContentSkeleton.tsx',
]);

const ordinaryPanelCollectionCssConsumers = new Set([
  'src/shared/ui/BaseGallery/BaseGallery.module.css',
  'src/widgets/SidePanel/SessionDetail.module.css',
  'src/widgets/SidePanel/SessionFeed.module.css',
]);

const panelLocalResponsiveCssConsumers = new Set([
  ...ordinaryPanelCollectionCssConsumers,
  'src/features/Collections/ui/CollectionsToolbar.module.css',
]);

const sessionFeedLayoutConsumers = new Set([
  'src/app/routes/_panel.$spotId.index.tsx',
  'src/app/routes/_panel.index.tsx',
  'src/widgets/SidePanel/SessionFeed.tsx',
]);

const panelLoadingCollectionConsumers = new Set([
  'src/app/routes/_panel.me.collections.index.tsx',
  'src/shared/ui/PanelContentSkeleton/PanelContentSkeleton.tsx',
]);

const requiredPanelSpacingTokensByFile = new Map([
  ['src/features/PublicGallery/PublicGallery.tsx', ['--wa-panel-content-inset', '--wa-panel-grid-gap']],
]);

const requiredResponsiveLayoutTokens = [
  '--wa-shell-edge-clearance',
  '--wa-panel-content-inset',
  '--wa-panel-grid-gap',
  '--wa-panel-chrome-height',
  '--wa-panel-section-chrome-height',
  '--wa-control-size-compact',
  '--wa-control-height-default',
  '--wa-control-size-navigation',
  '--wa-control-size-navigation-compact',
  '--wa-control-width-section-navigation',
  '--wa-sheet-grabber-width',
  '--wa-sheet-grabber-height',
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

// Modal-tier z-index must come from a semantic role token, never a portal
// mount-order default: the content surface (lightbox) and the interrupt above
// it (auth) each declare their tier so an interrupt always outranks content.
const requiredModalRoleTokenByFile = new Map([
  ['src/shared/ui/CarouselLightbox/CarouselLightbox.tsx', 'var(--wa-z-modal-content)'],
  ['src/features/Auth/AuthModalProvider.tsx', 'var(--wa-z-modal-interrupt)'],
]);

const requiredResponsiveTokensByFile = new Map([
  ['src/shared/ui/DrawerShell/DrawerShell.module.css', [
    '--wa-safe-area-top',
    '--wa-safe-area-right',
    '--wa-safe-area-bottom',
    '--wa-safe-area-left',
    '--wa-radius-sheet',
    '--wa-sheet-grabber-width',
    '--wa-sheet-grabber-height',
  ]],
  ['src/shared/ui/BaseGallery/BaseGallery.module.css', [
    '--wa-motion-duration-chrome',
    '--wa-motion-easing-standard',
    '--wa-z-panel-chrome',
  ]],
  ['src/shared/ui/PanelCollectionGrid/PanelCollectionGrid.module.css', [
    '--wa-panel-grid-gap',
  ]],
  ['src/shared/ui/VirtualGallery/VirtualGallery.module.css', [
    '--wa-panel-grid-gap',
    '--wa-panel-section-chrome-height',
    '--wa-motion-duration-chrome',
    '--wa-motion-easing-standard',
    '--wa-z-panel-chrome',
  ]],
  ['src/widgets/AppNavigation/AppNavigation.module.css', [
    '--wa-shell-edge-clearance',
    '--wa-control-size-navigation',
    '--wa-control-size-navigation-compact',
    '--wa-safe-area-top',
    '--wa-safe-area-left',
    '--wa-safe-area-right',
  ]],
  ['src/widgets/BrowseSectionBar/BrowseSectionBar.module.css', [
    '--wa-shell-edge-clearance',
    '--wa-control-size-navigation',
    '--wa-control-width-section-navigation',
    '--wa-motion-duration-control',
    '--wa-motion-easing-standard',
    '--wa-safe-area-bottom',
    '--wa-z-floating-chrome',
  ]],
  ['src/widgets/SidePanel/SidePanel.module.css', [
    '--wa-panel-chrome-height',
    '--wa-control-size-compact',
    '--wa-motion-duration-control',
    '--wa-motion-easing-standard',
  ]],
  // Followed the sticky chrome row here when F12n-b collapsed the two chrome
  // paths onto one seam: the layer token was required of
  // PanelScrollChrome.module.css before that file was deleted, and the rule
  // must travel with the declarations, not die with the filename.
  ['src/shared/ui/PanelLayout/PanelLayout.module.css', [
    '--wa-z-panel-chrome',
  ]],
  ['src/shared/ui/PanelRouteLayout.module.css', [
    '--wa-control-height-default',
    '--wa-safe-area-top',
    '--wa-shell-edge-clearance',
    '--wa-z-floating-chrome',
    '--wa-panel-content-inset',
    '--wa-radius-panel',
    '--wa-gallery-tile-comfortable',
  ]],
  ['src/features/Upload/ui/UploadSidebar.module.css', ['--wa-control-height-default']],
]);

const requiredDrawerShellStyles = [
  ['dynamic viewport height', /height:\s*100dvh/],
  ['top safe-area projection', /--wa-safe-area-top/],
  ['right safe-area projection', /--wa-safe-area-right/],
  ['bottom safe-area projection', /--wa-safe-area-bottom/],
  ['left safe-area projection', /--wa-safe-area-left/],
];

const requiredDrawerShellRuntime = [
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
];

const requiredCompactBrowseNavigationRuntime = [
  ['composition-owned browse surface input', /\buseBrowseSurface\b/],
  ['DrawerShell-owned live sheet placement projection', /\buseBrowseSheetNavigationPlacement\b/],
  ['full-sheet interaction removal', /\binert=\{hidden\}/],
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
];

const requiredBrowseSectionBarRuntime = [
  [
    'measured drawer-adjacent placement',
    /\buseDrawerAdjacentInlineEndInset\b/,
  ],
];

const requiredBrowseSectionBarStyles = [
  [
    'centering within the measured map remainder',
    /\.root\[data-drawer-adjacent\]\s*\{[^}]*inset-inline-start:\s*calc\(\(100%\s*-\s*var\(--wa-browse-section-drawer-inset\)\)\s*\/\s*2\)/s,
  ],
];

const requiredCompactBrowseToolbarStyles = [
  [
    'centered bounded bottom-sheet search controls',
    /\[data-drawer-presentation='bottomSheet'\][^{]*\.toolbarMain\s*\{[^}]*max-width:\s*var\(--wa-gallery-tile-comfortable\)[^}]*margin-inline:\s*auto/s,
  ],
  [
    'even compact bottom-sheet toolbar breathing room',
    /\[data-drawer-presentation='bottomSheet'\][^{]*\.toolbar:not\(\[data-expanded\]\)\s*\{[^}]*margin-block:\s*4px/s,
  ],
  [
    'short side-overlay toolbar stacking',
    /\[data-drawer-presentation='sideOverlay'\][^{]*\.toolbar\s*\{[^}]*flex-direction:\s*column[^}]*align-items:\s*stretch/s,
  ],
];

const requiredFilterPillStyles = [
  [
    'single-row horizontal overflow',
    /\.root\[data-horizontal-scroll\]\s*\{[^}]*flex-wrap:\s*nowrap[^}]*overflow-x:\s*auto/s,
  ],
  [
    'centered pills when they fit',
    /\.root\[data-horizontal-scroll\]\s*\{[^}]*justify-content:\s*safe center/s,
  ],
];

const requiredPanelLayoutStyles = [
  ['one vertical scroll owner', /overflow-y:\s*auto/],
  ['scroll overscroll containment', /overscroll-behavior:\s*contain/],
  ['panel container-query context', /container-type:\s*inline-size/],
  // The scroll owner stacks the chrome row and the content as flex items, and
  // the content flexes into what the row leaves. A `min-height: 100%` content
  // box measures the scroller and ignores the row above it, so the panel
  // overflows by the row's height and scrolls when its cards already fit.
  ['chrome-aware scroll stacking', /\.scroller\s*{[^}]*flex-direction:\s*column/s],
  ['content that flexes rather than claiming full height', /\.content\s*{[^}]*flex:\s*1\s+0\s+auto/s],
  [
    'primary and replacement chrome stacked in one constant-geometry grid cell',
    /\.stickyChrome\s+\[data-panel-scroll-chrome-primary\],\s*\n\s*\.stickyChrome\s+\[data-panel-scroll-chrome-replacement\]\s*\{[^}]*grid-area:\s*1\s*\/\s*1/s,
  ],
  [
    'one shared row cross-fading primary and replacement chrome',
    /\.stickyChrome\[data-hidden\]\s+\[data-panel-scroll-chrome-primary\]\s*\{[^}]*opacity:\s*0[\s\S]*\.stickyChrome\[data-hidden\]\s+\[data-panel-scroll-chrome-replacement\]\s*\{[^}]*opacity:\s*1/s,
  ],
  [
    'reduced motion swaps chrome instantly instead of animating',
    /prefers-reduced-motion:\s*reduce\)\s*\{[^{}]*\.stickyChrome\s+\[data-panel-scroll-chrome-primary\][\s\S]*?transition:\s*none/s,
  ],
  [
    'hidden chrome releases empty row height',
    /\.stickyChrome\[data-hidden\]:not\(:has\(\[data-panel-scroll-chrome-replacement\]\)\)\s*\{[^}]*display:\s*none/s,
  ],
  [
    'hideable chrome cannot feed layout shifts back into scroll direction',
    /\.scroller:has\(\.stickyChrome\s+\[data-panel-scroll-chrome-primary\]\)\s*\{[^}]*overflow-anchor:\s*none/s,
  ],
  [
    'peek search row has equal top and bottom clearance around the overlaid grabber',
    /\.root\[data-sheet-snap='peek'\]\s+\.stickyChrome\s*\{[^}]*padding-block:\s*20px/s,
  ],
];

// The component owns the count (F12k); the stylesheet must not re-column.
const forbiddenPanelCollectionGridStyles = [
  ['column ownership', /grid-template-columns/],
  ['panel container-query re-columning', /@container\s+panel/],
  ['drawer-state column override', /\[data-drawer-state/],
];

const isServerNonTestFile = (file) => (
  file.startsWith('src/server/')
  && !/\.test\.tsx?$/.test(file)
);

const isRuntimeTypeScript = (file) => (
  /\.tsx?$/.test(file)
  && !/\.(?:test|spec)\.tsx?$/.test(file)
);

const sessionLifecycleInvalidationCallers = new Set([
  'src/entities/SurfSession/model/usePublishedSession.ts',
  'src/features/Upload/model/usePublishUploadSession.ts',
]);

const rules = [
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
      file === 'src/shared/model/viewportCapabilities.ts'
      || file === 'src/shared/model/viewportMetrics.ts'
    ),
  },
  {
    id: 'app-shell-layout-policy-has-one-owner',
    message: 'Derive shell presentation through shared/model/appShellLayoutPolicy.',
    pattern: /\b(?:deriveAppChromePolicy|derivePanelTargetPolicy|deriveGlobeInteractionPolicy|deriveDesktopFoundationAppShellLayoutPolicy)\b/,
    include: isRuntimeTypeScript,
    exclude: file => file === 'src/shared/model/appShellLayoutPolicy.ts',
  },
  {
    id: 'app-shell-policy-is-reached-through-the-presentation-seam',
    message: 'Derive shell presentation through shared/model/appShellPresentation, which applies the mounted-band gate.',
    pattern: /\bderiveAppShellLayoutPolicy\b/,
    include: isRuntimeTypeScript,
    exclude: file => (
      file === 'src/shared/model/appShellPresentation.tsx'
      || file === 'src/shared/model/appShellLayoutPolicy.ts'
    ),
  },
  {
    id: 'activation-matrix-vocabulary-is-confined-to-the-policy-provider',
    message: 'The activation matrix is temporary scaffolding owned by the policy provider; consumers read the semantic policy through useAppShellLayoutPolicy.',
    pattern: /\b(?:ACTIVE_CELLS|ActivationCell|isCellActive|resolveShellLayoutPolicy)\b/,
    include: isRuntimeTypeScript,
    exclude: file => file === 'src/shared/model/appShellPresentation.tsx',
  },
  {
    id: 'app-shell-policy-provider-is-mounted-at-the-composition-root',
    message: 'Mount the shell policy provider once at the composition root.',
    pattern: /\bAppShellLayoutPolicyProvider\b/,
    include: isRuntimeTypeScript,
    exclude: file => (
      file === 'src/shared/model/appShellPresentation.tsx'
      || file === 'src/app/routes/__root.tsx'
    ),
  },
  {
    id: 'browse-surface-provider-is-mounted-at-the-composition-root',
    message: 'Mount the browse surface provider once at the composition root.',
    pattern: /<BrowseSurfaceProvider[\s>]/,
    include: isRuntimeTypeScript,
    exclude: file => file === 'src/app/routes/__root.tsx',
  },
  {
    id: 'browse-surface-has-bounded-consumers',
    message: 'Only the panel route, map scene, and app navigation may consume the composition-owned browse surface.',
    pattern: /\buseBrowseSurface\b/,
    include: isRuntimeTypeScript,
    exclude: file => (
      file === 'src/shared/ui/DrawerShell/browseSurface.tsx'
      || file === 'src/shared/ui/DrawerShell/index.ts'
      || file === 'src/app/routes/_panel.tsx'
      || file === 'src/widgets/AppNavigation/AppNavigation.tsx'
      || file === 'src/views/GlobeScene/GlobeScene.tsx'
    ),
  },
  {
    id: 'browse-section-bar-is-mounted-by-the-panel-route',
    message: 'Mount compact browse section navigation once from the panel route.',
    pattern: /<BrowseSectionBar[\s>]/,
    include: isRuntimeTypeScript,
    exclude: file => file === 'src/app/routes/_panel.tsx',
  },
  {
    id: 'app-navigation-is-mounted-once-by-the-shell',
    message: 'Navigation is mounted once by AppShell from the shell policy; features and routes must not mount a navigation presentation.',
    pattern: /\bAppNavigation\b/,
    include: isRuntimeTypeScript,
    exclude: file => (
      file === 'src/app/AppShell.tsx'
      || file.startsWith('src/widgets/AppNavigation/')
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
      file === 'src/shared/ui/DrawerShell/DrawerShell.tsx'
      || file === 'src/shared/ui/DrawerShell/geometry.ts'
    ),
  },
  {
    id: 'globe-scene-consumes-drawer-owned-geometry',
    message: 'GlobeScene must consume DrawerShell geometry instead of reconstructing sheet-snap geometry.',
    pattern: /\b(?:useBrowseSheetNavigationPlacement|resolveSheetSnapHeights|SHEET_PEEK_HEIGHT_PX)\b/,
    include: file => file === 'src/views/GlobeScene/GlobeScene.tsx',
  },
  {
    id: 'globe-camera-insets-use-measured-drawer',
    message: 'The map camera must consume four-sided insets derived from measured drawer bounds, not local panel-width or expansion heuristics.',
    pattern: /\b(?:PANEL_WIDTH_VW|isRenderedPanelExpanded)\b/,
    include: file => (
      file === 'src/views/GlobeScene/GlobeScene.tsx'
      || file === 'src/views/GlobeScene/model/mapCameraInsets.ts'
      || file === 'src/widgets/GlobeMap/GlobeMapComponent.tsx'
    ),
  },
  {
    id: 'no-legacy-right-edge-map-occlusion',
    message: 'Map camera occlusion is a four-sided inset projection (M00b); the right-edge-only occlusion vocabulary is retired.',
    pattern: /\b(?:rightOccludedPx|sidebarOccludedPx|deriveDrawerViewportOcclusionPx|drawerViewportOcclusion)\b/,
    include: file => /\.tsx?$/.test(file),
  },
  {
    id: 'drawer-shell-owns-adjacent-control-placement',
    message: 'Place drawer-adjacent controls from DrawerShell measured geometry, not local viewport formulas.',
    pattern: /\bPANEL_WIDTH_VW\b|\b25vw\b|calc\([^)]*\bvw\b/,
    include: file => (
      file === 'src/app/routes/_panel.tsx'
      || file.startsWith('src/shared/ui/PanelRouteLayout')
    ),
  },
  {
    id: 'drawer-shell-owns-surface-runtime',
    message: 'Drawer animation and width application belong in shared/ui/DrawerShell.',
    pattern: /from\s+['"]framer-motion['"]|\bmotion\.|\b(?:PANEL_WIDTH_VW|SIDE_PANEL_TRANSITION)\b/,
    include: file => file === 'src/widgets/SidePanel/SidePanel.tsx',
  },
  {
    id: 'drawer-shell-owns-surface-styles',
    message: 'Drawer positioning and the scroll container belong in shared/ui/DrawerShell.',
    pattern: /position:\s*fixed|overflow-y:\s*auto|overscroll-behavior|safe-area-inset|height:\s*100dvh/,
    include: file => file === 'src/widgets/SidePanel/SidePanel.module.css',
  },
  {
    id: 'drawer-shell-owns-sheet-snap-geometry',
    message: 'Bottom-sheet snap positions and heights belong to shared/ui/DrawerShell; consume the shell instead of declaring snap geometry.',
    pattern: /\bSHEET_(?:SNAP_FRACTIONS|HALF_HEIGHT_FRACTION|FULL_TOP_INSET_PX|PEEK_HEIGHT_PX)\b|\bresolveSheetSnapHeights\b|\bnearestSheetSnap\b|\bresolveBrowseSheetNavigationOpacity\b|\[data-drawer-snap/,
    include: file => /\.(?:css|tsx?)$/.test(file) && !file.startsWith('src/shared/ui/DrawerShell/'),
  },
  {
    id: 'panel-layout-owns-standard-scrolling',
    message: 'Standard panel scrolling belongs to shared/ui/PanelLayout, not DrawerShell or browse/session content.',
    pattern: /data-panel-scroll-owner|overflowY|overflowX|overflow-y:\s*auto|overflow-x:\s*(?:auto|hidden|scroll)|overscroll-behavior/,
    include: file => (
      file === 'src/shared/ui/DrawerShell/DrawerShell.tsx'
      || file === 'src/shared/ui/DrawerShell/DrawerShell.module.css'
      || file === 'src/widgets/SidePanel/SessionFeed.tsx'
      || file === 'src/widgets/SidePanel/SessionFeed.module.css'
      || file === 'src/shared/ui/PanelGalleryLayout.tsx'
      || file === 'src/shared/ui/PanelGalleryLayout.module.css'
    ),
  },
  {
    id: 'panel-sticky-chrome-has-one-mount',
    message: 'Only PanelLayout may render the panel\'s sticky chrome row; publish content through PanelLayoutStickyChrome.',
    pattern: /<PanelScrollChrome[\s/>]|data-panel-scroll-chrome/,
    include: file => (
      (isRuntimeTypeScript(file) || file.endsWith('.module.css'))
      && file !== 'src/shared/ui/PanelLayout/PanelLayout.tsx'
      && file !== 'src/shared/ui/PanelLayout/PanelLayout.module.css'
    ),
  },
  {
    id: 'panel-layout-owns-footer-placement',
    message: 'Project panel actions into PanelLayout footer slots instead of owning local sticky/absolute placement or clearance.',
    pattern: /\bgalleryInsetWithFooter\b|\bdata-panel-gallery-footer\b|padding-bottom:\s*92px|position:\s*(?:absolute|sticky)/,
    include: file => (
      file === 'src/shared/ui/PanelGalleryLayout.tsx'
      || file === 'src/shared/ui/PanelGalleryLayout.module.css'
      || file === 'src/features/Upload/ui/UploadSidebar.tsx'
      || file === 'src/features/Upload/ui/UploadSidebar.module.css'
    ),
  },
  {
    id: 'no-local-overlay-props',
    message: 'Overlay material belongs in src/app/lib/theme.ts, not local overlayProps/backgroundOpacity props.',
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
    exclude: file => file === 'src/shared/ui/PanelCollectionGrid/PanelCollectionGrid.tsx',
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
    include: file => file === 'src/widgets/AppNavigation/AppNavigation.module.css',
  },
  {
    id: 'no-local-panel-chrome-layer',
    message: 'Panel sticky chrome must use --wa-z-panel-chrome.',
    pattern: /z-index:\s*10/,
    include: file => (
      file === 'src/shared/ui/BaseGallery/BaseGallery.module.css'
      || file === 'src/shared/ui/PanelScrollChrome.module.css'
      || file === 'src/shared/ui/VirtualGallery/VirtualGallery.module.css'
    ),
  },
  {
    id: 'no-local-panel-chrome-motion',
    message: 'Panel sticky chrome must use the semantic chrome motion tokens.',
    pattern: /transition:\s*transform\s+220ms\s+ease/,
    include: file => (
      file === 'src/shared/ui/BaseGallery/BaseGallery.module.css'
      || file === 'src/shared/ui/PanelScrollChrome.module.css'
      || file === 'src/shared/ui/VirtualGallery/VirtualGallery.module.css'
    ),
  },
  {
    id: 'no-local-responsive-control-dimensions',
    message: 'Responsive shell and panel controls must use semantic control-dimension tokens.',
    pattern: /(?:width|height):\s*(?:32px|36px|44px|2\.25rem)|--upload-control-height:\s*36px/,
    include: file => (
      file === 'src/widgets/AppNavigation/AppNavigation.module.css'
      || file === 'src/widgets/BrowseSectionBar/BrowseSectionBar.module.css'
      || file === 'src/widgets/SidePanel/SidePanel.module.css'
      || file === 'src/shared/ui/PanelRouteLayout.module.css'
      || file === 'src/features/Upload/ui/UploadSidebar.module.css'
    ),
  },
  {
    id: 'no-local-panel-chrome-height',
    message: 'Panel chrome bands must use semantic chrome-height tokens.',
    pattern: /height:\s*32px/,
    include: file => file === 'src/shared/ui/VirtualGallery/VirtualGallery.module.css',
  },
  {
    id: 'no-local-panel-header-height',
    message: 'The panel header band must use --wa-panel-chrome-height.',
    pattern: /(?:min-)?height:\s*52px|padding:\s*10px\s+8px/,
    include: file => file === 'src/widgets/SidePanel/SidePanel.module.css',
  },
  {
    id: 'no-local-responsive-control-motion',
    message: 'Shell controls must use the semantic control motion tokens.',
    pattern: /transition:[^;]*150ms\s+ease/,
    include: file => (
      file === 'src/widgets/SidePanel/SidePanel.module.css'
      || file === 'src/widgets/SidePanel/ModeSwitcher.module.css'
    ),
  },
  {
    id: 'ledger-owns-money-writes',
    message: 'User.balance mutations and Transaction writes belong in LedgerRepository (single money write path, roadmap S1b).',
    pattern: /balance:\s*(\{\s*(increment|decrement)|-?\d)|\btransaction\.create(Many)?\(/,
    include: isServerNonTestFile,
    exclude: file => file === 'src/server/repositories/LedgerRepository.ts',
  },
  {
    id: 'surf-session-owns-lifecycle-invalidation',
    message: 'Session lifecycle projections must be invalidated through useSessionLifecycleInvalidation.',
    pattern: /\btrpc\.sessions\.(?:list|mine|byId|media)\.(?:pathFilter|queryFilter)\b/,
    include: file => sessionLifecycleInvalidationCallers.has(file),
  },
  {
    id: 'no-duplicated-flash-border',
    message: 'Flash-border motion belongs in src/shared/ui/design-system/motion.module.css.',
    pattern: /@keyframes\s+flashBorder|\.flashBorder\b/,
    include: file => file.endsWith('.css'),
    exclude: file => file === 'src/shared/ui/design-system/motion.module.css',
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
];

const files = listFiles(srcRoot).filter(isCodeOrCss);
const violations = [];

const designSystemTokens = readFileSync(
  path.join(root, 'src/shared/ui/design-system/tokens.css'),
  'utf8',
);
for (const token of requiredResponsiveLayoutTokens) {
  if (designSystemTokens.includes(`${token}:`)) continue;
  violations.push({
    file: 'src/shared/ui/design-system/tokens.css',
    line: 1,
    rule: 'required-responsive-layout-token',
    message: `Missing responsive layout token ${token}.`,
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
  path.join(root, 'src/shared/ui/DrawerShell/DrawerShell.module.css'),
  'utf8',
);
for (const [requirement, pattern] of requiredDrawerShellStyles) {
  if (pattern.test(drawerShellStyles)) continue;
  violations.push({
    file: 'src/shared/ui/DrawerShell/DrawerShell.module.css',
    line: 1,
    rule: 'drawer-shell-required-styles',
    message: `DrawerShell is missing ${requirement}.`,
  });
}

const drawerShellRuntime = readFileSync(
  path.join(root, 'src/shared/ui/DrawerShell/DrawerShell.tsx'),
  'utf8',
);
for (const [requirement, pattern] of requiredDrawerShellRuntime) {
  if (pattern.test(drawerShellRuntime)) continue;
  violations.push({
    file: 'src/shared/ui/DrawerShell/DrawerShell.tsx',
    line: 1,
    rule: 'drawer-shell-required-runtime',
    message: `DrawerShell is missing ${requirement}.`,
  });
}

const compactBrowseNavigationRuntime = readFileSync(
  path.join(root, 'src/widgets/AppNavigation/AppNavigation.tsx'),
  'utf8',
);
for (const [requirement, pattern] of requiredCompactBrowseNavigationRuntime) {
  if (pattern.test(compactBrowseNavigationRuntime)) continue;
  violations.push({
    file: 'src/widgets/AppNavigation/AppNavigation.tsx',
    line: 1,
    rule: 'compact-browse-navigation-required-runtime',
    message: `Compact browse navigation is missing ${requirement}.`,
  });
}

const compactBrowseNavigationStyles = readFileSync(
  path.join(root, 'src/widgets/AppNavigation/AppNavigation.module.css'),
  'utf8',
);
for (const [requirement, pattern] of requiredCompactBrowseNavigationStyles) {
  if (pattern.test(compactBrowseNavigationStyles)) continue;
  violations.push({
    file: 'src/widgets/AppNavigation/AppNavigation.module.css',
    line: 1,
    rule: 'compact-browse-navigation-required-styles',
    message: `Compact browse navigation is missing ${requirement}.`,
  });
}

const browseSectionBarRuntime = readFileSync(
  path.join(root, 'src/widgets/BrowseSectionBar/BrowseSectionBar.tsx'),
  'utf8',
);
for (const [requirement, pattern] of requiredBrowseSectionBarRuntime) {
  if (pattern.test(browseSectionBarRuntime)) continue;
  violations.push({
    file: 'src/widgets/BrowseSectionBar/BrowseSectionBar.tsx',
    line: 1,
    rule: 'browse-section-bar-required-runtime',
    message: `Browse section navigation is missing ${requirement}.`,
  });
}

const browseSectionBarStyles = readFileSync(
  path.join(root, 'src/widgets/BrowseSectionBar/BrowseSectionBar.module.css'),
  'utf8',
);
for (const [requirement, pattern] of requiredBrowseSectionBarStyles) {
  if (pattern.test(browseSectionBarStyles)) continue;
  violations.push({
    file: 'src/widgets/BrowseSectionBar/BrowseSectionBar.module.css',
    line: 1,
    rule: 'browse-section-bar-required-styles',
    message: `Browse section navigation is missing ${requirement}.`,
  });
}

const compactBrowseToolbarStyles = readFileSync(
  path.join(root, 'src/shared/ui/PanelRouteLayout.module.css'),
  'utf8',
);
for (const [requirement, pattern] of requiredCompactBrowseToolbarStyles) {
  if (pattern.test(compactBrowseToolbarStyles)) continue;
  violations.push({
    file: 'src/shared/ui/PanelRouteLayout.module.css',
    line: 1,
    rule: 'compact-browse-toolbar-required-styles',
    message: `Compact browse toolbar is missing ${requirement}.`,
  });
}

const filterPillStylesPath = path.join(root, 'src/widgets/SidePanel/FilterPills.module.css');
const filterPillStyles = statSync(filterPillStylesPath, { throwIfNoEntry: false })?.isFile()
  ? readFileSync(filterPillStylesPath, 'utf8')
  : '';
for (const [requirement, pattern] of requiredFilterPillStyles) {
  if (pattern.test(filterPillStyles)) continue;
  violations.push({
    file: 'src/widgets/SidePanel/FilterPills.module.css',
    line: 1,
    rule: 'filter-pill-required-styles',
    message: `Filter pills are missing ${requirement}.`,
  });
}

const panelLayoutStyles = readFileSync(
  path.join(root, 'src/shared/ui/PanelLayout/PanelLayout.module.css'),
  'utf8',
);
for (const [requirement, pattern] of requiredPanelLayoutStyles) {
  if (pattern.test(panelLayoutStyles)) continue;
  violations.push({
    file: 'src/shared/ui/PanelLayout/PanelLayout.module.css',
    line: 1,
    rule: 'panel-layout-required-styles',
    message: `PanelLayout is missing ${requirement}.`,
  });
}

const panelCollectionGridStyles = readFileSync(
  path.join(root, 'src/shared/ui/PanelCollectionGrid/PanelCollectionGrid.module.css'),
  'utf8',
);
for (const [requirement, pattern] of forbiddenPanelCollectionGridStyles) {
  if (!pattern.test(panelCollectionGridStyles)) continue;
  violations.push({
    file: 'src/shared/ui/PanelCollectionGrid/PanelCollectionGrid.module.css',
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
      message: 'Move route support code outside src/app/routes; this directory is scanned by TanStack Router.',
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
