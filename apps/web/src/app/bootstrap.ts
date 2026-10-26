import { bootstrapApplication } from './lib/bootstrapApplication';

bootstrapApplication(() => import('./main').then(({ applicationReady }) => applicationReady));
