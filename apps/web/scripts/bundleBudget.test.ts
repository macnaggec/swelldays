import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import {
  analyzeWebBundle,
  createBundleModuleInventoryPlugin,
  formatWebBundleReport,
  type BundleModuleInventory,
  type ViteManifest,
  type WebBundleBudgetConfig,
} from './bundleBudget';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

const gzipBytes = (contents: string): number => gzipSync(Buffer.from(contents)).byteLength;

const startupAssetFiles = {
  logo: 'assets/swelldays-logo-white-logo1234.png',
  portrait: 'assets/first-visit-waves-portrait-portrait123.webp',
  landscape: 'assets/first-visit-waves-landscape-landscape12.webp',
};

const startupAssetSources = {
  logo: 'src/assets/startup/swelldays-logo-white.png',
  portrait: 'src/assets/startup/first-visit-waves-portrait.webp',
  landscape: 'src/assets/startup/first-visit-waves-landscape.webp',
};

const startupAssetContents = {
  logo: 'approved-logo-bytes',
  portrait: 'approved-portrait-bytes',
  landscape: 'approved-landscape-bytes',
};

const writeJson = async (path: string, value: unknown): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
};

interface Fixture {
  directory: string;
  distDirectory: string;
  configPath: string;
  config: WebBundleBudgetConfig;
  manifest: ViteManifest;
  files: Record<string, string>;
  keys: {
    shared: string;
    optional: string;
  };
}

const createFixture = async (hash: string): Promise<Fixture> => {
  const directory = await mkdtemp(join(tmpdir(), 'swelldays-bundle-budget-'));
  temporaryDirectories.push(directory);

  const distDirectory = join(directory, 'dist');
  const configPath = join(directory, 'bundle-budgets.json');
  const shared = `_shared-${hash}.js`;
  const cycle = `_cycle-${hash}.js`;
  const panelShared = `_panel-shared-${hash}.js`;
  const feedExtra = `_feed-extra-${hash}.js`;
  const optional = `_optional-${hash}.js`;
  const files: Record<string, string> = {
    'assets/index-HASH.js': `entry();\nentry();\nconst logo = "/${startupAssetFiles.logo}";\n`,
    'assets/index-HASH.css': [
      '.entry{color:navy}',
      `.portrait{background-image:url('/${startupAssetFiles.portrait}')}`,
      `.landscape{background-image:url('/${startupAssetFiles.landscape}')}`,
      '',
    ].join('\n'),
    'assets/shared-HASH.js': 'shared();\nshared();\n',
    'assets/shared-HASH.css': '.shared{display:block}\n',
    'assets/cycle-HASH.js': 'cycle();\ncycle();\n',
    'assets/panel-HASH.js': 'panel();\n',
    'assets/panel-HASH.css': '.panel{overflow:auto}\n',
    'assets/panel-shared-HASH.js': 'panelShared();\n',
    'assets/feed-HASH.js': 'feed();\n',
    'assets/feed-HASH.css': '.feed{contain:layout}\n',
    'assets/feed-extra-HASH.js': 'feedExtra();\n',
    'assets/optional-HASH.js': 'mapboxOptional();\nmapboxOptional();\n',
    'assets/optional-HASH.css': '.map{position:fixed}\n',
    'assets/index-MISLEADING.js': 'notTheEntry();\n',
    [startupAssetFiles.logo]: startupAssetContents.logo,
    [startupAssetFiles.portrait]: startupAssetContents.portrait,
    [startupAssetFiles.landscape]: startupAssetContents.landscape,
    'index.html': [
      `<link rel="preload" href="/${startupAssetFiles.landscape}">`,
      `<link rel="preload" href="/${startupAssetFiles.portrait}">`,
      `<link rel="preload" href="/${startupAssetFiles.logo}">`,
      `<div id="root"><div data-bootstrap-shell><img src="/${startupAssetFiles.logo}"></div></div>`,
      '<script type="module" src="/assets/index-entry1234.js"></script>',
      '',
    ].join('\n'),
  };

  const hashedFiles = Object.fromEntries(
    Object.entries(files).map(([path, contents]) => [path.replaceAll('HASH', hash), contents]),
  );

  const manifest: ViteManifest = {
    'index.html': {
      file: `assets/index-${hash}.js`,
      src: 'index.html',
      isEntry: true,
      imports: [shared],
      dynamicImports: [optional],
      css: [`assets/index-${hash}.css`],
    },
    [shared]: {
      file: `assets/shared-${hash}.js`,
      imports: [cycle],
      css: [`assets/shared-${hash}.css`],
    },
    [cycle]: {
      file: `assets/cycle-${hash}.js`,
      imports: [shared],
      css: [`assets/shared-${hash}.css`],
    },
    'src/app/routes/_panel.tsx?tsr-split=component': {
      file: `assets/panel-${hash}.js`,
      src: 'src/app/routes/_panel.tsx?tsr-split=component',
      isDynamicEntry: true,
      imports: ['index.html', panelShared],
      css: [`assets/panel-${hash}.css`],
    },
    [panelShared]: {
      file: `assets/panel-shared-${hash}.js`,
      imports: [shared],
    },
    'src/app/routes/_panel.index.tsx?tsr-split=component': {
      file: `assets/feed-${hash}.js`,
      src: 'src/app/routes/_panel.index.tsx?tsr-split=component',
      isDynamicEntry: true,
      imports: ['index.html', feedExtra],
      css: [`assets/feed-${hash}.css`],
    },
    [feedExtra]: {
      file: `assets/feed-extra-${hash}.js`,
      imports: [shared],
    },
    [optional]: {
      file: `assets/optional-${hash}.js`,
      isDynamicEntry: true,
      imports: ['index.html'],
      css: [`assets/optional-${hash}.css`],
    },
    'src/app/routes/not-really-entry.tsx': {
      file: 'assets/index-MISLEADING.js',
      src: 'src/app/routes/not-really-entry.tsx',
      isDynamicEntry: true,
    },
    [startupAssetSources.logo]: {
      file: startupAssetFiles.logo,
      src: startupAssetSources.logo,
    },
    [startupAssetSources.portrait]: {
      file: startupAssetFiles.portrait,
      src: startupAssetSources.portrait,
    },
    [startupAssetSources.landscape]: {
      file: startupAssetFiles.landscape,
      src: startupAssetSources.landscape,
    },
  };

  const inventory: BundleModuleInventory = {
    version: 1,
    chunks: [
      {
        file: `assets/index-${hash}.js`,
        facadeModuleId: 'index.html',
        isEntry: true,
        isDynamicEntry: false,
        imports: [`assets/shared-${hash}.js`],
        dynamicImports: [`assets/optional-${hash}.js`],
        modules: [
          'src/main.tsx',
          'src/startup/forbidden.ts',
          'src/features/AddSpot/ui/AddSpotPanel.tsx',
          'src/features/AddSpot/model/useAddSpotFlow.ts',
          'src/features/AddSpot/model/useReverseGeocode.ts',
          'src/features/AddSpot/model/addSpotCoordinates.ts',
          'packages/contracts/src/validation/spotSchemas.ts',
          'node_modules/zod/v4/core/index.js',
        ],
      },
      {
        file: `assets/shared-${hash}.js`,
        facadeModuleId: null,
        isEntry: false,
        isDynamicEntry: false,
        imports: [`assets/cycle-${hash}.js`],
        dynamicImports: [],
        modules: ['src/shared/eager.ts'],
      },
      {
        file: `assets/cycle-${hash}.js`,
        facadeModuleId: null,
        isEntry: false,
        isDynamicEntry: false,
        imports: [`assets/shared-${hash}.js`],
        dynamicImports: [],
        modules: ['src/shared/cycle.ts'],
      },
      {
        file: `assets/panel-${hash}.js`,
        facadeModuleId: 'src/app/routes/_panel.tsx?tsr-split=component',
        isEntry: false,
        isDynamicEntry: true,
        imports: [`assets/index-${hash}.js`, `assets/panel-shared-${hash}.js`],
        dynamicImports: [],
        modules: ['src/app/routes/_panel.tsx', 'src/panel/forbidden.ts'],
      },
      {
        file: `assets/panel-shared-${hash}.js`,
        facadeModuleId: null,
        isEntry: false,
        isDynamicEntry: false,
        imports: [`assets/shared-${hash}.js`],
        dynamicImports: [],
        modules: ['src/panel/shared.ts'],
      },
      {
        file: `assets/feed-${hash}.js`,
        facadeModuleId: 'src/app/routes/_panel.index.tsx?tsr-split=component',
        isEntry: false,
        isDynamicEntry: true,
        imports: [`assets/index-${hash}.js`, `assets/feed-extra-${hash}.js`],
        dynamicImports: [],
        modules: ['src/app/routes/_panel.index.tsx'],
      },
      {
        file: `assets/feed-extra-${hash}.js`,
        facadeModuleId: null,
        isEntry: false,
        isDynamicEntry: false,
        imports: [`assets/shared-${hash}.js`],
        dynamicImports: [],
        modules: ['src/feed/feed-only.ts'],
      },
      {
        file: `assets/optional-${hash}.js`,
        facadeModuleId: 'src/widgets/Map.tsx',
        isEntry: false,
        isDynamicEntry: true,
        imports: [`assets/index-${hash}.js`],
        dynamicImports: [],
        modules: [
          'node_modules/mapbox-gl/src/index.ts',
          'src/optional/forbidden.ts',
          'src/features/AddSpot/ui/steps/ProximityStep.tsx',
        ],
      },
      {
        file: 'assets/index-MISLEADING.js',
        facadeModuleId: 'src/app/routes/not-really-entry.tsx',
        isEntry: false,
        isDynamicEntry: true,
        imports: [],
        dynamicImports: [],
        modules: ['src/app/routes/not-really-entry.tsx'],
      },
    ],
  };

  const config: WebBundleBudgetConfig = {
    version: 1,
    baselineDate: '2026-08-28',
    headroomPercent: 2,
    entrySource: 'index.html',
    entryJavaScript: {
      baselineGzipBytes: 1,
      maximumGzipBytes: 1_000_000,
    },
    entryCss: {
      baselineGzipBytes: 1,
      maximumGzipBytes: 1_000_000,
    },
    criticalGraphs: [
      {
        id: 'browse-feed',
        label: 'Default Browse Feed critical graph',
        roots: [
          'index.html',
          'src/app/routes/_panel.tsx?tsr-split=component',
          'src/app/routes/_panel.index.tsx?tsr-split=component',
        ],
        budget: {
          baselineGzipBytes: 1,
          maximumGzipBytes: 1_000_000,
        },
      },
    ],
    reportedModuleGroups: [
      {
        id: 'mapbox',
        label: 'Mapbox GL optional chunks',
        moduleSubstrings: ['node_modules/mapbox-gl/'],
      },
    ],
    moduleAbsenceAssertions: [],
    startupAssets: [
      {
        id: 'bootstrap-logo',
        label: 'Bootstrap and first-visit logo',
        source: startupAssetSources.logo,
        minimumReferences: { html: 2, entryJavaScript: 1, entryCss: 0 },
      },
      {
        id: 'first-visit-portrait',
        label: 'First-visit portrait artwork',
        source: startupAssetSources.portrait,
        minimumReferences: { html: 1, entryJavaScript: 0, entryCss: 1 },
      },
      {
        id: 'first-visit-landscape',
        label: 'First-visit landscape artwork',
        source: startupAssetSources.landscape,
        minimumReferences: { html: 1, entryJavaScript: 0, entryCss: 1 },
      },
    ],
  };

  await Promise.all(Object.entries(hashedFiles).map(async ([path, contents]) => {
    const outputPath = join(distDirectory, path);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, contents);
  }));
  await Promise.all([
    [startupAssetSources.logo, startupAssetContents.logo],
    [startupAssetSources.portrait, startupAssetContents.portrait],
    [startupAssetSources.landscape, startupAssetContents.landscape],
  ].map(async ([path, contents]) => {
    if (path === undefined || contents === undefined) throw new Error('Invalid startup fixture');
    const sourcePath = join(directory, path);
    await mkdir(dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, contents);
  }));
  await writeJson(join(distDirectory, '.vite/manifest.json'), manifest);
  await writeJson(join(distDirectory, '.vite/bundle-modules.json'), inventory);
  await writeJson(configPath, config);

  return {
    directory,
    distDirectory,
    configPath,
    config,
    manifest,
    files: hashedFiles,
    keys: { shared, optional },
  };
};

const analyzeFixture = (fixture: Fixture) => analyzeWebBundle({
  distDirectory: fixture.distDirectory,
  configPath: fixture.configPath,
});

const fixtureFile = (fixture: Fixture, path: string): string => {
  const contents = fixture.files[path];
  if (contents === undefined) throw new Error(`Fixture file "${path}" is missing`);
  return contents;
};

describe('analyzeWebBundle', () => {
  it('measures a deduplicated cyclic static graph and passes below its budgets', async () => {
    const fixture = await createFixture('alpha');

    const report = await analyzeFixture(fixture);

    const entryJavaScript = [
      fixtureFile(fixture, 'assets/index-alpha.js'),
      fixtureFile(fixture, 'assets/shared-alpha.js'),
      fixtureFile(fixture, 'assets/cycle-alpha.js'),
    ];
    const entryCss = [
      fixtureFile(fixture, 'assets/index-alpha.css'),
      fixtureFile(fixture, 'assets/shared-alpha.css'),
    ];
    expect(report.entryJavaScript).toMatchObject({
      fileCount: 3,
      rawBytes: entryJavaScript.reduce((total, contents) => total + Buffer.byteLength(contents), 0),
      gzipBytes: entryJavaScript.reduce((total, contents) => total + gzipBytes(contents), 0),
    });
    expect(report.entryCss).toMatchObject({
      fileCount: 2,
      rawBytes: entryCss.reduce((total, contents) => total + Buffer.byteLength(contents), 0),
      gzipBytes: entryCss.reduce((total, contents) => total + gzipBytes(contents), 0),
    });
    expect(report.criticalGraphs[0]?.fileCount).toBe(11);
    expect(report.budgetFailures).toEqual([]);
    expect(report.moduleAssertionFailures).toEqual([]);
  });

  it('reports a one-byte budget overage with the exact failure line', async () => {
    const fixture = await createFixture('over');
    const initialReport = await analyzeFixture(fixture);
    const actual = initialReport.entryJavaScript.gzipBytes;
    fixture.config.entryJavaScript.maximumGzipBytes = actual - 1;
    await writeJson(fixture.configPath, fixture.config);

    const report = await analyzeFixture(fixture);

    expect(report.budgetFailures).toEqual([
      {
        label: 'Entry JavaScript',
        actualGzipBytes: actual,
        maximumGzipBytes: actual - 1,
        deltaGzipBytes: 1,
      },
    ]);
    expect(formatWebBundleReport(report)).toContain(
      `FAIL Entry JavaScript: actual gzip bytes ${actual}, budget ${actual - 1}, delta +1 byte`,
    );
  });

  it('reports a dynamic module group without charging it until the edge becomes static', async () => {
    const fixture = await createFixture('optional');

    const dynamicReport = await analyzeFixture(fixture);

    const optionalGzipBytes = gzipBytes(fixtureFile(fixture, 'assets/optional-optional.js'))
      + gzipBytes(fixtureFile(fixture, 'assets/optional-optional.css'));
    expect(dynamicReport.reportedModuleGroups).toEqual([
      expect.objectContaining({ fileCount: 2, gzipBytes: optionalGzipBytes }),
    ]);
    expect(dynamicReport.entryJavaScript.fileCount).toBe(3);
    expect(dynamicReport.entryCss.fileCount).toBe(2);
    const dynamicCriticalGzipBytes = dynamicReport.criticalGraphs[0]?.gzipBytes;
    expect(dynamicCriticalGzipBytes).toBeDefined();
    if (dynamicCriticalGzipBytes === undefined) return;

    const entry = fixture.manifest['index.html'];
    expect(entry).toBeDefined();
    if (!entry) return;
    entry.imports = [...(entry.imports ?? []), fixture.keys.optional];
    entry.dynamicImports = [];
    await writeJson(join(fixture.distDirectory, '.vite/manifest.json'), fixture.manifest);

    const staticReport = await analyzeFixture(fixture);

    expect(staticReport.entryJavaScript.gzipBytes).toBe(
      dynamicReport.entryJavaScript.gzipBytes
        + gzipBytes(fixtureFile(fixture, 'assets/optional-optional.js')),
    );
    expect(staticReport.entryCss.gzipBytes).toBe(
      dynamicReport.entryCss.gzipBytes
        + gzipBytes(fixtureFile(fixture, 'assets/optional-optional.css')),
    );
    expect(staticReport.criticalGraphs[0]?.gzipBytes).toBe(
      dynamicCriticalGzipBytes
        + gzipBytes(fixtureFile(fixture, 'assets/optional-optional.js'))
        + gzipBytes(fixtureFile(fixture, 'assets/optional-optional.css')),
    );
  });

  it('selects the sole configured entry instead of a misleading hashed filename', async () => {
    const fixture = await createFixture('source');

    const report = await analyzeFixture(fixture);

    expect(report.entryJavaScript.rawBytes).not.toBe(
      Buffer.byteLength(fixtureFile(fixture, 'assets/index-MISLEADING.js')),
    );
  });

  it('keeps reports identical when only content hashes change', async () => {
    const first = await createFixture('first');
    const second = await createFixture('second');
    first.config.entryJavaScript.maximumGzipBytes = 1;
    second.config.entryJavaScript.maximumGzipBytes = 1;
    await Promise.all([
      writeJson(first.configPath, first.config),
      writeJson(second.configPath, second.config),
    ]);

    const [firstReport, secondReport] = await Promise.all([
      analyzeFixture(first),
      analyzeFixture(second),
    ]);

    expect(secondReport).toEqual(firstReport);
    expect(formatWebBundleReport(secondReport)).toBe(formatWebBundleReport(firstReport));
  });

  it('flags forbidden modules in entry and named static graphs but ignores dynamic-only chunks', async () => {
    const fixture = await createFixture('assertions');
    fixture.config.moduleAbsenceAssertions = [
      {
        label: 'Startup excludes forbidden code',
        graph: 'entry',
        forbiddenModuleSubstrings: ['src/startup/forbidden.ts', 'src/optional/forbidden.ts'],
      },
      {
        label: 'Browse Feed excludes forbidden code',
        graph: 'browse-feed',
        forbiddenModuleSubstrings: ['src/panel/forbidden.ts', 'src/feed/feed-only.ts'],
      },
    ];
    await writeJson(fixture.configPath, fixture.config);

    const report = await analyzeFixture(fixture);

    expect(report.moduleAssertionFailures).toEqual([
      {
        label: 'Browse Feed excludes forbidden code',
        graph: 'browse-feed',
        matchingModules: ['src/feed/feed-only.ts', 'src/panel/forbidden.ts'],
      },
      {
        label: 'Startup excludes forbidden code',
        graph: 'entry',
        matchingModules: ['src/startup/forbidden.ts'],
      },
    ]);
  });

  it('reports eager Add Spot workspace modules but ignores a dynamic-only step', async () => {
    const fixture = await createFixture('add-spot-assertions');
    fixture.config.moduleAbsenceAssertions = [
      {
        label: 'Startup excludes Add Spot workspace UI and validation',
        graph: 'entry',
        forbiddenModuleSubstrings: [
          'src/features/AddSpot/ui/',
          'src/features/AddSpot/model/useAddSpotFlow.ts',
          'src/features/AddSpot/model/useReverseGeocode.ts',
          'src/features/AddSpot/model/addSpotCoordinates.ts',
          'packages/contracts/src/validation/spotSchemas.ts',
          'node_modules/zod/',
        ],
      },
      {
        label: 'Default Browse Feed excludes Add Spot workspace UI and validation',
        graph: 'browse-feed',
        forbiddenModuleSubstrings: [
          'src/features/AddSpot/ui/',
          'src/features/AddSpot/model/useAddSpotFlow.ts',
          'src/features/AddSpot/model/useReverseGeocode.ts',
          'src/features/AddSpot/model/addSpotCoordinates.ts',
          'packages/contracts/src/validation/spotSchemas.ts',
        ],
      },
    ];
    await writeJson(fixture.configPath, fixture.config);

    const report = await analyzeFixture(fixture);

    expect(report.moduleAssertionFailures).toEqual([
      {
        label: 'Default Browse Feed excludes Add Spot workspace UI and validation',
        graph: 'browse-feed',
        matchingModules: [
          'packages/contracts/src/validation/spotSchemas.ts',
          'src/features/AddSpot/model/addSpotCoordinates.ts',
          'src/features/AddSpot/model/useAddSpotFlow.ts',
          'src/features/AddSpot/model/useReverseGeocode.ts',
          'src/features/AddSpot/ui/AddSpotPanel.tsx',
        ],
      },
      {
        label: 'Startup excludes Add Spot workspace UI and validation',
        graph: 'entry',
        matchingModules: [
          'node_modules/zod/v4/core/index.js',
          'packages/contracts/src/validation/spotSchemas.ts',
          'src/features/AddSpot/model/addSpotCoordinates.ts',
          'src/features/AddSpot/model/useAddSpotFlow.ts',
          'src/features/AddSpot/model/useReverseGeocode.ts',
          'src/features/AddSpot/ui/AddSpotPanel.tsx',
        ],
      },
    ]);
    expect(report.moduleAssertionFailures).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        matchingModules: expect.arrayContaining([
          'src/features/AddSpot/ui/steps/ProximityStep.tsx',
        ]),
      }),
    ]));
  });

  it('sums raw file lengths and per-file gzip sizes after deduplication', async () => {
    const fixture = await createFixture('arithmetic');

    const report = await analyzeFixture(fixture);

    const contents = [
      fixtureFile(fixture, 'assets/index-arithmetic.js'),
      fixtureFile(fixture, 'assets/shared-arithmetic.js'),
      fixtureFile(fixture, 'assets/cycle-arithmetic.js'),
    ];
    const perFileGzip = contents.reduce((total, value) => total + gzipBytes(value), 0);
    const concatenatedGzip = gzipSync(Buffer.from(contents.join(''))).byteLength;
    expect(report.entryJavaScript.rawBytes).toBe(
      contents.reduce((total, value) => total + Buffer.byteLength(value), 0),
    );
    expect(report.entryJavaScript.gzipBytes).toBe(perFileGzip);
    expect(report.entryJavaScript.gzipBytes).not.toBe(concatenatedGzip);
  });
});

describe('build-output validation', () => {
  it('reports one shared hashed output and its consumer references for each startup asset', async () => {
    const fixture = await createFixture('startup-valid');

    const report = await analyzeFixture(fixture);

    expect(report.startupAssets).toEqual([
      {
        id: 'bootstrap-logo',
        label: 'Bootstrap and first-visit logo',
        source: startupAssetSources.logo,
        file: startupAssetFiles.logo,
        rawBytes: Buffer.byteLength(startupAssetContents.logo),
        references: { html: 2, entryJavaScript: 1, entryCss: 0 },
      },
      {
        id: 'first-visit-landscape',
        label: 'First-visit landscape artwork',
        source: startupAssetSources.landscape,
        file: startupAssetFiles.landscape,
        rawBytes: Buffer.byteLength(startupAssetContents.landscape),
        references: { html: 1, entryJavaScript: 0, entryCss: 1 },
      },
      {
        id: 'first-visit-portrait',
        label: 'First-visit portrait artwork',
        source: startupAssetSources.portrait,
        file: startupAssetFiles.portrait,
        rawBytes: Buffer.byteLength(startupAssetContents.portrait),
        references: { html: 1, entryJavaScript: 0, entryCss: 1 },
      },
    ]);
    expect(formatWebBundleReport(report)).toContain(
      `Bootstrap and first-visit logo: ${startupAssetFiles.logo}, ${Buffer.byteLength(startupAssetContents.logo)} raw bytes, references HTML 2 / entry JS 1 / entry CSS 0`,
    );
  });

  it('rejects a bootstrap shell image that does not use the manifest-resolved logo', async () => {
    const fixture = await createFixture('asset-shell-logo');
    const indexPath = join(fixture.distDirectory, 'index.html');
    const indexHtml = fixtureFile(fixture, 'index.html');
    await writeFile(
      indexPath,
      `${indexHtml.replace(
        `<img src="/${startupAssetFiles.logo}">`,
        '<img src="/assets/wrong-logo-12345678.png">',
      )}<meta content="/${startupAssetFiles.logo}">\n`,
    );

    await expect(analyzeFixture(fixture)).rejects.toThrow(
      `Bootstrap shell image must reference startup asset "bootstrap-logo" at "/${startupAssetFiles.logo}"`,
    );
  });

  it('accepts Vite hoisting the deferred module entry before the bootstrap shell', async () => {
    const fixture = await createFixture('asset-shell-order');
    const indexPath = join(fixture.distDirectory, 'index.html');
    const indexHtml = fixtureFile(fixture, 'index.html');
    const shellMarkup = `<div id="root"><div data-bootstrap-shell><img src="/${startupAssetFiles.logo}"></div></div>`;
    const moduleScript = '<script type="module" src="/assets/index-entry1234.js"></script>';
    await writeFile(
      indexPath,
      indexHtml.replace(`${shellMarkup}\n${moduleScript}`, `${moduleScript}\n${shellMarkup}`),
    );

    await expect(analyzeFixture(fixture)).resolves.toMatchObject({
      startupAssets: expect.any(Array),
    });
  });

  it('rejects a startup asset missing from the Vite manifest', async () => {
    const fixture = await createFixture('asset-manifest');
    delete fixture.manifest[startupAssetSources.logo];
    await writeJson(join(fixture.distDirectory, '.vite/manifest.json'), fixture.manifest);

    await expect(analyzeFixture(fixture)).rejects.toThrow(
      `Expected exactly one Vite asset for source "${startupAssetSources.logo}", found 0`,
    );
  });

  it('rejects a startup asset manifest output without a Vite content hash', async () => {
    const fixture = await createFixture('asset-unhashed');
    const logoEntry = fixture.manifest[startupAssetSources.logo];
    expect(logoEntry).toBeDefined();
    if (!logoEntry) return;
    logoEntry.file = 'assets/swelldays-logo-white.png';
    await writeFile(
      join(fixture.distDirectory, logoEntry.file),
      startupAssetContents.logo,
    );
    await writeJson(join(fixture.distDirectory, '.vite/manifest.json'), fixture.manifest);

    await expect(analyzeFixture(fixture)).rejects.toThrow(
      `Startup asset "bootstrap-logo" output "${logoEntry.file}" is not a hashed asset URL`,
    );
  });

  it('rejects a missing required entry JavaScript startup asset reference', async () => {
    const fixture = await createFixture('asset-js-reference');
    const entryPath = join(fixture.distDirectory, 'assets/index-asset-js-reference.js');
    await writeFile(entryPath, 'entry();\nentry();\n');

    await expect(analyzeFixture(fixture)).rejects.toThrow(
      'Startup asset "bootstrap-logo" requires at least 1 entry JavaScript reference, found 0',
    );
  });

  it('does not count a longer URL that merely starts with the emitted startup asset URL', async () => {
    const fixture = await createFixture('asset-url-prefix');
    const entryPath = join(fixture.distDirectory, 'assets/index-asset-url-prefix.js');
    await writeFile(
      entryPath,
      `entry();\nconst archived = "/${startupAssetFiles.logo}.backup";\n`,
    );

    await expect(analyzeFixture(fixture)).rejects.toThrow(
      'Startup asset "bootstrap-logo" requires at least 1 entry JavaScript reference, found 0',
    );
  });

  it('rejects a mismatched hero URL in entry CSS', async () => {
    const fixture = await createFixture('asset-css-reference');
    const entryPath = join(fixture.distDirectory, 'assets/index-asset-css-reference.css');
    const entryCss = fixtureFile(fixture, 'assets/index-asset-css-reference.css');
    await writeFile(
      entryPath,
      entryCss.replace(startupAssetFiles.portrait, 'first-visit-waves-portrait-different12.webp'),
    );

    await expect(analyzeFixture(fixture)).rejects.toThrow(
      'Startup asset "first-visit-portrait" requires at least 1 entry CSS reference, found 0',
    );
  });

  it('rejects byte divergence between a startup source and its emitted file', async () => {
    const fixture = await createFixture('asset-bytes');
    await writeFile(
      join(fixture.distDirectory, startupAssetFiles.landscape),
      'divergent-landscape-bytes',
    );

    await expect(analyzeFixture(fixture)).rejects.toThrow(
      'Startup asset "first-visit-landscape" emitted bytes differ from its source',
    );
  });

  it('rejects a stable root output for a configured startup asset', async () => {
    const fixture = await createFixture('asset-root-output');
    await writeFile(
      join(fixture.distDirectory, 'swelldays-logo-white.png'),
      startupAssetContents.logo,
    );

    await expect(analyzeFixture(fixture)).rejects.toThrow(
      'Startup asset "bootstrap-logo" has forbidden stable root output "swelldays-logo-white.png"',
    );
  });

  it('rejects an old stable startup asset URL in emitted runtime text', async () => {
    const fixture = await createFixture('asset-old-url');
    const indexPath = join(fixture.distDirectory, 'index.html');
    const indexHtml = fixtureFile(fixture, 'index.html');
    await writeFile(indexPath, `${indexHtml}<img src="/swelldays-logo-white.png">\n`);

    await expect(analyzeFixture(fixture)).rejects.toThrow(
      'Startup asset "bootstrap-logo" has forbidden stable URL "/swelldays-logo-white.png"',
    );
  });

  it('allows a configured startup basename below a different nested URL', async () => {
    const fixture = await createFixture('asset-nested-url');
    const indexPath = join(fixture.distDirectory, 'index.html');
    const indexHtml = fixtureFile(fixture, 'index.html');
    await writeFile(
      indexPath,
      `${indexHtml}<a href="/archive/swelldays-logo-white.png">Archive</a>\n`,
    );

    await expect(analyzeFixture(fixture)).resolves.toMatchObject({
      startupAssets: expect.any(Array),
    });
  });

  it('rejects duplicate startup asset IDs and sources', async () => {
    const fixture = await createFixture('asset-duplicates');
    const logo = fixture.config.startupAssets[0];
    expect(logo).toBeDefined();
    if (!logo) return;
    fixture.config.startupAssets.push({ ...logo });
    await writeJson(fixture.configPath, fixture.config);

    await expect(analyzeFixture(fixture)).rejects.toThrow(
      'Duplicate startup asset id "bootstrap-logo"',
    );

    fixture.config.startupAssets[3] = { ...logo, id: 'duplicate-logo-source' };
    await writeJson(fixture.configPath, fixture.config);

    await expect(analyzeFixture(fixture)).rejects.toThrow(
      `Duplicate startup asset source "${startupAssetSources.logo}"`,
    );
  });

  it('rejects missing startup asset configuration and invalid reference minimums', async () => {
    const fixture = await createFixture('asset-config');
    const configWithoutStartupAssets: Record<string, unknown> = { ...fixture.config };
    delete configWithoutStartupAssets.startupAssets;
    await writeJson(fixture.configPath, configWithoutStartupAssets);

    await expect(analyzeFixture(fixture)).rejects.toThrow('startupAssets must be an array');

    const malformedConfig = {
      ...fixture.config,
      startupAssets: fixture.config.startupAssets.map((asset, index) => (
        index === 0
          ? { ...asset, minimumReferences: { ...asset.minimumReferences, html: -1 } }
          : asset
      )),
    };
    await writeJson(fixture.configPath, malformedConfig);

    await expect(analyzeFixture(fixture)).rejects.toThrow(
      'startupAssets[0].minimumReferences.html must be a non-negative integer',
    );
  });

  it('rejects startup source paths that escape the budget directory', async () => {
    const fixture = await createFixture('asset-source-escape');
    const logo = fixture.config.startupAssets[0];
    expect(logo).toBeDefined();
    if (!logo) return;
    fixture.config.startupAssets[0] = { ...logo, source: '../outside-logo.png' };
    await writeJson(fixture.configPath, fixture.config);

    await expect(analyzeFixture(fixture)).rejects.toThrow(
      'Startup asset "bootstrap-logo" source "../outside-logo.png" escapes the budget directory',
    );
  });

  it('rejects missing graph roots', async () => {
    const fixture = await createFixture('missing-root');
    fixture.config.criticalGraphs[0]?.roots.push('src/app/routes/missing.tsx');
    await writeJson(fixture.configPath, fixture.config);

    await expect(analyzeFixture(fixture)).rejects.toThrow(
      'Critical graph "browse-feed" root "src/app/routes/missing.tsx" is missing from the Vite manifest',
    );
  });

  it('rejects missing emitted files', async () => {
    const fixture = await createFixture('missing-file');
    await rm(join(fixture.distDirectory, 'assets/shared-missing-file.js'));

    await expect(analyzeFixture(fixture)).rejects.toThrow(
      'Manifest output "assets/shared-missing-file.js" does not exist',
    );
  });

  it('rejects duplicate graph IDs', async () => {
    const fixture = await createFixture('duplicate');
    const graph = fixture.config.criticalGraphs[0];
    expect(graph).toBeDefined();
    if (!graph) return;
    fixture.config.criticalGraphs.push({ ...graph, label: 'Duplicate graph' });
    await writeJson(fixture.configPath, fixture.config);

    await expect(analyzeFixture(fixture)).rejects.toThrow(
      'Duplicate critical graph id "browse-feed"',
    );
  });

  it('rejects unsupported assertion graphs', async () => {
    const fixture = await createFixture('unsupported');
    fixture.config.moduleAbsenceAssertions = [{
      label: 'Unknown graph',
      graph: 'not-configured',
      forbiddenModuleSubstrings: ['src/anything.ts'],
    }];
    await writeJson(fixture.configPath, fixture.config);

    await expect(analyzeFixture(fixture)).rejects.toThrow(
      'Module absence assertion "Unknown graph" references unsupported graph "not-configured"',
    );
  });

  it('rejects malformed budget values', async () => {
    const fixture = await createFixture('malformed');
    const malformedConfig = {
      ...fixture.config,
      entryJavaScript: {
        ...fixture.config.entryJavaScript,
        maximumGzipBytes: -1,
      },
    };
    await writeJson(fixture.configPath, malformedConfig);

    await expect(analyzeFixture(fixture)).rejects.toThrow(
      'entryJavaScript.maximumGzipBytes must be a non-negative integer',
    );
  });
});

describe('createBundleModuleInventoryPlugin', () => {
  it('emits stable root-relative chunk and module identities', async () => {
    const baseDirectory = await mkdtemp(join(tmpdir(), 'swelldays-bundle-plugin-'));
    temporaryDirectories.push(baseDirectory);
    const rootDirectory = join(baseDirectory, 'web');
    await mkdir(rootDirectory);
    await writeFile(join(rootDirectory, 'entry.js'), [
      "import { shared } from './shared.js';",
      "import legacy from '../legacy.cjs';",
      'shared();',
      'legacy();',
      "void import('./optional.js');",
    ].join('\n'));
    await writeFile(join(rootDirectory, 'shared.js'), 'export const shared = () => true;\n');
    await writeFile(join(rootDirectory, 'optional.js'), 'export const optional = true;\n');
    await writeFile(join(baseDirectory, 'legacy.cjs'), 'module.exports = () => true;\n');

    await build({
      root: rootDirectory,
      logLevel: 'silent',
      plugins: [createBundleModuleInventoryPlugin(rootDirectory)],
      build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: { input: join(rootDirectory, 'entry.js') },
      },
    });

    const inventoryText = await readFile(
      join(rootDirectory, 'dist/.vite/bundle-modules.json'),
      'utf8',
    );
    const inventory: unknown = JSON.parse(inventoryText);
    const canonicalBaseDirectory = await realpath(baseDirectory);
    expect(inventory).toMatchObject({ version: 1 });
    expect(inventoryText).not.toContain(rootDirectory);
    expect(inventoryText).not.toContain(canonicalBaseDirectory);
    expect(inventoryText).not.toContain('\\\\');
    expect(inventoryText).toContain('entry.js');
    expect(inventoryText).toContain('optional.js');
  });
});
