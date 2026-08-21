import type { Cents } from '@wave-atlas/contracts';

export function formatPrice(cents: Cents): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}
