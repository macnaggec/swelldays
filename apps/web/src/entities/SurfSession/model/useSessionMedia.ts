import { useQuery } from '@tanstack/react-query';
import { useTRPC } from 'shared/lib/trpc';

export function useSessionMedia(sessionId: string) {
  const trpc = useTRPC();
  return useQuery(trpc.sessions.media.queryOptions(sessionId));
}
