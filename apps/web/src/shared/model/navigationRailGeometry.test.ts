import { describe, expect, it, vi } from 'vitest';
import {
  getNavigationRailGeometrySnapshot,
  publishNavigationRailGeometry,
  subscribeNavigationRailGeometry,
} from './navigationRailGeometry';

describe('navigationRailGeometry', () => {
  it('notifies subscribers when a rect is published', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeNavigationRailGeometry(listener);

    publishNavigationRailGeometry(DOMRectReadOnly.fromRect({ x: 0, y: 0, width: 60, height: 800 }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getNavigationRailGeometrySnapshot()).toEqual({
      left: 0,
      top: 0,
      right: 60,
      bottom: 800,
      width: 60,
      height: 800,
    });

    unsubscribe();
    publishNavigationRailGeometry(null);
  });

  it('does not notify when publishing an equal rect by value', () => {
    const listener = vi.fn();
    publishNavigationRailGeometry(DOMRectReadOnly.fromRect({ x: 0, y: 0, width: 60, height: 800 }));
    const unsubscribe = subscribeNavigationRailGeometry(listener);

    publishNavigationRailGeometry(DOMRectReadOnly.fromRect({ x: 0, y: 0, width: 60, height: 800 }));

    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
    publishNavigationRailGeometry(null);
  });

  it('notifies and returns the snapshot to null once a real rect is cleared', () => {
    publishNavigationRailGeometry(DOMRectReadOnly.fromRect({ x: 0, y: 0, width: 60, height: 800 }));
    const listener = vi.fn();
    const unsubscribe = subscribeNavigationRailGeometry(listener);

    publishNavigationRailGeometry(null);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getNavigationRailGeometrySnapshot()).toBeNull();

    unsubscribe();
  });
});
