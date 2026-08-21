import type { GlobeMotionPolicy } from 'widgets/GlobeMap';
import type { GlobeSceneMode } from './globeSceneMode';

export interface GlobeMotionPolicyInput {
  sceneMode: GlobeSceneMode;
  isDocumentHidden: boolean;
  prefersReducedMotion: boolean;
}

export function deriveGlobeMotionPolicy({
  sceneMode,
  isDocumentHidden,
  prefersReducedMotion,
}: GlobeMotionPolicyInput): GlobeMotionPolicy {
  if (prefersReducedMotion) return 'disabled';
  if (isDocumentHidden) return 'paused';

  switch (sceneMode.kind) {
    case 'overview':
      return 'ambientSpin';
    case 'addSpotFlow':
    case 'uploadSpotSelection':
    case 'spotFocused':
    case 'userExploring':
      return 'paused';
  }
}
