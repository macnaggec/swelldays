import { expect, test, type Locator, type Page } from '@playwright/test';

const EXPECTED_PX = {
  grabberGap: 8,
  sheetLeadingGap: 8,
  stackGap: 12,
  scopeSwitcherGap: 4,
  sideOverlayFooterPhysicalGap: 7,
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

async function expectCornerOverhangVisible(
  outer: Locator,
  inner: Locator,
  label: string,
): Promise<void> {
  const [outerBox, innerBox, innerStyle] = await Promise.all([
    outer.boundingBox(),
    inner.boundingBox(),
    inner.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        display: style.display,
        visibility: style.visibility,
        opacity: Number.parseFloat(style.opacity),
        top: Number.parseFloat(style.top),
        right: Number.parseFloat(style.right),
      };
    }),
  ]);

  expect(outerBox, `${label}: outer element must be measurable`).not.toBeNull();
  expect(innerBox, `${label}: inner element must be measurable`).not.toBeNull();
  expect(innerStyle.display, `${label}: indicator must be displayed`).not.toBe('none');
  expect(innerStyle.visibility, `${label}: indicator must be visible`).not.toBe('hidden');
  expect(innerStyle.opacity, `${label}: indicator must be painted`).toBeGreaterThan(0);
  expect(innerStyle.top, `${label}: original top offset`).toBe(-3);
  expect(innerStyle.right, `${label}: original right offset`).toBe(-3);
  expect(innerBox!.y, `${label}: top edge must overhang the button border`).toBeLessThan(outerBox!.y);
  expect(innerBox!.x + innerBox!.width, `${label}: original right overhang`)
    .toBeGreaterThan(outerBox!.x + outerBox!.width);

  const overhangingPixelIsPainted = await inner.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const hits = document.elementsFromPoint(box.x + box.width / 2 - 1, box.y + 1);
    return hits.some((hit) => hit === element || element.contains(hit));
  });
  expect(overhangingPixelIsPainted, `${label}: overhanging pixel must escape ancestor clipping`)
    .toBe(true);
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

  test('keeps the approved shared 8/12/8px token contract', async ({ page }) => {
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

  test('keeps initial Half and Full stacks at 8/12/12px', async ({ page }) => {
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

  test('keeps the unfinished-upload indicator on its original visible corner overhang at every Browse snap', async ({ page }) => {
    await openContract(page, 'browser');

    for (const snap of ['Peek', 'Half', 'Full'] as const) {
      await page.getByRole('button', { name: snap }).click();
      const sheet = page.getByRole('complementary', { name: 'Content drawer' });
      const uploadAction = sheet.getByRole('button', { name: 'Upload' });
      const indicator = uploadAction.locator('[data-panel-route-action-indicator]');

      await expect(sheet).toHaveAttribute('data-drawer-snap', snap.toLowerCase());
      await waitForStableBox(sheet);
      await expectCornerOverhangVisible(uploadAction, indicator, `${snap} Upload indicator`);
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

  test('eases Feed chrome through its final return without changing layout height', async ({ page }) => {
    await openContract(page, 'browser');
    await page.getByRole('button', { name: 'Full' }).click();

    const stickyChrome = page.locator('[data-panel-scroll-chrome]');
    const scrollOwner = page.locator('[data-panel-scroll-owner]');

    await page.getByRole('button', { name: 'Scroll down' }).click();
    await expect(stickyChrome).toHaveAttribute('data-hidden', 'true');
    await page.getByRole('button', { name: 'Scroll up' }).click();
    await expect(stickyChrome).not.toHaveAttribute('data-hidden');
    await expect(stickyChrome).toHaveAttribute('data-scrolled-from-top', 'true');
    await waitForStableBox(stickyChrome);

    const returningHeight = await stickyChrome.evaluate((element) => {
      if (!(element instanceof HTMLElement)) throw new Error('Panel chrome must be an HTML element.');
      return element.offsetHeight;
    });
    await scrollOwner.evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await expect(stickyChrome).not.toHaveAttribute('data-scrolled-from-top');

    const finalReturn = await stickyChrome.evaluate((element) => {
      if (!(element instanceof HTMLElement)) throw new Error('Panel chrome must be an HTML element.');
      return {
        height: element.offsetHeight,
        hasRunningTranslateTransition: element.getAnimations().some((animation) => (
          animation instanceof CSSTransition
          && animation.transitionProperty === 'translate'
          && animation.playState === 'running'
        )),
      };
    });
    expect(finalReturn.height, 'final return must not resize the chrome row').toBe(returningHeight);
    expect(finalReturn.hasRunningTranslateTransition, 'final 8px return must use the chrome motion')
      .toBe(true);
  });

  test('keeps the full-screen Collections selector at one top position when returning from below', async ({ page }) => {
    await page.goto(
      '/__mobile-layout-contract.html?displayMode=browser&presentation=fullScreen&surface=collections',
    );
    const stickyChrome = page.locator('[data-panel-scroll-chrome]');
    const selector = page.locator('[data-contract-collection-selector]');
    const scrollOwner = page.locator('[data-panel-scroll-owner]');
    await expect(selector).toBeVisible();
    await waitForStableBox(stickyChrome);

    const readGeometry = async () => ({
      chromeHeight: await stickyChrome.evaluate((element) => (
        element instanceof HTMLElement ? element.offsetHeight : Number.NaN
      )),
      reservedHeight: await scrollOwner.evaluate((element) => (
        Number.parseFloat(getComputedStyle(element).paddingTop)
      )),
      selectorTop: (await selector.boundingBox())?.y ?? Number.NaN,
      firstCardTop: (await page.locator('[data-contract-card]').first().boundingBox())?.y
        ?? Number.NaN,
    });
    const initial = await readGeometry();

    await scrollOwner.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await expect(stickyChrome).toHaveAttribute('data-hidden', 'true');
    await scrollOwner.evaluate((element) => {
      element.scrollTop = 1;
      element.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await expect(stickyChrome).not.toHaveAttribute('data-hidden');
    await expect(stickyChrome).toHaveAttribute('data-scrolled-from-top', 'true');
    await waitForStableBox(stickyChrome);
    const returned = await readGeometry();

    expect(returned.chromeHeight, 'the selector row must not resize after returning upward')
      .toBe(initial.chromeHeight);
    expect(returned.reservedHeight, 'the first-card top reservation must remain stable')
      .toBe(initial.reservedHeight);
    expectPhysicalGap(
      returned.selectorTop - initial.selectorTop,
      0,
      'returned Collections selector top movement',
    );
    expectPhysicalGap(
      initial.firstCardTop - returned.firstCardTop,
      1,
      'first collection card response to the remaining 1px scroll offset',
    );
  });

  test('clips returning panel chrome below a fixed panel header', async ({ page }) => {
    await openContract(page, 'browser');
    await page.getByRole('button', { name: 'Full' }).click();

    const panelLayout = page.locator('[data-panel-layout]');
    await panelLayout.evaluate((element) => {
      const header = document.createElement('div');
      header.dataset.panelLayoutHeader = '';
      header.style.flex = '0 0 36px';
      element.insertBefore(header, element.firstChild);
    });

    const header = panelLayout.locator(':scope > [data-panel-layout-header]');
    const chromeViewport = panelLayout.locator('[data-panel-scroll-chrome]').locator('..');
    const [headerBox, chromeViewportBox] = await Promise.all([
      header.boundingBox(),
      chromeViewport.boundingBox(),
    ]);
    expect(headerBox, 'fixed panel header must be measurable').not.toBeNull();
    expect(chromeViewportBox, 'chrome clipping viewport must be measurable').not.toBeNull();
    expect(
      chromeViewportBox!.y,
      'returning search and filters must stay clipped below the header',
    ).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height - 0.5);
  });

  test('keeps the approved 4px above and below the Feed/Gallery switcher in compact and expanded panels', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    for (const panelState of ['compact', 'expanded'] as const) {
      await page.goto(
        `/__mobile-layout-contract.html?displayMode=browser&presentation=persistent&header=scope&panelState=${panelState}`,
      );

      const header = page.locator('[data-panel-layout-header]');
      const switcher = page.getByRole('group', { name: 'Content scope' });
      await waitForStableBox(header);
      const [headerBox, switcherBox] = await Promise.all([
        header.boundingBox(),
        switcher.boundingBox(),
      ]);
      expect(headerBox, `${panelState} header must be measurable`).not.toBeNull();
      expect(switcherBox, `${panelState} switcher must be measurable`).not.toBeNull();
      expectPhysicalGap(
        switcherBox!.y - headerBox!.y,
        EXPECTED_PX.scopeSwitcherGap,
        `${panelState} switcher top gap`,
      );
      expectPhysicalGap(
        headerBox!.y + headerBox!.height - (switcherBox!.y + switcherBox!.height),
        EXPECTED_PX.scopeSwitcherGap,
        `${panelState} switcher bottom gap`,
      );
    }
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

  test('squares portrait workspace edges and rounds only the exposed landscape edge', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/__mobile-layout-contract.html?displayMode=browser&presentation=fullScreen');

    const portraitDrawer = page.getByRole('complementary', { name: 'Content drawer' });
    await expect(portraitDrawer).toHaveAttribute('data-drawer-presentation', 'fullScreen');
    const portraitRadii = await portraitDrawer.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        topLeft: style.borderTopLeftRadius,
        topRight: style.borderTopRightRadius,
        bottomRight: style.borderBottomRightRadius,
        bottomLeft: style.borderBottomLeftRadius,
      };
    });
    expect(portraitRadii).toEqual({
      topLeft: '0px',
      topRight: '0px',
      bottomRight: '0px',
      bottomLeft: '0px',
    });

    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('/__mobile-layout-contract.html?displayMode=browser&presentation=sideWorkspace');

    const landscapeDrawer = page.getByRole('complementary', { name: 'Content drawer' });
    await expect(landscapeDrawer).toHaveAttribute('data-drawer-presentation', 'sideWorkspace');
    const landscapeRadii = await landscapeDrawer.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        topLeft: style.borderTopLeftRadius,
        topRight: style.borderTopRightRadius,
        bottomRight: style.borderBottomRightRadius,
        bottomLeft: style.borderBottomLeftRadius,
      };
    });
    const panelRadiusPx = await readPxToken(page, '--wa-radius-panel');
    expect(landscapeRadii).toEqual({
      topLeft: `${panelRadiusPx}px`,
      topRight: '0px',
      bottomRight: '0px',
      bottomLeft: `${panelRadiusPx}px`,
    });
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
        EXPECTED_PX.sideOverlayFooterPhysicalGap,
        `${mode} landscape Cancel/Publish substrate to side-panel bottom`,
      );
    }
  });

  test('floors the tablet side overlay at 360px and keeps it inside the viewport at 768x1024', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/__mobile-layout-contract.html?displayMode=browser&presentation=sideOverlay');

    const drawer = page.getByRole('complementary', { name: 'Content drawer' });
    await expect(drawer).toHaveAttribute('data-drawer-presentation', 'sideOverlay');
    await waitForStableBox(drawer);

    const drawerBox = await drawer.boundingBox();
    expect(drawerBox, 'drawer must be measurable').not.toBeNull();
    expectPhysicalGap(drawerBox!.width, 360, '768px constrained/regular drawer width (floored)');
    expect(
      drawerBox!.x + drawerBox!.width,
      'drawer right edge must not overflow the viewport',
    ).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);
  });

  test('leaves the tablet side overlay unfloored and inside the viewport at 1199x900', async ({ page }) => {
    await page.setViewportSize({ width: 1199, height: 900 });
    await page.goto('/__mobile-layout-contract.html?displayMode=browser&presentation=sideOverlay');

    const drawer = page.getByRole('complementary', { name: 'Content drawer' });
    await expect(drawer).toHaveAttribute('data-drawer-presentation', 'sideOverlay');
    await waitForStableBox(drawer);

    const drawerBox = await drawer.boundingBox();
    expect(drawerBox, 'drawer must be measurable').not.toBeNull();
    expectPhysicalGap(drawerBox!.width, 1199 * 0.45, '1199px constrained/regular drawer width (unfloored)');
    expect(
      drawerBox!.x + drawerBox!.width,
      'drawer right edge must not overflow the viewport',
    ).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);
  });

  test('keeps the search, Upload, and filter-pills chrome inside the tablet side overlay bounds', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/__mobile-layout-contract.html?displayMode=browser&presentation=sideOverlay');

    const drawer = page.getByRole('complementary', { name: 'Content drawer' });
    await expect(drawer).toHaveAttribute('data-drawer-presentation', 'sideOverlay');
    await waitForStableBox(drawer);

    const searchRow = drawer.locator('[data-panel-toolbar-primary]');
    const uploadAction = drawer.getByRole('button', { name: 'Upload' });
    const pills = drawer.locator('[data-panel-toolbar-trailing]');

    const [drawerBox, searchBox, uploadBox, pillsBox] = await Promise.all([
      drawer.boundingBox(),
      searchRow.boundingBox(),
      uploadAction.boundingBox(),
      pills.boundingBox(),
    ]);
    expect(drawerBox, 'drawer must be measurable').not.toBeNull();

    for (const [label, box] of [
      ['search row', searchBox],
      ['Upload action', uploadBox],
      ['filter pills', pillsBox],
    ] as const) {
      expect(box, `${label} must be measurable`).not.toBeNull();
      expect(
        box!.x,
        `${label} left edge must not extend past the drawer's own left edge`,
      ).toBeGreaterThanOrEqual(drawerBox!.x - 0.5);
      expect(
        box!.x + box!.width,
        `${label} right edge must not overflow the viewport`,
      ).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);
    }
  });

  test('keeps the tablet side overlay gallery date-jump chrome inside the drawer bounds', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/__mobile-layout-contract.html?displayMode=browser&presentation=sideOverlay');
    await page.getByRole('button', { name: 'Gallery state' }).click();
    // The date-jump control shares the pinned chrome slot with the search row (M03-h):
    // it replaces the search row only once scrolled, exactly like every other sticky
    // chrome replacement in this contract (see "gives returning Feed search and Gallery
    // date chrome an 8px top gap" above) — scroll down to reach it before measuring it.
    await page.getByRole('button', { name: 'Scroll down' }).click();

    const drawer = page.getByRole('complementary', { name: 'Content drawer' });
    await expect(drawer).toHaveAttribute('data-drawer-presentation', 'sideOverlay');
    await waitForStableBox(drawer);

    const dateJump = page.getByRole('button', { name: 'Jump to date' });
    const [drawerBox, dateJumpBox] = await Promise.all([
      drawer.boundingBox(),
      dateJump.boundingBox(),
    ]);
    expect(drawerBox, 'drawer must be measurable').not.toBeNull();
    expect(dateJumpBox, 'date-jump control must be measurable').not.toBeNull();
    expect(
      dateJumpBox!.x,
      'date-jump control left edge must not extend past the drawer\'s own left edge',
    ).toBeGreaterThanOrEqual(drawerBox!.x - 0.5);
    expect(
      dateJumpBox!.x + dateJumpBox!.width,
      'date-jump control right edge must not overflow the drawer',
    ).toBeLessThanOrEqual(drawerBox!.x + drawerBox!.width + 0.5);
  });
});
