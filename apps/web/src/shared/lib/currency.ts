import type { Cents } from '@swelldays/contracts/core';

export function formatPrice(cents: Cents): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}
