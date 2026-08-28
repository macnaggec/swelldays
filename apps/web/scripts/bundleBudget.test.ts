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
    'assets/index-HASH.js': 'entry();\nentry();\n',
    'assets/index-HASH.css': '.entry{color:navy}\n',
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
    'index.html': '<div id="root"></div>\n',
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
        modules: ['src/main.tsx', 'src/startup/forbidden.ts'],
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
        modules: ['node_modules/mapbox-gl/src/index.ts', 'src/optional/forbidden.ts'],
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
  };

  await Promise.all(Object.entries(hashedFiles).map(async ([path, contents]) => {
    const outputPath = join(distDirectory, path);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, contents);
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
