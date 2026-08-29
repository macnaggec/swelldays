import { router } from 'server/trpc';
import { spotsRouter } from './routes/spots';
import { mediaRouter } from './routes/media';
import { usersRouter } from './routes/users';
import { checkoutRouter } from './routes/checkout';
import { sessionsRouter } from './routes/sessions';
import { uploadsRouter } from './routes/uploads';
import { ledgerRouter } from './routes/ledger';
import { adminLedgerRouter } from './routes/adminLedger';
import { adminSpotsRouter } from './routes/adminSpots';

export const appRouter = router({
  admin: router({
    ledger: adminLedgerRouter,
    spots: adminSpotsRouter,
  }),
  spots: spotsRouter,
  media: mediaRouter,
  users: usersRouter,
  checkout: checkoutRouter,
  sessions: sessionsRouter,
  uploads: uploadsRouter,
  ledger: ledgerRouter,
});

export type AppRouter = typeof appRouter;
