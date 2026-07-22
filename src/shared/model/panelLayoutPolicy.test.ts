import { describe, expect, it } from 'vitest';
import { deriveRenderedPanelState } from './panelLayoutPolicy';

describe('deriveRenderedPanelState', () => {
  it('waits for feed layout readiness before collapsing from an expanded render', () => {
    expect(deriveRenderedPanelState({
      targetExpanded: false,
      targetReason: 'browse',
      isFeedLayoutReady: false,
      canWaitForFeedLayout: true,
      currentRenderedExpanded: true,
    })).toEqual({
      expanded: true,
      reason: 'waitingForFeedLayout',
    });
  });

  it('does not wait for feed layout readiness before compacting a map-input route', () => {
    expect(deriveRenderedPanelState({
      targetExpanded: false,
      targetReason: 'mapInput',
      isFeedLayoutReady: false,
      canWaitForFeedLayout: false,
      currentRenderedExpanded: true,
    })).toEqual({
      expanded: false,
      reason: 'mapInput',
    });
  });

  it('collapses after feed layout readiness when returning to compact mode', () => {
    expect(deriveRenderedPanelState({
      targetExpanded: false,
      targetReason: 'browse',
      isFeedLayoutReady: true,
      canWaitForFeedLayout: true,
      currentRenderedExpanded: true,
    })).toEqual({
      expanded: false,
      reason: 'browse',
    });
  });
});
