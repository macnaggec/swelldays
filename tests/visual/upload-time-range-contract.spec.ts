import { expect, test, type Locator } from '@playwright/test';

test('matches location, media, and calendar heights to the price-input reference', async ({ page }) => {
  await page.goto('/__mobile-layout-contract.html?displayMode=browser&surface=timeStep');
  const title = page.getByText('When did you shoot?');
  const spotInput = page.locator('[data-contract-height-spot]');
  const mediaStatus = page.locator('[data-contract-height-media] [data-upload-status]');
  const priceInput = page.locator('[data-contract-height-price] input').first();

  const [titleMetrics, indicatorMetrics, spotHeight, mediaHeight, priceMetrics] = await Promise.all([
    title.evaluate((element) => {
      return {
        height: element.getBoundingClientRect().height,
      };
    }),
    title.evaluate((element) => {
      const style = getComputedStyle(element, '::before');
      return {
        content: style.content,
        height: Number.parseFloat(style.height),
        radius: Number.parseFloat(style.borderStartStartRadius),
      };
    }),
    spotInput.evaluate((element) => element.getBoundingClientRect().height),
    mediaStatus.evaluate((element) => element.getBoundingClientRect().height),
    priceInput.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        height: element.getBoundingClientRect().height,
        radius: Number.parseFloat(style.borderStartStartRadius),
      };
    }),
  ]);

  expect(indicatorMetrics.content).not.toBe('none');
  expect(spotHeight).toBe(priceMetrics.height);
  expect(mediaHeight).toBe(priceMetrics.height);
  expect(indicatorMetrics.height).toBe(priceMetrics.height);
  expect(indicatorMetrics.height).toBeGreaterThan(titleMetrics.height);
  expect(indicatorMetrics.radius).toBe(priceMetrics.radius);
});

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
      if (performance.now() > deadline) throw new Error('Time-range geometry did not settle within 2 seconds.');
    }
  });
}

test('grows the time-range readout around a stable center without changing font metrics', async ({ page }) => {
  await page.goto('/__mobile-layout-contract.html?displayMode=browser&surface=timeStep');
  const contract = page.locator('[data-contract-time-step]');
  const readout = contract.locator('[data-time-range-readout]');
  const thumb = contract.getByRole('slider').first();
  await expect(readout).toBeVisible();
  await thumb.scrollIntoViewIfNeeded();
  await waitForStableBox(contract);

  const readFeedback = () => readout.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      centerY: box.top + box.height / 2,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      transform: style.transform,
    };
  });

  const rest = await readFeedback();
  const thumbBox = await thumb.boundingBox();
  expect(thumbBox).not.toBeNull();
  const x = thumbBox!.x + thumbBox!.width / 2;
  const y = thumbBox!.y + thumbBox!.height / 2;
  const browser = await page.context().newCDPSession(page);
  await browser.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y }],
  });
  await browser.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: x + 40, y }],
  });
  await expect.poll(async () => {
    const active = await readFeedback();
    return active.fontSize !== rest.fontSize
      || active.fontWeight !== rest.fontWeight
      || active.transform !== rest.transform;
  }).toBe(true);
  const active = await readFeedback();

  await browser.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  expect(active.centerY, 'the range readout grows around its resting center').toBeCloseTo(rest.centerY, 1);
  expect(active.fontSize, 'font metrics stay fixed so mobile cannot reposition the text').toBe(rest.fontSize);
  expect(active.fontWeight, 'font metrics stay fixed so mobile cannot reposition the text').toBe(rest.fontWeight);
  expect(active.transform, 'the grow feedback is compositor-only').not.toBe(rest.transform);
});
