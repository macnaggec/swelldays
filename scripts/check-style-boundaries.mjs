import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

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
  || file.startsWith('src/widgets/LeftStrip/LeftStrip')
  || file === 'src/widgets/LeftStrip/CartControl.tsx'
  || file.startsWith('src/views/GlobeScene/')
  || file === 'src/widgets/GlobeMap/LocationPicker.module.css'
  || /^src\/app\/routes\/_panel.*\.tsx$/.test(file)
);

const routePanelCssModulePattern = /^src\/app\/routes\/_panel.*\.module\.css$/;

const isServerNonTestFile = (file) => (
  file.startsWith('src/server/')
  && !/\.test\.tsx?$/.test(file)
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
];

const files = listFiles(srcRoot).filter(isCodeOrCss);
const violations = [];

for (const file of files) {
  const contents = readFileSync(path.join(root, file), 'utf8');
  const lines = contents.split('\n');

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
