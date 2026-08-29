import type { SurfSessionStatus as PrismaSurfSessionStatus } from '@prisma/client';
import type { SurfSessionItem } from '@swelldays/contracts/core';

type Assert<T extends true> = T;
type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;

type SharedSurfSessionStatus = SurfSessionItem['status'];

export type SharedStatusMatchesPrisma = Assert<IsEqual<SharedSurfSessionStatus, PrismaSurfSessionStatus>>;
