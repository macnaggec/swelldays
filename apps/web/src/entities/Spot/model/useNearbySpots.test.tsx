import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useNearbySpots } from './useNearbySpots';

const mocks = vi.hoisted(() => ({
  queryClient: {
    fetchQuery: vi.fn(),
  },
  trpc: {
    spots: {
      nearby: {
        queryOptions: vi.fn(),
      },
    },
  },
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQueryClient: () => mocks.queryClient,
  };
});

vi.mock('shared/lib/trpc', () => ({
  useTRPC: () => mocks.trpc,
}));

describe('useNearbySpots', () => {
  it('keeps the lookup callback stable across rerenders', () => {
    const { result, rerender } = renderHook(() => useNearbySpots());
    const firstLookup = result.current;

    rerender();

    expect(result.current).toBe(firstLookup);
  });
});
