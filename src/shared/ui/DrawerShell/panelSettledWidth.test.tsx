import { Profiler, useRef, type ReactNode } from 'react';
import { act } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'test/setup/render';
import { publishDrawerGeometry } from './geometry';
import { PanelSettledWidthContext, useLivePanelWidthOnElement } from './panelSettledWidth';

function LiveWidthProbe({ measuredWidth }: { measuredWidth: number }) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  useLivePanelWidthOnElement(measuredWidth, elementRef);
  return <div ref={elementRef} data-testid="live-width-el" />;
}

// React's own render-counting primitive: `onRender` fires from the commit phase, not
// render itself, so it can count renders without the component under test having to
// touch a ref or module-level variable during render (both are treated as impure).
function withRenderCounter(node: ReactNode, counter: { count: number }) {
  return (
    <Profiler id="live-width-probe" onRender={() => { counter.count += 1; }}>
      {node}
    </Profiler>
  );
}

const atRest = (destinationWidth: number, children: React.ReactNode) => (
  <PanelSettledWidthContext.Provider value={{ destinationWidth, transitioning: false }}>
    {children}
  </PanelSettledWidthContext.Provider>
);

const transitioningTo = (destinationWidth: number, children: React.ReactNode) => (
  <PanelSettledWidthContext.Provider value={{ destinationWidth, transitioning: true }}>
    {children}
  </PanelSettledWidthContext.Provider>
);

describe('useLivePanelWidthOnElement', () => {
  afterEach(() => {
    publishDrawerGeometry(null);
  });

  it('applies the live geometry width to the element without re-rendering its caller', () => {
    const counter = { count: 0 };

    // At rest: 320px measured against a 320px destination captures a zero inset,
    // matching a wrapper with no surrounding padding.
    const { container, rerender } = render(
      withRenderCounter(atRest(320, <LiveWidthProbe measuredWidth={320} />), counter),
    );
    const el = () => container.querySelector('[data-testid="live-width-el"]') as HTMLDivElement;
    expect(el().style.width).toBe('');

    // The toggle starts, heading to 960px. The surface has not moved yet.
    rerender(withRenderCounter(transitioningTo(960, <LiveWidthProbe measuredWidth={320} />), counter));
    const renderCountAtTransitionStart = counter.count;

    act(() => publishDrawerGeometry(DOMRect.fromRect({ width: 500, height: 0, x: 0, y: 0 })));
    expect(el().style.width).toBe('500px');

    act(() => publishDrawerGeometry(DOMRect.fromRect({ width: 700, height: 0, x: 0, y: 0 })));
    expect(el().style.width).toBe('700px');

    act(() => publishDrawerGeometry(DOMRect.fromRect({ width: 960, height: 0, x: 0, y: 0 })));
    expect(el().style.width).toBe('960px');

    // The whole point: three geometry publishes moved the DOM width three times without
    // the component itself re-rendering even once — the cost this hook exists to avoid.
    expect(counter.count).toBe(renderCountAtTransitionStart);
  });

  it('subtracts the inset captured at rest, not the raw surface width', () => {
    // A 40px inset (e.g. panel padding beside the measured element).
    const { container, rerender } = render(atRest(360, <LiveWidthProbe measuredWidth={320} />));
    rerender(transitioningTo(600, <LiveWidthProbe measuredWidth={320} />));

    const el = () => container.querySelector('[data-testid="live-width-el"]') as HTMLDivElement;
    act(() => publishDrawerGeometry(DOMRect.fromRect({ width: 600, height: 0, x: 0, y: 0 })));
    expect(el().style.width).toBe('560px');
  });

  it('clears the inline width once the transition settles', () => {
    const { container, rerender } = render(atRest(320, <LiveWidthProbe measuredWidth={320} />));
    rerender(transitioningTo(960, <LiveWidthProbe measuredWidth={320} />));

    const el = () => container.querySelector('[data-testid="live-width-el"]') as HTMLDivElement;
    act(() => publishDrawerGeometry(DOMRect.fromRect({ width: 700, height: 0, x: 0, y: 0 })));
    expect(el().style.width).toBe('700px');

    rerender(atRest(960, <LiveWidthProbe measuredWidth={960} />));
    expect(el().style.width).toBe('');
  });
});
