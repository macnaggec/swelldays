import { useQuery } from '@tanstack/react-query';
import { useTRPC } from 'shared/lib/trpc';

export function useMyDrafts() {
  const trpc = useTRPC();
  return useQuery(trpc.media.myDrafts.queryOptions());
}
