import { router } from 'server/trpc';
import { spotsRouter } from './routes/spots';
import { mediaRouter } from './routes/media';
import { usersRouter } from './routes/users';
import { checkoutRouter } from './routes/checkout';
import { sessionsRouter } from './routes/sessions';
import { uploadsRouter } from './routes/uploads';
import { ledgerRouter } from './routes/ledger';
import { adminLedgerRouter } from './routes/adminLedger';

export const appRouter = router({
  admin: router({
    ledger: adminLedgerRouter,
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
