import type { Spot } from 'entities/Spot';
import type { MapSpotProjection } from './mapSpotProjection';

type Assert<T extends true> = T;
type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;

type ExpectedMapSpotProjection = Pick<Spot, 'id' | 'slug' | 'name' | 'coords' | 'status'>;

export type MapSpotProjectionMatchesMapNeeds = Assert<IsEqual<
  MapSpotProjection,
  ExpectedMapSpotProjection
>>;
