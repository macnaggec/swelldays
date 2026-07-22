import type { AppRouteIntent } from './appRouteIntent';

export type RenderedPanelStateReason = AppRouteIntent | 'waitingForFeedLayout';

export interface RenderedPanelStateInput {
  targetExpanded: boolean;
  targetReason: AppRouteIntent;
  isFeedLayoutReady: boolean;
  canWaitForFeedLayout: boolean;
  currentRenderedExpanded: boolean;
}

export interface RenderedPanelState {
  expanded: boolean;
  reason: RenderedPanelStateReason;
}

export function deriveRenderedPanelState({
  targetExpanded,
  targetReason,
  isFeedLayoutReady,
  canWaitForFeedLayout,
  currentRenderedExpanded,
}: RenderedPanelStateInput): RenderedPanelState {
  if (canWaitForFeedLayout && currentRenderedExpanded && !targetExpanded && !isFeedLayoutReady) {
    return {
      expanded: true,
      reason: 'waitingForFeedLayout',
    };
  }

  return {
    expanded: targetExpanded,
    reason: targetReason,
  };
}
