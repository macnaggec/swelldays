import { expect, test, type Locator, type Page } from '@playwright/test';

const EXPECTED_PX = {
  grabberGap: 8,
  sheetLeadingGap: 16,
  stackGap: 12,
  browserBottomOffset: 8,
  standaloneBottomOffset: 21,
} as const;

async function readPxToken(page: Page, token: string): Promise<number> {
  return page.evaluate((name) => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name);
    return Number.parseFloat(value);
  }, token);
}

async function expectToken(page: Page, token: string, expected: number): Promise<void> {
  expect(await readPxToken(page, token), token).toBe(expected);
}

async function waitForStableBox(locator: Locator): Promise<void> {
  await locator.evaluate(async (element) => {
    const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    let previous = '';
    let stableFrames = 0;
    const deadline = performance.now() + 2_000;

    while (stableFrames < 3) {
      await nextFrame();
      const box = element.getBoundingClientRect();
      const next = `${box.x},${box.y},${box.width},${box.height}`;
      stableFrames = next === previous ? stableFrames + 1 : 0;
      previous = next;
      if (performance.now() > deadline) throw new Error('Drawer geometry did not settle within 2 seconds.');
    }
  });
}

async function expectVerticalGap(
  upper: Locator,
  lower: Locator,
  expected: number,
  label: string,
): Promise<void> {
  const [upperBox, lowerBox] = await Promise.all([upper.boundingBox(), lower.boundingBox()]);
  expect(upperBox, `${label}: upper element must be measurable`).not.toBeNull();
  expect(lowerBox, `${label}: lower element must be measurable`).not.toBeNull();
  expect(lowerBox!.y - (upperBox!.y + upperBox!.height), label).toBeCloseTo(expected, 1);
}

async function expectGrabberGap(
  handle: Locator,
  lower: Locator,
  expected: number,
  label: string,
): Promise<void> {
  const [handleGeometry, lowerBox] = await Promise.all([
    handle.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const handleStyle = getComputedStyle(element);
      const grabberStyle = getComputedStyle(element, '::before');
      return {
        top: box.top,
        paddingTop: Number.parseFloat(handleStyle.paddingTop),
        grabberHeight: Number.parseFloat(grabberStyle.height),
      };
    }),
    lower.boundingBox(),
  ]);
  expect(lowerBox, `${label}: lower element must be measurable`).not.toBeNull();
  const grabberBottom = handleGeometry.top
    + handleGeometry.paddingTop
    + handleGeometry.grabberHeight;
  expect(lowerBox!.y - grabberBottom, label).toBeCloseTo(expected, 1);
}

function expectPhysicalGap(actual: number, expected: number, label: string): void {
  expect(Math.abs(actual - expected), `${label}: expected ${expected}px, received ${actual}px`)
    .toBeLessThanOrEqual(0.5);
}

async function openContract(page: Page, mode: 'browser' | 'standalone'): Promise<void> {
  await page.goto(`/__mobile-layout-contract.html?displayMode=${mode}`);
  await expect(page.locator('[data-mobile-layout-contract]')).toBeAttached();
  await expect(page.getByRole('complementary', { name: 'Content drawer' })).toBeVisible();
}

test.describe('approved mobile spacing rhythm', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const nativeMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query: string) => {
        if (query !== '(display-mode: standalone)') return nativeMatchMedia(query);
        const matches = new URLSearchParams(window.location.search).get('displayMode') === 'standalone';
        return {
          matches,
          media: query,
          onchange: null,
          addListener: () => { },
          removeListener: () => { },
          addEventListener: () => { },
          removeEventListener: () => { },
          dispatchEvent: () => false,
        };
      };
    });
  });

  test('keeps the shared 8/12/16px token contract', async ({ page }) => {
    await openContract(page, 'browser');

    await expectToken(page, '--wa-grabber-gap', EXPECTED_PX.grabberGap);
    await expectToken(page, '--wa-panel-stack-gap', EXPECTED_PX.stackGap);
    await expectToken(page, '--wa-browse-sheet-leading-gap', EXPECTED_PX.sheetLeadingGap);
  });

  test('keeps Peek geometry and browser-tab bottom clearance', async ({ page }) => {
    await openContract(page, 'browser');
    await page.getByRole('button', { name: 'Peek' }).click();

    const sheet = page.getByRole('complementary', { name: 'Content drawer' });
    const handle = sheet.locator('[data-drawer-sheet-handle]');
    const searchRow = sheet.locator('[data-panel-toolbar-primary]');
    await expect(sheet).toHaveAttribute('data-drawer-snap', 'peek');
    await expect(page.getByRole('navigation', { name: 'Browse sections' })).toHaveCount(0);
    await waitForStableBox(sheet);
    await expectGrabberGap(handle, searchRow, EXPECTED_PX.sheetLeadingGap, 'Peek grabber to search');

    const searchBox = await searchRow.boundingBox();
    expect(searchBox).not.toBeNull();
    const sheetBorderBottom = await sheet.evaluate((element) => (
      Number.parseFloat(getComputedStyle(element).borderBottomWidth)
    ));
    expect(
      page.viewportSize()!.height - (searchBox!.y + searchBox!.height) + sheetBorderBottom,
      'Peek search to browser viewport edge',
    ).toBeCloseTo(EXPECTED_PX.browserBottomOffset, 1);
  });

  test('keeps initial Half and Full stacks at 16/12/12px', async ({ page }) => {
    await openContract(page, 'browser');

    for (const snap of ['Half', 'Full'] as const) {
      await page.getByRole('button', { name: snap }).click();
      const sheet = page.getByRole('complementary', { name: 'Content drawer' });
      const handle = sheet.locator('[data-drawer-sheet-handle]');
      const searchRow = sheet.locator('[data-panel-toolbar-primary]');
      const pills = sheet.locator('[data-panel-toolbar-trailing]');
      const firstCard = sheet.locator('[data-contract-card]').first();

      await expect(sheet).toHaveAttribute('data-drawer-snap', snap.toLowerCase());
      await waitForStableBox(sheet);
      await expectGrabberGap(handle, searchRow, EXPECTED_PX.sheetLeadingGap, `${snap} grabber to search`);
      await expectVerticalGap(searchRow, pills, EXPECTED_PX.stackGap, `${snap} search to pills`);
      await expectVerticalGap(pills, firstCard, EXPECTED_PX.stackGap, `${snap} pills to first card`);
    }
  });

  test('keeps Gallery pills 12px above the first date content at Half and Full', async ({ page }) => {
    await openContract(page, 'browser');
    await page.getByRole('button', { name: 'Gallery state' }).click();

    for (const snap of ['Half', 'Full'] as const) {
      await page.getByRole('button', { name: snap }).click();
      const pills = page.locator('[data-panel-toolbar-trailing]');
      const firstDateContent = page.locator('[data-contract-gallery-first-content]');
      await expectVerticalGap(pills, firstDateContent, EXPECTED_PX.stackGap, `${snap} pills to Gallery date`);
    }
  });

  test('gives returning Feed search and Gallery date chrome an 8px top gap', async ({ page }) => {
    await openContract(page, 'browser');
    await page.getByRole('button', { name: 'Full' }).click();
    await page.getByRole('button', { name: 'Gallery state' }).click();

    const stickyChrome = page.locator('[data-panel-scroll-chrome]');
    const primary = stickyChrome.locator('[data-panel-scroll-chrome-primary]');
    const replacement = stickyChrome.locator('[data-panel-scroll-chrome-replacement]');

    await page.getByRole('button', { name: 'Scroll down' }).click();
    await expect(stickyChrome).toHaveAttribute('data-hidden', 'true');
    await expect(stickyChrome).toHaveAttribute('data-scrolled-from-top', 'true');
    await expect(replacement).not.toHaveAttribute('aria-hidden');
    await waitForStableBox(stickyChrome);

    const panelLayout = page.locator('[data-panel-layout]');
    const panelBox = await panelLayout.boundingBox();
    const replacementBox = await replacement.boundingBox();
    expect(panelBox).not.toBeNull();
    expect(replacementBox).not.toBeNull();
    expect(replacementBox!.y - panelBox!.y, 'Gallery date to sheet top').toBeCloseTo(8, 1);

    await page.getByRole('button', { name: 'Feed state' }).click();
    await page.getByRole('button', { name: 'Scroll up' }).click();
    await expect(stickyChrome).not.toHaveAttribute('data-hidden');
    await expect(stickyChrome).toHaveAttribute('data-scrolled-from-top', 'true');
    await waitForStableBox(stickyChrome);
    const returnedPanelBox = await panelLayout.boundingBox();
    const primaryBox = await primary.boundingBox();
    expect(returnedPanelBox).not.toBeNull();
    expect(primaryBox).not.toBeNull();
    expectPhysicalGap(
      primaryBox!.y - returnedPanelBox!.y,
      EXPECTED_PX.grabberGap,
      'Returning Feed search to sheet top',
    );
  });

  test('keeps browser and standalone navigation on their approved bottom offsets', async ({ page }) => {
    for (const [mode, expected] of [
      ['browser', EXPECTED_PX.browserBottomOffset],
      ['standalone', EXPECTED_PX.standaloneBottomOffset],
    ] as const) {
      await openContract(page, mode);
      const appRoot = page.locator('[data-app-display-mode]');
      const navigation = page.getByRole('navigation', { name: 'Browse sections' });
      await expect(appRoot).toHaveAttribute('data-app-display-mode', mode);
      await expect(navigation).toBeVisible();
      const box = await navigation.boundingBox();
      expect(box).not.toBeNull();
      expect(page.viewportSize()!.height - (box!.y + box!.height), `${mode} navigation bottom`)
        .toBeCloseTo(expected, 1);
    }
  });

  test('keeps standalone Peek on its 8/5/8px physical bottom stack', async ({ page }) => {
    await openContract(page, 'standalone');
    await page.getByRole('button', { name: 'Peek' }).click();
    const sheet = page.getByRole('complementary', { name: 'Content drawer' });
    const searchRow = sheet.locator('[data-panel-toolbar-primary]');
    await expect(sheet).toHaveAttribute('data-drawer-snap', 'peek');
    await waitForStableBox(sheet);

    const searchBox = await searchRow.boundingBox();
    expect(searchBox).not.toBeNull();
    const sheetBorderBottom = await sheet.evaluate((element) => (
      Number.parseFloat(getComputedStyle(element).borderBottomWidth)
    ));
    expectPhysicalGap(
      page.viewportSize()!.height - (searchBox!.y + searchBox!.height) + sheetBorderBottom,
      EXPECTED_PX.standaloneBottomOffset,
      'Standalone Peek search to physical bottom',
    );
  });

  test('keeps the landscape side-sheet stack and browser bottom navigation rhythm', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('/__mobile-layout-contract.html?displayMode=browser&presentation=sideOverlay');
    await expect(page.getByRole('complementary', { name: 'Content drawer' })).toBeVisible();

    const panel = page.locator('[data-panel-layout]');
    await expect(panel).toHaveAttribute('data-drawer-presentation', 'sideOverlay');
    const searchRow = panel.locator('[data-panel-toolbar-primary]');
    const pills = panel.locator('[data-panel-toolbar-trailing]');
    const firstCard = panel.locator('[data-contract-card]').first();
    await expectVerticalGap(searchRow, pills, EXPECTED_PX.stackGap, 'Landscape search to pills');
    await expectVerticalGap(pills, firstCard, EXPECTED_PX.stackGap, 'Landscape pills to first card');

    const navigation = page.getByRole('navigation', { name: 'Browse sections' });
    const navigationBox = await navigation.boundingBox();
    expect(navigationBox).not.toBeNull();
    expectPhysicalGap(
      page.viewportSize()!.height - (navigationBox!.y + navigationBox!.height),
      EXPECTED_PX.browserBottomOffset,
      'Landscape navigation to browser edge',
    );
  });

  test('keeps standalone landscape navigation on the same 8/5/8px bottom stack', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('/__mobile-layout-contract.html?displayMode=standalone&presentation=sideOverlay');
    const appRoot = page.locator('[data-app-display-mode]');
    const navigation = page.getByRole('navigation', { name: 'Browse sections' });
    await expect(appRoot).toHaveAttribute('data-app-display-mode', 'standalone');
    await expect(navigation).toBeVisible();
    const box = await navigation.boundingBox();
    expect(box).not.toBeNull();
    expectPhysicalGap(
      page.viewportSize()!.height - (box!.y + box!.height),
      EXPECTED_PX.standaloneBottomOffset,
      'Standalone landscape navigation to physical bottom',
    );
  });

  test('keeps landscape Upload content symmetric and its action substrate compact above the bottom chrome', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });

    for (const mode of ['browser', 'standalone'] as const) {
      await page.goto(
        `/__mobile-layout-contract.html?displayMode=${mode}&presentation=sideOverlay&surface=upload`,
      );

      const panel = page.locator('[data-panel-layout]');
      const spotSection = page.locator('[data-contract-upload-spot-section]');
      const footer = page.locator('[data-panel-layout-footer]');
      await expect(panel).toHaveAttribute('data-drawer-presentation', 'sideOverlay');

      const sectionPadding = await spotSection.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          left: Number.parseFloat(style.paddingLeft),
          right: Number.parseFloat(style.paddingRight),
        };
      });
      expect(sectionPadding, `${mode} landscape Upload content gutter`).toEqual({ left: 12, right: 12 });

      const [panelBox, footerBox, footerStyle] = await Promise.all([
        panel.boundingBox(),
        footer.boundingBox(),
        footer.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            backgroundColor: style.backgroundColor,
            borderRadius: Number.parseFloat(style.borderRadius),
            paddingLeft: Number.parseFloat(style.paddingLeft),
            paddingRight: Number.parseFloat(style.paddingRight),
          };
        }),
      ]);
      expect(panelBox).not.toBeNull();
      expect(footerBox).not.toBeNull();
      expect(footerBox!.width, `${mode} Cancel/Publish substrate width`).toBeLessThan(panelBox!.width);
      expect(footerStyle.paddingLeft, `${mode} Cancel/Publish left padding`).toBe(8);
      expect(footerStyle.paddingRight, `${mode} Cancel/Publish right padding`).toBe(8);
      expect(footerStyle.borderRadius, `${mode} Cancel/Publish rounded substrate`).toBeGreaterThan(0);
      expect(footerStyle.backgroundColor, `${mode} Cancel/Publish substrate fill`).not.toBe('rgba(0, 0, 0, 0)');
      expectPhysicalGap(
        page.viewportSize()!.height - (footerBox!.y + footerBox!.height),
        0,
        `${mode} landscape Cancel/Publish substrate to physical bottom`,
      );
    }
  });
});
