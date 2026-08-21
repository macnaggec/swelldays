import { describe, expect, it } from 'vitest';
import { deriveGlobeMotionPolicy } from './globeMotionPolicy';
import type { GlobeSceneMode } from './globeSceneMode';

describe('deriveGlobeMotionPolicy', () => {
  it('allows ambient spin only while the globe is in overview mode', () => {
    expect(deriveGlobeMotionPolicy({
      sceneMode: { kind: 'overview' },
      isDocumentHidden: false,
      prefersReducedMotion: false,
    })).toBe('ambientSpin');
  });

  it.each<GlobeSceneMode>([
    { kind: 'addSpotFlow' },
    { kind: 'uploadSpotSelection' },
    { kind: 'spotFocused', spotId: 'spot-1' },
    { kind: 'userExploring' },
  ])('pauses ambient motion while scene mode is $kind', (sceneMode) => {
    expect(deriveGlobeMotionPolicy({
      sceneMode,
      isDocumentHidden: false,
      prefersReducedMotion: false,
    })).toBe('paused');
  });

  it('pauses ambient motion while the document is hidden', () => {
    expect(deriveGlobeMotionPolicy({
      sceneMode: { kind: 'overview' },
      isDocumentHidden: true,
      prefersReducedMotion: false,
    })).toBe('paused');
  });

  it('disables ambient motion when reduced motion is preferred', () => {
    expect(deriveGlobeMotionPolicy({
      sceneMode: { kind: 'overview' },
      isDocumentHidden: false,
      prefersReducedMotion: true,
    })).toBe('disabled');
  });
});
