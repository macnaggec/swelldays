import { decodeApiEnvironment } from './decodeApiEnvironment';

export const apiConfig = decodeApiEnvironment(process.env);
