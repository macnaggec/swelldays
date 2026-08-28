import { realpathSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import type { Plugin } from 'vite';

export interface ViteManifestEntry {
  file: string;
  src?: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
  css?: string[];
}

export type ViteManifest = Record<string, ViteManifestEntry>;

export interface BundleChunkInventory {
  file: string;
  facadeModuleId: string | null;
  isEntry: boolean;
  isDynamicEntry: boolean;
  imports: string[];
  dynamicImports: string[];
  modules: string[];
}

export interface BundleModuleInventory {
  version: 1;
  chunks: BundleChunkInventory[];
}

export interface GzipBudget {
  baselineGzipBytes: number;
  maximumGzipBytes: number;
}

export interface CriticalGraphBudget {
  id: string;
  label: string;
  roots: string[];
  budget: GzipBudget;
}

export interface ReportedModuleGroup {
  id: string;
  label: string;
  moduleSubstrings: string[];
}

export interface ModuleAbsenceAssertion {
  label: string;
  graph: 'entry' | string;
  forbiddenModuleSubstrings: string[];
}

export interface WebBundleBudgetConfig {
  version: 1;
  baselineDate: string;
  headroomPercent: number;
  entrySource: string;
  entryJavaScript: GzipBudget;
  entryCss: GzipBudget;
  criticalGraphs: CriticalGraphBudget[];
  reportedModuleGroups: ReportedModuleGroup[];
  moduleAbsenceAssertions: ModuleAbsenceAssertion[];
}

export interface ArtifactReport {
  id: string;
  label: string;
  fileCount: number;
  rawBytes: number;
  gzipBytes: number;
}

export interface BudgetFailure {
  label: string;
  actualGzipBytes: number;
  maximumGzipBytes: number;
  deltaGzipBytes: number;
}

export interface ModuleAssertionFailure {
  label: string;
  graph: string;
  matchingModules: string[];
}

export interface WebBundleReport {
  entryJavaScript: ArtifactReport;
  entryCss: ArtifactReport;
  criticalGraphs: ArtifactReport[];
  reportedModuleGroups: ArtifactReport[];
  routeChunks: ArtifactReport[];
  emittedAssets: ArtifactReport;
  servedOutput: ArtifactReport;
  budgetFailures: BudgetFailure[];
  moduleAssertionFailures: ModuleAssertionFailure[];
}

export interface AnalyzeWebBundleOptions {
  distDirectory: string;
  configPath: string;
}

interface ManifestGraph {
  recordKeys: Set<string>;
  javascriptFiles: Set<string>;
  cssFiles: Set<string>;
}

const normalizeSlashes = (value: string): string => value.replaceAll('\\', '/');

const normalizeModuleId = (moduleId: string, rootDirectory: string): string => {
  const normalizedId = normalizeSlashes(moduleId);
  const normalizedRoot = normalizeSlashes(resolve(rootDirectory));
  if (normalizedId.startsWith('\0')) {
    const virtualTarget = normalizedId.slice(1);
    if (isAbsolute(virtualTarget)) {
      return `\0${normalizeSlashes(relative(rootDirectory, virtualTarget))}`;
    }
    return normalizedId.replaceAll(normalizedRoot, '.');
  }
  if (isAbsolute(moduleId)) {
    return normalizeSlashes(relative(rootDirectory, moduleId));
  }
  return normalizedId.replaceAll(normalizedRoot, '.');
};

export function createBundleModuleInventoryPlugin(rootDirectory: string): Plugin {
  const canonicalRootDirectory = realpathSync(rootDirectory);
  return {
    name: 'swelldays-bundle-module-inventory',
    apply: 'build',
    generateBundle(_outputOptions, bundle) {
      const chunks = Object.values(bundle)
        .filter((output) => output.type === 'chunk')
        .map((chunk): BundleChunkInventory => ({
          file: normalizeSlashes(chunk.fileName),
          facadeModuleId: chunk.facadeModuleId === null
            ? null
            : normalizeModuleId(chunk.facadeModuleId, canonicalRootDirectory),
          isEntry: chunk.isEntry,
          isDynamicEntry: chunk.isDynamicEntry,
          imports: [...chunk.imports].map(normalizeSlashes).sort(),
          dynamicImports: [...chunk.dynamicImports].map(normalizeSlashes).sort(),
          modules: Object.keys(chunk.modules)
            .map((moduleId) => normalizeModuleId(moduleId, canonicalRootDirectory))
            .sort(),
        }))
        .sort((left, right) => left.file.localeCompare(right.file));
      const inventory: BundleModuleInventory = { version: 1, chunks };

      this.emitFile({
        type: 'asset',
        fileName: '.vite/bundle-modules.json',
        source: `${JSON.stringify(inventory, null, 2)}\n`,
      });
    },
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const requireRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
};

const requireString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
};

const requireBoolean = (value: unknown, label: string): boolean => {
  if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean`);
  return value;
};

const optionalBoolean = (value: unknown, label: string): boolean | undefined => {
  if (value === undefined) return undefined;
  return requireBoolean(value, label);
};

const optionalString = (value: unknown, label: string): string | undefined => {
  if (value === undefined) return undefined;
  return requireString(value, label);
};

const requireStringArray = (value: unknown, label: string): string[] => {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((item, index) => requireString(item, `${label}[${index}]`));
};

const optionalStringArray = (value: unknown, label: string): string[] | undefined => {
  if (value === undefined) return undefined;
  return requireStringArray(value, label);
};

const requireNonNegativeInteger = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
};

const parseBudget = (value: unknown, label: string): GzipBudget => {
  const record = requireRecord(value, label);
  const baselineGzipBytes = requireNonNegativeInteger(
    record.baselineGzipBytes,
    `${label}.baselineGzipBytes`,
  );
  const maximumGzipBytes = requireNonNegativeInteger(
    record.maximumGzipBytes,
    `${label}.maximumGzipBytes`,
  );
  if (maximumGzipBytes < baselineGzipBytes) {
    throw new Error(`${label}.maximumGzipBytes must be greater than or equal to its baseline`);
  }
  return { baselineGzipBytes, maximumGzipBytes };
};

const parseManifestEntry = (value: unknown, label: string): ViteManifestEntry => {
  const record = requireRecord(value, label);
  return {
    file: requireString(record.file, `${label}.file`),
    src: optionalString(record.src, `${label}.src`),
    isEntry: optionalBoolean(record.isEntry, `${label}.isEntry`),
    isDynamicEntry: optionalBoolean(record.isDynamicEntry, `${label}.isDynamicEntry`),
    imports: optionalStringArray(record.imports, `${label}.imports`),
    dynamicImports: optionalStringArray(record.dynamicImports, `${label}.dynamicImports`),
    css: optionalStringArray(record.css, `${label}.css`),
  };
};

const parseManifest = (value: unknown): ViteManifest => {
  const record = requireRecord(value, 'Vite manifest');
  const manifest: ViteManifest = {};
  for (const [key, entry] of Object.entries(record)) {
    manifest[key] = parseManifestEntry(entry, `Vite manifest entry "${key}"`);
  }
  if (Object.keys(manifest).length === 0) throw new Error('Vite manifest must not be empty');
  return manifest;
};

const parseChunkInventory = (value: unknown, label: string): BundleChunkInventory => {
  const record = requireRecord(value, label);
  const facadeModuleId = record.facadeModuleId === null
    ? null
    : requireString(record.facadeModuleId, `${label}.facadeModuleId`);
  return {
    file: requireString(record.file, `${label}.file`),
    facadeModuleId,
    isEntry: requireBoolean(record.isEntry, `${label}.isEntry`),
    isDynamicEntry: requireBoolean(record.isDynamicEntry, `${label}.isDynamicEntry`),
    imports: requireStringArray(record.imports, `${label}.imports`),
    dynamicImports: requireStringArray(record.dynamicImports, `${label}.dynamicImports`),
    modules: requireStringArray(record.modules, `${label}.modules`),
  };
};

const parseInventory = (value: unknown): BundleModuleInventory => {
  const record = requireRecord(value, 'Bundle module inventory');
  if (record.version !== 1) throw new Error('Bundle module inventory version must be 1');
  if (!Array.isArray(record.chunks)) throw new Error('Bundle module inventory chunks must be an array');
  const chunks = record.chunks.map((chunk, index) => (
    parseChunkInventory(chunk, `Bundle module inventory chunk ${index}`)
  ));
  const seenFiles = new Set<string>();
  for (const chunk of chunks) {
    if (seenFiles.has(chunk.file)) {
      throw new Error(`Duplicate bundle inventory chunk file "${chunk.file}"`);
    }
    seenFiles.add(chunk.file);
  }
  return { version: 1, chunks };
};

const parseConfig = (value: unknown): WebBundleBudgetConfig => {
  const record = requireRecord(value, 'Bundle budget config');
  if (record.version !== 1) throw new Error('Bundle budget config version must be 1');
  if (typeof record.headroomPercent !== 'number' || !Number.isFinite(record.headroomPercent)
    || record.headroomPercent < 0) {
    throw new Error('headroomPercent must be a non-negative number');
  }
  if (!Array.isArray(record.criticalGraphs)) {
    throw new Error('criticalGraphs must be an array');
  }
  if (!Array.isArray(record.reportedModuleGroups)) {
    throw new Error('reportedModuleGroups must be an array');
  }
  if (!Array.isArray(record.moduleAbsenceAssertions)) {
    throw new Error('moduleAbsenceAssertions must be an array');
  }

  const criticalGraphs = record.criticalGraphs.map((value, index): CriticalGraphBudget => {
    const graph = requireRecord(value, `criticalGraphs[${index}]`);
    return {
      id: requireString(graph.id, `criticalGraphs[${index}].id`),
      label: requireString(graph.label, `criticalGraphs[${index}].label`),
      roots: requireStringArray(graph.roots, `criticalGraphs[${index}].roots`),
      budget: parseBudget(graph.budget, `criticalGraphs[${index}].budget`),
    };
  });
  const graphIds = new Set<string>();
  for (const graph of criticalGraphs) {
    if (graphIds.has(graph.id)) throw new Error(`Duplicate critical graph id "${graph.id}"`);
    graphIds.add(graph.id);
  }

  const reportedModuleGroups = record.reportedModuleGroups.map(
    (value, index): ReportedModuleGroup => {
      const group = requireRecord(value, `reportedModuleGroups[${index}]`);
      return {
        id: requireString(group.id, `reportedModuleGroups[${index}].id`),
        label: requireString(group.label, `reportedModuleGroups[${index}].label`),
        moduleSubstrings: requireStringArray(
          group.moduleSubstrings,
          `reportedModuleGroups[${index}].moduleSubstrings`,
        ),
      };
    },
  );

  const moduleAbsenceAssertions = record.moduleAbsenceAssertions.map(
    (value, index): ModuleAbsenceAssertion => {
      const assertion = requireRecord(value, `moduleAbsenceAssertions[${index}]`);
      return {
        label: requireString(assertion.label, `moduleAbsenceAssertions[${index}].label`),
        graph: requireString(assertion.graph, `moduleAbsenceAssertions[${index}].graph`),
        forbiddenModuleSubstrings: requireStringArray(
          assertion.forbiddenModuleSubstrings,
          `moduleAbsenceAssertions[${index}].forbiddenModuleSubstrings`,
        ),
      };
    },
  );
  for (const assertion of moduleAbsenceAssertions) {
    if (assertion.graph !== 'entry' && !graphIds.has(assertion.graph)) {
      throw new Error(
        `Module absence assertion "${assertion.label}" references unsupported graph "${assertion.graph}"`,
      );
    }
  }

  return {
    version: 1,
    baselineDate: requireString(record.baselineDate, 'baselineDate'),
    headroomPercent: record.headroomPercent,
    entrySource: requireString(record.entrySource, 'entrySource'),
    entryJavaScript: parseBudget(record.entryJavaScript, 'entryJavaScript'),
    entryCss: parseBudget(record.entryCss, 'entryCss'),
    criticalGraphs,
    reportedModuleGroups,
    moduleAbsenceAssertions,
  };
};

const readJson = async (path: string, label: string): Promise<unknown> => {
  let contents: string;
  try {
    contents = await readFile(path, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read ${label} at "${path}": ${message}`);
  }
  try {
    const parsed: unknown = JSON.parse(contents);
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to parse ${label} at "${path}": ${message}`);
  }
};

const assertRegularOutputFile = async (
  distDirectory: string,
  emittedPath: string,
  owner: string,
): Promise<void> => {
  const absolutePath = resolve(distDirectory, emittedPath);
  const relativePath = normalizeSlashes(relative(distDirectory, absolutePath));
  if (relativePath.startsWith('../') || relativePath === '..') {
    throw new Error(`${owner} output "${emittedPath}" escapes the build directory`);
  }
  try {
    const metadata = await stat(absolutePath);
    if (!metadata.isFile()) throw new Error('path is not a regular file');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (owner === 'Manifest') {
      throw new Error(`Manifest output "${emittedPath}" does not exist: ${message}`);
    }
    throw new Error(`${owner} output "${emittedPath}" does not exist: ${message}`);
  }
};

const validateBuildOutput = async (
  distDirectory: string,
  manifest: ViteManifest,
  inventory: BundleModuleInventory,
): Promise<void> => {
  for (const [key, entry] of Object.entries(manifest)) {
    await assertRegularOutputFile(distDirectory, entry.file, 'Manifest');
    for (const cssFile of entry.css ?? []) {
      await assertRegularOutputFile(distDirectory, cssFile, 'Manifest');
    }
    for (const importedKey of [...(entry.imports ?? []), ...(entry.dynamicImports ?? [])]) {
      if (!manifest[importedKey]) {
        throw new Error(`Vite manifest entry "${key}" references missing entry "${importedKey}"`);
      }
    }
  }
  for (const chunk of inventory.chunks) {
    await assertRegularOutputFile(distDirectory, chunk.file, 'Bundle inventory');
  }
};

const collectManifestGraph = (
  manifest: ViteManifest,
  roots: string[],
  graphLabel: string,
): ManifestGraph => {
  for (const root of roots) {
    if (!manifest[root]) {
      throw new Error(`${graphLabel} root "${root}" is missing from the Vite manifest`);
    }
  }
  const recordKeys = new Set<string>();
  const javascriptFiles = new Set<string>();
  const cssFiles = new Set<string>();
  const pending = [...roots];
  while (pending.length > 0) {
    const key = pending.pop();
    if (key === undefined || recordKeys.has(key)) continue;
    const entry = manifest[key];
    if (!entry) throw new Error(`${graphLabel} references missing manifest entry "${key}"`);
    recordKeys.add(key);
    javascriptFiles.add(entry.file);
    for (const cssFile of entry.css ?? []) cssFiles.add(cssFile);
    for (const importedKey of entry.imports ?? []) pending.push(importedKey);
  }
  return { recordKeys, javascriptFiles, cssFiles };
};

const measureFiles = async (
  distDirectory: string,
  files: Iterable<string>,
  id: string,
  label: string,
): Promise<ArtifactReport> => {
  const uniqueFiles = [...new Set(files)].sort();
  let rawBytes = 0;
  let gzipBytes = 0;
  for (const file of uniqueFiles) {
    const contents = await readFile(resolve(distDirectory, file));
    rawBytes += contents.byteLength;
    gzipBytes += gzipSync(contents).byteLength;
  }
  return { id, label, fileCount: uniqueFiles.length, rawBytes, gzipBytes };
};

const listRegularFiles = async (
  rootDirectory: string,
  relativeDirectory = '',
): Promise<string[]> => {
  const directory = resolve(rootDirectory, relativeDirectory);
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read build directory "${directory}": ${message}`);
  }
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = normalizeSlashes(join(relativeDirectory, entry.name));
    if (entry.isDirectory()) {
      files.push(...await listRegularFiles(rootDirectory, relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
};

const compareReports = (left: ArtifactReport, right: ArtifactReport): number => (
  left.id.localeCompare(right.id) || left.label.localeCompare(right.label)
);

const budgetFailure = (
  report: ArtifactReport,
  budget: GzipBudget,
): BudgetFailure | undefined => {
  if (report.gzipBytes <= budget.maximumGzipBytes) return undefined;
  return {
    label: report.label,
    actualGzipBytes: report.gzipBytes,
    maximumGzipBytes: budget.maximumGzipBytes,
    deltaGzipBytes: report.gzipBytes - budget.maximumGzipBytes,
  };
};

export async function analyzeWebBundle(
  options: AnalyzeWebBundleOptions,
): Promise<WebBundleReport> {
  const [manifestValue, inventoryValue, configValue] = await Promise.all([
    readJson(resolve(options.distDirectory, '.vite/manifest.json'), 'Vite manifest'),
    readJson(
      resolve(options.distDirectory, '.vite/bundle-modules.json'),
      'bundle module inventory',
    ),
    readJson(options.configPath, 'bundle budget config'),
  ]);
  const manifest = parseManifest(manifestValue);
  const inventory = parseInventory(inventoryValue);
  const config = parseConfig(configValue);
  await validateBuildOutput(options.distDirectory, manifest, inventory);

  const matchingEntries = Object.entries(manifest).filter(([key, entry]) => (
    entry.isEntry === true && (key === config.entrySource || entry.src === config.entrySource)
  ));
  if (matchingEntries.length !== 1) {
    throw new Error(
      `Expected exactly one Vite entry for source "${config.entrySource}", found ${matchingEntries.length}`,
    );
  }
  const matchingEntry = matchingEntries[0];
  if (!matchingEntry) throw new Error('Configured Vite entry unexpectedly disappeared');
  const entryGraph = collectManifestGraph(
    manifest,
    [matchingEntry[0]],
    `Entry source "${config.entrySource}"`,
  );
  const entryJavaScript = await measureFiles(
    options.distDirectory,
    entryGraph.javascriptFiles,
    'entry-javascript',
    'Entry JavaScript',
  );
  const entryCss = await measureFiles(
    options.distDirectory,
    entryGraph.cssFiles,
    'entry-css',
    'Entry CSS',
  );

  const graphs = new Map<string, ManifestGraph>([['entry', entryGraph]]);
  const criticalGraphs: ArtifactReport[] = [];
  const criticalBudgets = new Map<string, GzipBudget>();
  for (const graphConfig of config.criticalGraphs) {
    const graph = collectManifestGraph(
      manifest,
      graphConfig.roots,
      `Critical graph "${graphConfig.id}"`,
    );
    graphs.set(graphConfig.id, graph);
    criticalBudgets.set(graphConfig.id, graphConfig.budget);
    criticalGraphs.push(await measureFiles(
      options.distDirectory,
      [...graph.javascriptFiles, ...graph.cssFiles],
      graphConfig.id,
      graphConfig.label,
    ));
  }
  criticalGraphs.sort(compareReports);

  const cssByChunkFile = new Map<string, Set<string>>();
  for (const entry of Object.values(manifest)) {
    const attachedCss = cssByChunkFile.get(entry.file) ?? new Set<string>();
    for (const cssFile of entry.css ?? []) attachedCss.add(cssFile);
    cssByChunkFile.set(entry.file, attachedCss);
  }
  const reportedModuleGroups: ArtifactReport[] = [];
  for (const group of config.reportedModuleGroups) {
    const files = new Set<string>();
    for (const chunk of inventory.chunks) {
      const matches = chunk.modules.some((moduleId) => (
        group.moduleSubstrings.some((substring) => moduleId.includes(substring))
      ));
      if (!matches) continue;
      files.add(chunk.file);
      for (const cssFile of cssByChunkFile.get(chunk.file) ?? []) files.add(cssFile);
    }
    reportedModuleGroups.push(await measureFiles(
      options.distDirectory,
      files,
      group.id,
      group.label,
    ));
  }
  reportedModuleGroups.sort(compareReports);

  const routeChunks: ArtifactReport[] = [];
  for (const [key, entry] of Object.entries(manifest)) {
    const source = entry.src ?? key;
    if (entry.isDynamicEntry !== true || !source.startsWith('src/app/routes/')) continue;
    routeChunks.push(await measureFiles(
      options.distDirectory,
      [entry.file, ...(entry.css ?? [])],
      source,
      source,
    ));
  }
  routeChunks.sort(compareReports);

  const inventoryByFile = new Map(inventory.chunks.map((chunk) => [chunk.file, chunk]));
  const moduleAssertionFailures: ModuleAssertionFailure[] = [];
  for (const assertion of config.moduleAbsenceAssertions) {
    const graph = graphs.get(assertion.graph);
    if (!graph) {
      throw new Error(`Module absence assertion "${assertion.label}" graph is unavailable`);
    }
    const matchingModules = new Set<string>();
    for (const chunkFile of graph.javascriptFiles) {
      const chunk = inventoryByFile.get(chunkFile);
      if (!chunk) {
        throw new Error(`Bundle module inventory is missing graph chunk "${chunkFile}"`);
      }
      for (const moduleId of chunk.modules) {
        if (assertion.forbiddenModuleSubstrings.some((substring) => moduleId.includes(substring))) {
          matchingModules.add(moduleId);
        }
      }
    }
    if (matchingModules.size > 0) {
      moduleAssertionFailures.push({
        label: assertion.label,
        graph: assertion.graph,
        matchingModules: [...matchingModules].sort(),
      });
    }
  }
  moduleAssertionFailures.sort((left, right) => (
    left.label.localeCompare(right.label) || left.graph.localeCompare(right.graph)
  ));

  const emittedAssetFiles = await listRegularFiles(options.distDirectory, 'assets');
  const servedFiles = (await listRegularFiles(options.distDirectory))
    .filter((file) => file !== '.vite' && !file.startsWith('.vite/'));
  const emittedAssets = await measureFiles(
    options.distDirectory,
    emittedAssetFiles,
    'emitted-assets',
    'Emitted assets',
  );
  const servedOutput = await measureFiles(
    options.distDirectory,
    servedFiles,
    'served-output',
    'Served output',
  );

  const failures = [
    budgetFailure(entryJavaScript, config.entryJavaScript),
    budgetFailure(entryCss, config.entryCss),
    ...criticalGraphs.map((report) => {
      const budget = criticalBudgets.get(report.id);
      if (!budget) throw new Error(`Budget for critical graph "${report.id}" is unavailable`);
      return budgetFailure(report, budget);
    }),
  ];
  const budgetFailures = failures
    .filter((failure): failure is BudgetFailure => failure !== undefined)
    .sort((left, right) => left.label.localeCompare(right.label));

  return {
    entryJavaScript,
    entryCss,
    criticalGraphs,
    reportedModuleGroups,
    routeChunks,
    emittedAssets,
    servedOutput,
    budgetFailures,
    moduleAssertionFailures,
  };
}

const formatArtifact = (report: ArtifactReport): string => (
  `${report.label}: ${report.fileCount} files, ${report.rawBytes} raw bytes, ${report.gzipBytes} gzip bytes`
);

const pluralizeBytes = (bytes: number): string => `${bytes} ${bytes === 1 ? 'byte' : 'bytes'}`;

export function formatWebBundleReport(report: WebBundleReport): string {
  const lines = [
    'Web bundle report',
    formatArtifact(report.entryJavaScript),
    formatArtifact(report.entryCss),
    ...[...report.criticalGraphs].sort(compareReports).map(formatArtifact),
    ...[...report.reportedModuleGroups].sort(compareReports).map(formatArtifact),
    ...[...report.routeChunks].sort(compareReports).map(formatArtifact),
    formatArtifact(report.emittedAssets),
    formatArtifact(report.servedOutput),
  ];
  const budgetFailures = [...report.budgetFailures]
    .sort((left, right) => left.label.localeCompare(right.label));
  const moduleFailures = [...report.moduleAssertionFailures]
    .sort((left, right) => left.label.localeCompare(right.label));
  if (budgetFailures.length > 0 || moduleFailures.length > 0) lines.push('Failures');
  for (const failure of budgetFailures) {
    lines.push(
      `FAIL ${failure.label}: actual gzip bytes ${failure.actualGzipBytes}, budget ${failure.maximumGzipBytes}, delta +${pluralizeBytes(failure.deltaGzipBytes)}`,
    );
  }
  for (const failure of moduleFailures) {
    lines.push(
      `FAIL ${failure.label}: graph ${failure.graph}, forbidden modules ${failure.matchingModules.join(', ')}`,
    );
  }
  return `${lines.join('\n')}\n`;
}

const webDirectory = fileURLToPath(new URL('../', import.meta.url));

export async function checkWebBundleBudgets(
  options: Partial<AnalyzeWebBundleOptions> = {},
): Promise<number> {
  const report = await analyzeWebBundle({
    distDirectory: options.distDirectory ?? resolve(webDirectory, 'dist'),
    configPath: options.configPath ?? resolve(webDirectory, 'bundle-budgets.json'),
  });
  process.stdout.write(formatWebBundleReport(report));
  return report.budgetFailures.length === 0 && report.moduleAssertionFailures.length === 0 ? 0 : 1;
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  checkWebBundleBudgets()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Bundle budget check failed: ${message}\n`);
      process.exitCode = 1;
    });
}
