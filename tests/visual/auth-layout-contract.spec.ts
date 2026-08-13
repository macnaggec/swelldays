import { expect, test, type Locator, type Page } from '@playwright/test';

interface VisualViewportGeometry {
  readonly width: number;
  readonly height: number;
  readonly offsetLeft: number;
  readonly offsetTop: number;
}

async function installWritableVisualViewport(
  page: Page,
  initial: Pick<VisualViewportGeometry, 'width' | 'height'>,
): Promise<void> {
  await page.addInitScript((geometry) => {
    const visualViewport = new EventTarget();
    Object.defineProperties(visualViewport, {
      width: { configurable: true, value: geometry.width, writable: true },
      height: { configurable: true, value: geometry.height, writable: true },
      offsetLeft: { configurable: true, value: 0, writable: true },
      offsetTop: { configurable: true, value: 0, writable: true },
      pageLeft: { configurable: true, value: 0, writable: true },
      pageTop: { configurable: true, value: 0, writable: true },
      scale: { configurable: true, value: 1, writable: true },
      onresize: { configurable: true, value: null, writable: true },
      onscroll: { configurable: true, value: null, writable: true },
    });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: visualViewport,
    });
  }, initial);
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
      if (performance.now() > deadline) {
        throw new Error('Auth workspace geometry did not settle within 2 seconds.');
      }
    }
  });
}

async function openAuth(page: Page): Promise<Locator> {
  await page.goto('/__mobile-layout-contract.html?surface=auth');
  await page.getByRole('button', { name: 'Open sign in' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await waitForStableBox(dialog);
  return dialog;
}

async function expectBoxMatchesViewport(
  dialog: Locator,
  viewport: VisualViewportGeometry,
): Promise<void> {
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeCloseTo(viewport.offsetLeft, 1);
  expect(box!.y).toBeCloseTo(viewport.offsetTop, 1);
  expect(box!.width).toBeCloseTo(viewport.width, 1);
  expect(box!.height).toBeCloseTo(viewport.height, 1);
}

async function expectTouchBox(locator: Locator, label: string): Promise<void> {
  const box = await locator.boundingBox();
  expect(box, `${label} must be measurable`).not.toBeNull();
  expect(box!.width, `${label} width`).toBeGreaterThanOrEqual(44);
  expect(box!.height, `${label} height`).toBeGreaterThanOrEqual(44);
}

async function expectRounded(locator: Locator): Promise<void> {
  const radius = await locator.evaluate((element) => (
    Number.parseFloat(getComputedStyle(element).borderTopLeftRadius)
  ));
  expect(radius).toBeGreaterThan(0);
}

async function resolveColorToken(page: Page, token: string): Promise<string> {
  return page.evaluate((tokenName) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${tokenName})`;
    document.body.appendChild(probe);
    const resolvedColor = getComputedStyle(probe).color;
    probe.remove();
    return resolvedColor;
  }, token);
}

async function dispatchDownwardTouchGesture(surface: Locator): Promise<void> {
  await surface.dispatchEvent('pointerdown', {
    bubbles: true,
    button: 0,
    buttons: 1,
    clientX: 24,
    clientY: 80,
    isPrimary: true,
    pointerId: 7,
    pointerType: 'touch',
  });
  await surface.dispatchEvent('pointermove', {
    bubbles: true,
    button: 0,
    buttons: 1,
    clientX: 27,
    clientY: 120,
    isPrimary: true,
    pointerId: 7,
    pointerType: 'touch',
  });
  await surface.dispatchEvent('pointerup', {
    bubbles: true,
    button: 0,
    clientX: 27,
    clientY: 120,
    isPrimary: true,
    pointerId: 7,
    pointerType: 'touch',
  });
}

test.describe('auth mobile workspace', () => {
  test('fills the portrait visual viewport with one heading and reachable rounded controls', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installWritableVisualViewport(page, { width: 390, height: 844 });
    const dialog = await openAuth(page);

    await expect(dialog).toHaveCount(1);
    await expect(dialog.getByRole('heading', { name: 'Sign in to Swelldays' })).toBeVisible();
    await expect(dialog.getByRole('heading')).toHaveCount(1);
    await expectBoxMatchesViewport(dialog, {
      width: 390,
      height: 844,
      offsetLeft: 0,
      offsetTop: 0,
    });

    const heading = dialog.getByRole('heading');
    const scrollSurface = dialog.locator('[data-auth-scroll-surface]');
    const [headingBox, surfaceBox] = await Promise.all([
      heading.boundingBox(),
      scrollSurface.boundingBox(),
    ]);
    expect(headingBox).not.toBeNull();
    expect(surfaceBox).not.toBeNull();
    expect(surfaceBox!.y).toBeGreaterThanOrEqual(headingBox!.y + headingBox!.height);

    const email = dialog.getByRole('textbox', { name: 'Email' });
    const password = dialog.getByRole('textbox', { name: 'Password', exact: true });
    const passwordToggle = dialog.getByRole('button', { name: 'Toggle password visibility' });
    const submit = dialog.getByRole('button', { name: 'Sign in', exact: true });
    const register = dialog.getByRole('button', { name: 'Register' });
    const close = dialog.getByRole('button', { name: 'Close' });
    for (const [label, control] of [
      ['email', email],
      ['password', password],
      ['password toggle', passwordToggle],
      ['submit', submit],
      ['mode switch', register],
      ['close', close],
    ] as const) {
      await expect(control).toBeVisible();
      await expectTouchBox(control, label);
    }
    await expectRounded(email);
    await expectRounded(submit);

    const [submitPaint, accentColor, onAccentColor] = await Promise.all([
      submit.evaluate((element) => {
        const computed = getComputedStyle(element);
        return {
          backgroundColor: computed.backgroundColor,
          color: computed.color,
        };
      }),
      resolveColorToken(page, '--wa-accent-spot'),
      resolveColorToken(page, '--wa-text-on-accent'),
    ]);
    expect(submitPaint.backgroundColor).toBe(accentColor);
    expect(submitPaint.color).toBe(onAccentColor);

    const question = dialog.getByText("Don't have an account?", { exact: true });
    const [emailBox, submitBox, questionBox, registerBox] = await Promise.all([
      email.boundingBox(),
      submit.boundingBox(),
      question.boundingBox(),
      register.boundingBox(),
    ]);
    expect(emailBox).not.toBeNull();
    expect(submitBox).not.toBeNull();
    expect(questionBox).not.toBeNull();
    expect(registerBox).not.toBeNull();
    expect(Math.abs(submitBox!.width - emailBox!.width)).toBeLessThanOrEqual(1);

    const promptTop = Math.min(questionBox!.y, registerBox!.y);
    const promptLeft = Math.min(questionBox!.x, registerBox!.x);
    const promptRight = Math.max(
      questionBox!.x + questionBox!.width,
      registerBox!.x + registerBox!.width,
    );
    expect(promptTop).toBeGreaterThanOrEqual(submitBox!.y + submitBox!.height);
    expect(promptTop - (submitBox!.y + submitBox!.height)).toBeLessThanOrEqual(64);
    expect(registerBox!.x - (questionBox!.x + questionBox!.width)).toBeLessThanOrEqual(12);
    expect(Math.abs(
      (promptLeft + promptRight) / 2 - (emailBox!.x + emailBox!.width / 2),
    )).toBeLessThanOrEqual(1);
  });

  test('keeps the landscape header fixed while the single form surface scrolls', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await installWritableVisualViewport(page, { width: 844, height: 390 });
    const dialog = await openAuth(page);
    await dialog.getByRole('button', { name: 'Register' }).click();
    await expect(dialog.getByRole('heading', { name: 'Create your Swelldays account' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();

    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.y).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(844);
    expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(390);

    const heading = dialog.getByRole('heading');
    const scrollSurface = dialog.locator('[data-auth-scroll-surface]');
    await expect(scrollSurface).toHaveCount(1);
    const headerAlpha = await heading.evaluate((element) => {
      const backgroundColor = getComputedStyle(element.parentElement!).backgroundColor;
      const channels = backgroundColor.match(/[\d.]+/g)?.map(Number) ?? [];
      return channels.length === 4 ? channels[3] : 1;
    });
    expect(headerAlpha).toBe(1);
    const scrollGeometry = await scrollSurface.evaluate((element) => {
      if (!(element instanceof HTMLElement)) {
        throw new Error('Auth scroll surface must be an HTML element.');
      }
      const parent = element.parentElement!;
      const content = element.firstElementChild!;
      return {
        bodyClientHeight: parent.clientHeight,
        contentHeight: content.getBoundingClientRect().height,
        surfaceClientHeight: element.clientHeight,
        surfaceOffsetHeight: element.offsetHeight,
        surfaceScrollHeight: element.scrollHeight,
      };
    });
    expect(
      scrollGeometry.surfaceScrollHeight > scrollGeometry.surfaceClientHeight,
      JSON.stringify(scrollGeometry),
    ).toBe(true);
    const headerBoundsBefore = await heading.evaluate((element) => {
      const box = element.parentElement!.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom };
    });

    const nameField = dialog.getByRole('textbox', { name: 'Name' });
    await nameField.focus();
    await scrollSurface.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const headerBoundsAfter = await heading.evaluate((element) => {
      const box = element.parentElement!.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom };
    });
    expect(headerBoundsAfter).toEqual(headerBoundsBefore);
    await expect(nameField).toBeFocused();

    const lastField = dialog.getByRole('textbox', { name: 'Confirm password', exact: true });
    const submit = dialog.getByRole('button', { name: 'Register', exact: true });
    const [surfaceBox, lastFieldBox, submitBox] = await Promise.all([
      scrollSurface.boundingBox(),
      lastField.boundingBox(),
      submit.boundingBox(),
    ]);
    expect(surfaceBox).not.toBeNull();
    expect(lastFieldBox).not.toBeNull();
    expect(submitBox).not.toBeNull();
    expect(lastFieldBox!.y).toBeGreaterThanOrEqual(surfaceBox!.y);
    expect(submitBox!.y + submitBox!.height).toBeLessThanOrEqual(surfaceBox!.y + surfaceBox!.height);
  });

  test('tracks a reduced and offset visual viewport while keeping a focused field reachable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installWritableVisualViewport(page, { width: 390, height: 844 });
    const dialog = await openAuth(page);
    await dialog.getByRole('button', { name: 'Register' }).click();
    const confirmPassword = dialog.getByRole('textbox', { name: 'Confirm password', exact: true });
    await confirmPassword.focus();

    const reducedViewport = {
      width: 360,
      height: 420,
      offsetLeft: 14,
      offsetTop: 210,
    } as const;
    await page.evaluate((geometry) => {
      const viewport = window.visualViewport!;
      Object.defineProperties(viewport, {
        width: { configurable: true, value: geometry.width, writable: true },
        height: { configurable: true, value: geometry.height, writable: true },
        offsetLeft: { configurable: true, value: geometry.offsetLeft, writable: true },
        offsetTop: { configurable: true, value: geometry.offsetTop, writable: true },
      });
      viewport.dispatchEvent(new Event('resize'));
    }, reducedViewport);
    await expectBoxMatchesViewport(dialog, reducedViewport);

    await confirmPassword.evaluate((element) => {
      element.scrollIntoView({ block: 'center' });
    });
    const [headingBox, fieldBox] = await Promise.all([
      dialog.getByRole('heading').boundingBox(),
      confirmPassword.boundingBox(),
    ]);
    expect(headingBox).not.toBeNull();
    expect(fieldBox).not.toBeNull();
    expect(fieldBox!.y).toBeGreaterThanOrEqual(headingBox!.y + headingBox!.height);
    expect(fieldBox!.y + fieldBox!.height)
      .toBeLessThanOrEqual(reducedViewport.offsetTop + reducedViewport.height);
    await expect(confirmPassword).toBeFocused();
  });

  test('dismisses the keyboard gesture only from the form surface top boundary', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await installWritableVisualViewport(page, { width: 844, height: 390 });
    const dialog = await openAuth(page);
    await dialog.getByRole('button', { name: 'Register' }).click();
    const scrollSurface = dialog.locator('[data-auth-scroll-surface]');
    const nameField = dialog.getByRole('textbox', { name: 'Name' });

    await scrollSurface.evaluate((element) => { element.scrollTop = 0; });
    await nameField.focus();
    await dispatchDownwardTouchGesture(scrollSurface);
    await expect(nameField).not.toBeFocused();

    await nameField.focus();
    await scrollSurface.evaluate((element) => { element.scrollTop = 24; });
    expect(await scrollSurface.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await dispatchDownwardTouchGesture(scrollSurface);
    await expect(nameField).toBeFocused();
  });
});
