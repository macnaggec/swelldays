import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { build } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { createBundleModuleInventoryPlugin } from './bundleBudget';

const webDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryDirectory = resolve(webDirectory, '../..');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

const lintImport = async (statement: string) => {
  const eslint = new ESLint({ cwd: repositoryDirectory });
  const [result] = await eslint.lintText(statement, {
    filePath: join(webDirectory, 'src/contracts-public-entry-fixture.ts'),
  });
  if (!result) throw new Error('ESLint returned no result for the contracts import fixture');
  return result.messages.filter((message) => message.ruleId === 'no-restricted-imports');
};

describe('contracts import policy', () => {
  it.each([
    "import { MEDIA_STATUS } from '@swelldays/contracts/core'; void MEDIA_STATUS;",
    "import { createCheckoutSchema } from '@swelldays/contracts/validation/checkout'; void createCheckoutSchema;",
    "import { mediaUpdateSchema } from '@swelldays/contracts/validation/media'; void mediaUpdateSchema;",
    "import { spotNameSchema } from '@swelldays/contracts/validation/spot'; void spotNameSchema;",
    "import { beginLocalSchema } from '@swelldays/contracts/validation/upload'; void beginLocalSchema;",
    "import type { LngLat } from '@swelldays/contracts'; const point: LngLat = [0, 0]; void point;",
  ])('accepts a documented public import: %s', async (statement) => {
    expect(await lintImport(statement)).toEqual([]);
  });

  it.each([
    "import { MEDIA_STATUS } from '@swelldays/contracts'; void MEDIA_STATUS;",
    "import { MEDIA_STATUS } from '@swelldays/contracts/src/index'; void MEDIA_STATUS;",
    "import { MEDIA_STATUS } from '@swelldays/contracts/constants/media'; void MEDIA_STATUS;",
    "import { mediaUpdateSchema } from '@swelldays/contracts/validation/mediaSchemas'; void mediaUpdateSchema;",
    "import { unknownSchema } from '@swelldays/contracts/validation/unknown'; void unknownSchema;",
  ])('rejects an undocumented browser runtime import: %s', async (statement) => {
    expect(await lintImport(statement)).toHaveLength(1);
  });
});

describe('contracts core production graph', () => {
  it('contains neither Zod nor contracts validation modules', async () => {
    const directory = await mkdtemp(join(webDirectory, '.contracts-core-fixture-'));
    temporaryDirectories.push(directory);
    const distDirectory = join(directory, 'dist');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'index.html'), '<script type="module" src="/entry.ts"></script>\n');
    await writeFile(join(directory, 'entry.ts'), [
      "import { MEDIA_STATUS } from '@swelldays/contracts/core';",
      "document.body.dataset.status = MEDIA_STATUS.PUBLISHED;",
      '',
    ].join('\n'));

    await build({
      root: directory,
      logLevel: 'silent',
      plugins: [createBundleModuleInventoryPlugin(directory)],
      build: { outDir: distDirectory, emptyOutDir: true },
    });

    const inventory: unknown = JSON.parse(await readFile(
      join(distDirectory, '.vite/bundle-modules.json'),
      'utf8',
    ));
    if (
      typeof inventory !== 'object'
      || inventory === null
      || !('chunks' in inventory)
      || !Array.isArray(inventory.chunks)
    ) {
      throw new Error('Vite emitted an invalid contracts fixture module inventory');
    }
    const entryModules = inventory.chunks
      .flatMap((chunk): string[] => {
        if (
          typeof chunk !== 'object'
          || chunk === null
          || !('isEntry' in chunk)
          || !('modules' in chunk)
          || !Array.isArray(chunk.modules)
        ) {
          throw new Error('Vite emitted an invalid contracts fixture chunk inventory');
        }
        if (chunk.isEntry !== true) return [];
        return chunk.modules.filter((moduleId: unknown): moduleId is string => typeof moduleId === 'string');
      });

    expect(entryModules.some((moduleId) => moduleId.includes('node_modules/zod/'))).toBe(false);
    expect(entryModules.some((moduleId) => moduleId.includes('packages/contracts/src/validation/'))).toBe(false);
  });
});
