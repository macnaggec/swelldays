/**
 * Px of the map canvas covered by app chrome on each edge, reserved as camera padding so
 * a focused spot centers in the part of the map the user can actually see. Four-sided
 * because the surface covering the map is an inline-end panel in some bands and a
 * block-end sheet in others.
 */
export interface MapCameraInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export const NO_MAP_CAMERA_INSETS: MapCameraInsets = Object.freeze({
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
});
