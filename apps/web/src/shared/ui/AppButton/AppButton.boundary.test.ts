import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const sourceRoot = 'apps/web/src';
const appButtonFile = 'apps/web/src/shared/ui/AppButton/AppButton.tsx';
const nativeButtonOwners = new Set([
  'apps/web/src/features/Auth/AuthSurfaceBoundary.tsx',
  'apps/web/src/features/PublicGallery/ui/GalleryDateJumpHeading.tsx',
  'apps/web/src/features/PublicGallery/ui/GalleryDateMonthList.tsx',
  'apps/web/src/shared/ui/BaseGallery/BaseCard.tsx',
  'apps/web/src/shared/ui/SectionSwitcher/SectionSwitcher.tsx',
  'apps/web/src/widgets/SidePanel/CollectionsScopeSwitcher.tsx',
  'apps/web/src/widgets/SidePanel/FilterPills.tsx',
  'apps/web/src/widgets/SidePanel/ModeSwitcher.tsx',
  'apps/web/src/widgets/SidePanel/ScopeSwitcher.tsx',
  'apps/web/src/widgets/SidePanel/SidePanel.tsx',
]);

function listProductionTsxFiles(directory: string): string[] {
  if (directory === 'apps/web/src/test') return [];
  return readdirSync(directory).flatMap((entry) => {
    const file = path.join(directory, entry);
    if (statSync(file).isDirectory()) return listProductionTsxFiles(file);
    if (!file.endsWith('.tsx') || /\.(?:test|spec)\.tsx$/.test(file)) return [];
    return [file];
  });
}

function parse(file: string) {
  return ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function importsMantineButton(file: string) {
  return parse(file).statements.some((statement) => (
    ts.isImportDeclaration(statement)
    && ts.isStringLiteral(statement.moduleSpecifier)
    && statement.moduleSpecifier.text === '@mantine/core'
    && statement.importClause?.namedBindings
    && ts.isNamedImports(statement.importClause.namedBindings)
    && statement.importClause.namedBindings.elements.some(
      (element) => (element.propertyName?.text ?? element.name.text) === 'Button',
    )
  ));
}

function hasNativeButton(file: string) {
  let found = false;
  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
      && node.tagName.getText() === 'button'
    ) found = true;
    if (!found) ts.forEachChild(node, visit);
  };
  visit(parse(file));
  return found;
}

describe('AppButton ownership', () => {
  const productionFiles = listProductionTsxFiles(sourceRoot);

  it('is the only production module that imports Mantine Button', () => {
    const offenders = productionFiles.filter(
      (file) => file !== appButtonFile && importsMantineButton(file),
    );

    expect(offenders).toEqual([]);
  });

  it('keeps native buttons limited to specialized composite-control owners', () => {
    const offenders = productionFiles.filter(
      (file) => file !== appButtonFile && hasNativeButton(file) && !nativeButtonOwners.has(file),
    );

    expect(offenders).toEqual([]);
  });
});
