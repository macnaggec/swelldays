import { realpathSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
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
  assetKind?: 'javascript' | 'stylesheet';
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

export interface StartupAssetReferenceMinimums {
  html: number;
  entryJavaScript: number;
  entryCss: number;
}

export interface StartupAssetContract {
  id: string;
  label: string;
  source: string;
  minimumReferences: StartupAssetReferenceMinimums;
  referenceGraph?: string;
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
  startupAssets: StartupAssetContract[];
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

export interface StartupAssetReport {
  id: string;
  label: string;
  source: string;
  file: string;
  rawBytes: number;
  references: StartupAssetReferenceMinimums;
}

export interface WebBundleReport {
  entryJavaScript: ArtifactReport;
  entryCss: ArtifactReport;
  criticalGraphs: ArtifactReport[];
  reportedModuleGroups: ArtifactReport[];
  routeChunks: ArtifactReport[];
  startupAssets: StartupAssetReport[];
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
  if (!Array.isArray(record.startupAssets)) {
    throw new Error('startupAssets must be an array');
  }

  const criticalGraphs = record.criticalGraphs.map((value, index): CriticalGraphBudget => {
    const graph = requireRecord(value, `criticalGraphs[${index}]`);
    if (graph.assetKind !== undefined && graph.assetKind !== 'javascript' && graph.assetKind !== 'stylesheet') {
      throw new Error(`criticalGraphs[${index}].assetKind must be javascript or stylesheet`);
    }
    return {
      id: requireString(graph.id, `criticalGraphs[${index}].id`),
      label: requireString(graph.label, `criticalGraphs[${index}].label`),
      roots: requireStringArray(graph.roots, `criticalGraphs[${index}].roots`),
      budget: parseBudget(graph.budget, `criticalGraphs[${index}].budget`),
      assetKind: graph.assetKind,
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

  const startupAssets = record.startupAssets.map(
    (value, index): StartupAssetContract => {
      const asset = requireRecord(value, `startupAssets[${index}]`);
      const minimumReferences = requireRecord(
        asset.minimumReferences,
        `startupAssets[${index}].minimumReferences`,
      );
      const referenceGraph = asset.referenceGraph === undefined ? undefined : requireString(asset.referenceGraph, `startupAssets[${index}].referenceGraph`);
      if (referenceGraph !== undefined && referenceGraph !== 'entry' && !graphIds.has(referenceGraph)) {
        throw new Error(`Startup asset "${String(asset.id)}" references unsupported graph "${referenceGraph}"`);
      }
      return {
        id: requireString(asset.id, `startupAssets[${index}].id`),
        label: requireString(asset.label, `startupAssets[${index}].label`),
        source: requireString(asset.source, `startupAssets[${index}].source`),
        referenceGraph,
        minimumReferences: {
          html: requireNonNegativeInteger(
            minimumReferences.html,
            `startupAssets[${index}].minimumReferences.html`,
          ),
          entryJavaScript: requireNonNegativeInteger(
            minimumReferences.entryJavaScript,
            `startupAssets[${index}].minimumReferences.entryJavaScript`,
          ),
          entryCss: requireNonNegativeInteger(
            minimumReferences.entryCss,
            `startupAssets[${index}].minimumReferences.entryCss`,
          ),
        },
      };
    },
  );
  const startupAssetIds = new Set<string>();
  const startupAssetSources = new Set<string>();
  for (const asset of startupAssets) {
    if (startupAssetIds.has(asset.id)) {
      throw new Error(`Duplicate startup asset id "${asset.id}"`);
    }
    if (startupAssetSources.has(asset.source)) {
      throw new Error(`Duplicate startup asset source "${asset.source}"`);
    }
    startupAssetIds.add(asset.id);
    startupAssetSources.add(asset.source);
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
    startupAssets,
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

const escapeRegularExpression = (value: string): string => (
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
);

const countExactUrlOccurrences = (contents: string, value: string): number => (
  contents.match(new RegExp(
    `(^|[^A-Za-z0-9_./-])${escapeRegularExpression(value)}(?=$|[^A-Za-z0-9_./?%&=+#-])`,
    'g',
  ))?.length ?? 0
);

const readHtmlAttribute = (tag: string, name: string): string | undefined => {
  const match = new RegExp(
    `(?:^|\\s)${escapeRegularExpression(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\\x60]+))`,
    'i',
  ).exec(tag);
  return match?.[1] ?? match?.[2] ?? match?.[3];
};

const validateBootstrapShell = (
  htmlContents: string,
  assetId: string,
  emittedUrl: string,
): void => {
  const shellMatch = /<div\b(?=[^>]*\bdata-bootstrap-shell(?=\s|=|>))[^>]*>[\s\S]*?<\/div>/i
    .exec(htmlContents);
  const imageTag = shellMatch?.[0].match(/<img\b[^>]*>/i)?.[0];
  if (imageTag === undefined || readHtmlAttribute(imageTag, 'src') !== emittedUrl) {
    throw new Error(
      `Bootstrap shell image must reference startup asset "${assetId}" at "${emittedUrl}"`,
    );
  }
  const moduleScriptMatch = /<script\b(?=[^>]*\btype\s*=\s*(?:"module"|'module'|module)(?=\s|>))[^>]*>/i
    .exec(htmlContents);
  if (moduleScriptMatch === null) {
    throw new Error('Production module entry script is missing from index.html');
  }
};

const outputPathExists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return false;
    throw error;
  }
};

const validateStartupAssets = async (
  distDirectory: string,
  configPath: string,
  manifest: ViteManifest,
  entryGraph: ManifestGraph,
  contracts: StartupAssetContract[],
): Promise<StartupAssetReport[]> => {
  const configDirectory = dirname(resolve(configPath));
  const emittedAssetFiles = await listRegularFiles(distDirectory, 'assets');
  const runtimeTextFiles = (await listRegularFiles(distDirectory))
    .filter((file) => file === 'index.html' || file.endsWith('.js') || file.endsWith('.css'));
  const runtimeText = new Map<string, string>();
  await Promise.all(runtimeTextFiles.map(async (file) => {
    runtimeText.set(file, await readFile(resolve(distDirectory, file), 'utf8'));
  }));
  const htmlContents = runtimeText.get('index.html');
  if (htmlContents === undefined) {
    throw new Error('Production index.html is missing from the build output');
  }
  const entryJavaScriptContents = await Promise.all(
    [...entryGraph.javascriptFiles].sort().map((file) => readFile(resolve(distDirectory, file), 'utf8')),
  );
  const entryCssContents = await Promise.all(
    [...entryGraph.cssFiles].sort().map((file) => readFile(resolve(distDirectory, file), 'utf8')),
  );

  const reports: StartupAssetReport[] = [];
  for (const contract of contracts) {
    if (isAbsolute(contract.source)) {
      throw new Error(
        `Startup asset "${contract.id}" source "${contract.source}" must be relative to the budget directory`,
      );
    }
    const sourcePath = resolve(configDirectory, contract.source);
    const relativeSourcePath = normalizeSlashes(relative(configDirectory, sourcePath));
    if (relativeSourcePath === '..' || relativeSourcePath.startsWith('../')) {
      throw new Error(
        `Startup asset "${contract.id}" source "${contract.source}" escapes the budget directory`,
      );
    }
    try {
      const sourceMetadata = await stat(sourcePath);
      if (!sourceMetadata.isFile()) throw new Error('path is not a regular file');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Startup asset "${contract.id}" source "${contract.source}" is not a regular file: ${message}`,
      );
    }

    const matchingEntries = Object.entries(manifest).filter(([key, entry]) => (
      key === contract.source || entry.src === contract.source
    ));
    if (matchingEntries.length !== 1) {
      throw new Error(
        `Expected exactly one Vite asset for source "${contract.source}", found ${matchingEntries.length}`,
      );
    }
    const matchingEntry = matchingEntries[0];
    if (!matchingEntry) throw new Error(`Startup asset "${contract.id}" manifest entry disappeared`);
    const emittedFile = normalizeSlashes(matchingEntry[1].file);
    const sourceExtension = extname(contract.source);
    const sourceStem = basename(contract.source, sourceExtension);
    const hashedAssetPattern = new RegExp(
      `^assets/${escapeRegularExpression(sourceStem)}-[A-Za-z0-9_-]{8,}${escapeRegularExpression(sourceExtension)}$`,
    );
    if (!hashedAssetPattern.test(emittedFile)) {
      throw new Error(
        `Startup asset "${contract.id}" output "${emittedFile}" is not a hashed asset URL`,
      );
    }
    const physicalMatches = emittedAssetFiles.filter((file) => hashedAssetPattern.test(file));
    if (physicalMatches.length !== 1) {
      throw new Error(
        `Startup asset "${contract.id}" expected exactly one physical emitted file, found ${physicalMatches.length}`,
      );
    }

    const [sourceContents, emittedContents] = await Promise.all([
      readFile(sourcePath),
      readFile(resolve(distDirectory, emittedFile)),
    ]);
    if (!sourceContents.equals(emittedContents)) {
      throw new Error(`Startup asset "${contract.id}" emitted bytes differ from its source`);
    }

    const stableBasename = basename(contract.source);
    if (await outputPathExists(resolve(distDirectory, stableBasename))) {
      throw new Error(
        `Startup asset "${contract.id}" has forbidden stable root output "${stableBasename}"`,
      );
    }
    const stableUrl = `/${stableBasename}`;
    if ([...runtimeText.values()].some(
      (contents) => countExactUrlOccurrences(contents, stableUrl) > 0,
    )) {
      throw new Error(
        `Startup asset "${contract.id}" has forbidden stable URL "${stableUrl}"`,
      );
    }

    const emittedUrl = `/${emittedFile}`;
    if (contract.id === 'bootstrap-logo') {
      validateBootstrapShell(htmlContents, contract.id, emittedUrl);
    }
    const references: StartupAssetReferenceMinimums = {
      html: countExactUrlOccurrences(htmlContents, emittedUrl),
      entryJavaScript: entryJavaScriptContents.reduce(
        (total, contents) => total + countExactUrlOccurrences(contents, emittedUrl),
        0,
      ),
      entryCss: entryCssContents.reduce(
        (total, contents) => total + countExactUrlOccurrences(contents, emittedUrl),
        0,
      ),
    };
    if (references.html < contract.minimumReferences.html) {
      throw new Error(
        `Startup asset "${contract.id}" requires at least ${contract.minimumReferences.html} HTML references, found ${references.html}`,
      );
    }
    if (references.entryJavaScript < contract.minimumReferences.entryJavaScript) {
      throw new Error(
        `Startup asset "${contract.id}" requires at least ${contract.minimumReferences.entryJavaScript} entry JavaScript reference${contract.minimumReferences.entryJavaScript === 1 ? '' : 's'}, found ${references.entryJavaScript}`,
      );
    }
    if (references.entryCss < contract.minimumReferences.entryCss) {
      throw new Error(
        `Startup asset "${contract.id}" requires at least ${contract.minimumReferences.entryCss} entry CSS reference${contract.minimumReferences.entryCss === 1 ? '' : 's'}, found ${references.entryCss}`,
      );
    }

    reports.push({
      id: contract.id,
      label: contract.label,
      source: contract.source,
      file: emittedFile,
      rawBytes: emittedContents.byteLength,
      references,
    });
  }
  return reports.sort((left, right) => left.id.localeCompare(right.id));
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
    // Rollup may emit a shared dynamic chunk without a source-keyed facade.
    // Resolve that source through the recorded module inventory, never a hashed name.
    const roots = graphConfig.roots.map((root) => {
      if (manifest[root]) return root;
      const chunks = inventory.chunks.filter((chunk) => chunk.modules.some((moduleId) => moduleId === root || moduleId.endsWith(`/${root}`)));
      if (!chunks.length) return root;
      const keys = Object.keys(manifest).filter((key) => chunks.some((chunk) => chunk.file === manifest[key]?.file));
      if (keys.length !== 1) throw new Error(`Critical graph "${graphConfig.id}" source "${root}" must resolve to exactly one chunk`);
      return keys[0]!;
    });
    const graph = collectManifestGraph(
      manifest,
      roots,
      `Critical graph "${graphConfig.id}"`,
    );
    graphs.set(graphConfig.id, graph);
    criticalBudgets.set(graphConfig.id, graphConfig.budget);
    criticalGraphs.push(await measureFiles(
      options.distDirectory,
      graphConfig.assetKind === 'javascript' ? graph.javascriptFiles
        : graphConfig.assetKind === 'stylesheet' ? graph.cssFiles
          : [...graph.javascriptFiles, ...graph.cssFiles],
      graphConfig.id,
      graphConfig.label,
    ));
  }
  criticalGraphs.sort(compareReports);

  const startupAssets: StartupAssetReport[] = [];
  for (const [graphId, graph] of graphs) {
    const assets = config.startupAssets.filter((asset) => (asset.referenceGraph ?? 'entry') === graphId);
    if (!assets.length) continue;
    startupAssets.push(...await validateStartupAssets(options.distDirectory, options.configPath, manifest, graph, assets));
  }
  startupAssets.sort((a, b) => a.id.localeCompare(b.id));

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
    startupAssets,
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

const formatStartupAsset = (report: StartupAssetReport): string => (
  `${report.label}: ${report.file}, ${report.rawBytes} raw bytes, references HTML ${report.references.html} / entry JS ${report.references.entryJavaScript} / entry CSS ${report.references.entryCss}`
);

export function formatWebBundleReport(report: WebBundleReport): string {
  const lines = [
    'Web bundle report',
    formatArtifact(report.entryJavaScript),
    formatArtifact(report.entryCss),
    ...[...report.criticalGraphs].sort(compareReports).map(formatArtifact),
    ...[...report.reportedModuleGroups].sort(compareReports).map(formatArtifact),
    ...[...report.routeChunks].sort(compareReports).map(formatArtifact),
    ...[...report.startupAssets]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(formatStartupAsset),
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
