import { z } from 'zod';

/**
 * Spot validation schemas — shared between server tRPC input validation
 * and client-side form validation. Single source of truth for all spot rules.
 */

export const spotNameSchema = z
  .string()
  .min(2, 'Name must be at least 2 characters')
  .max(20, 'Name must not exceed 20 characters');

export const spotLocationSchema = z
  .string()
  .min(2, 'Location must be at least 2 characters')
  .max(50, 'Location must not exceed 50 characters');

export const spotAliasSchema = z
  .string()
  .min(2, 'Alias must be at least 2 characters')
  .max(20, 'Alias must not exceed 100 characters');
