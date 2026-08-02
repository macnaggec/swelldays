import { Profiler, useRef, type ReactNode } from 'react';
import { act } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'test/setup/render';
import { publishDrawerGeometry } from './geometry';
import { PanelSettledWidthContext, useLivePanelScaleOnElement } from './panelSettledWidth';

function LiveScaleProbe({ measuredWidth, scaleBasisWidth }: { measuredWidth: number; scaleBasisWidth: number }) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  useLivePanelScaleOnElement(measuredWidth, scaleBasisWidth, elementRef);
  return <div ref={elementRef} data-testid="live-scale-el" />;
}

// React's own render-counting primitive: `onRender` fires from the commit phase, not
// render itself, so it can count renders without the component under test having to
// touch a ref or module-level variable during render (both are treated as impure).
function withRenderCounter(node: ReactNode, counter: { count: number }) {
  return (
    <Profiler id="live-scale-probe" onRender={() => { counter.count += 1; }}>
      {node}
    </Profiler>
  );
}

const atRest = (destinationWidth: number, children: React.ReactNode) => (
  <PanelSettledWidthContext.Provider value={{ destinationWidth, open: true, transitioning: false }}>
    {children}
  </PanelSettledWidthContext.Provider>
);

const transitioningTo = (destinationWidth: number, children: React.ReactNode) => (
  <PanelSettledWidthContext.Provider value={{ destinationWidth, open: true, transitioning: true }}>
    {children}
  </PanelSettledWidthContext.Provider>
);

describe('useLivePanelScaleOnElement', () => {
  afterEach(() => {
    publishDrawerGeometry(null);
  });

  it('applies the live geometry width as a scale factor without re-rendering its caller', () => {
    const counter = { count: 0 };

    // At rest: 320px measured against a 320px destination captures a zero inset,
    // matching an element with no surrounding padding.
    const { container, rerender } = render(
      withRenderCounter(atRest(320, <LiveScaleProbe measuredWidth={320} scaleBasisWidth={320} />), counter),
    );
    const el = () => container.querySelector('[data-testid="live-scale-el"]') as HTMLDivElement;
    expect(el().style.transform).toBe('');

    // The toggle starts, heading to 960px — the caller's own settled content width for
    // that destination. The surface has not moved yet.
    rerender(withRenderCounter(
      transitioningTo(960, <LiveScaleProbe measuredWidth={320} scaleBasisWidth={960} />),
      counter,
    ));
    const renderCountAtTransitionStart = counter.count;

    act(() => publishDrawerGeometry(DOMRect.fromRect({ width: 480, height: 0, x: 0, y: 0 })));
    expect(el().style.transform).toBe('scale(0.5)');

    act(() => publishDrawerGeometry(DOMRect.fromRect({ width: 720, height: 0, x: 0, y: 0 })));
    expect(el().style.transform).toBe('scale(0.75)');

    act(() => publishDrawerGeometry(DOMRect.fromRect({ width: 960, height: 0, x: 0, y: 0 })));
    expect(el().style.transform).toBe('scale(1)');

    // The whole point: three geometry publishes moved the rendered scale three times
    // without the component itself re-rendering even once — the cost this hook exists
    // to avoid, since a `width`-driven re-render would force the browser to re-run
    // layout for the caller's entire subtree on every one of those frames.
    expect(counter.count).toBe(renderCountAtTransitionStart);
  });

  it('subtracts the inset captured at rest, not the raw surface width', () => {
    // A 40px inset (e.g. panel padding beside the measured element).
    const { container, rerender } = render(
      atRest(320, <LiveScaleProbe measuredWidth={280} scaleBasisWidth={280} />),
    );
    rerender(transitioningTo(600, <LiveScaleProbe measuredWidth={280} scaleBasisWidth={560} />));

    const el = () => container.querySelector('[data-testid="live-scale-el"]') as HTMLDivElement;
    // Live surface width 320px minus the 40px inset is 280px of live content width —
    // half of the 560px destination content width the element is laid out for.
    act(() => publishDrawerGeometry(DOMRect.fromRect({ width: 320, height: 0, x: 0, y: 0 })));
    expect(el().style.transform).toBe('scale(0.5)');
  });

  it('clears the transform once the transition settles', () => {
    const { container, rerender } = render(
      atRest(320, <LiveScaleProbe measuredWidth={320} scaleBasisWidth={320} />),
    );
    rerender(transitioningTo(960, <LiveScaleProbe measuredWidth={320} scaleBasisWidth={960} />));

    const el = () => container.querySelector('[data-testid="live-scale-el"]') as HTMLDivElement;
    act(() => publishDrawerGeometry(DOMRect.fromRect({ width: 480, height: 0, x: 0, y: 0 })));
    expect(el().style.transform).toBe('scale(0.5)');

    rerender(atRest(960, <LiveScaleProbe measuredWidth={960} scaleBasisWidth={960} />));
    expect(el().style.transform).toBe('');
  });
});
