import type { Position } from './coordinates';

export const SPOT_STATUS = {
  VERIFIED: 'verified',
  UNVERIFIED: 'unverified',
} as const;

export type SpotStatus = typeof SPOT_STATUS[keyof typeof SPOT_STATUS];

export type Spot = {
  id: string;
  name: string;
  location: string;
  coords: Position;
  status?: SpotStatus;
};
