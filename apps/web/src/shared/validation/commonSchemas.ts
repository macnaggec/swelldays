/**
 * Common Validation Schemas
 *
 * Reusable Zod schemas for common validation patterns.
 * Import these instead of recreating validation rules.
 *
 * Note: Using Zod v4 syntax:
 * ✅ z.email(), z.url(), z.uuid()
 * ❌ z.string().email(), z.string().url() (deprecated)
 */

import { z } from 'zod';

/**
 * Email validation
 */
export const emailSchema = z.email('Invalid email address');

/**
 * Password validation (minimum 6 characters)
 */
export const passwordSchema = z
  .string()
  .min(6, 'Password must be at least 6 characters');

/**
 * Strong password validation (8+ chars, uppercase, lowercase, number)
 */
export const strongPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

/**
 * Name validation (2-50 characters)
 */
export const nameSchema = z
  .string()
  .min(2, 'Name must be at least 2 characters')
  .max(50, 'Name must not exceed 50 characters');

/**
 * URL validation
 */
export const urlSchema = z.url('Invalid URL format');

/**
 * Phone number validation (basic - adjust regex for your needs)
 */
export const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number');

/**
 * Credit card number validation (basic Luhn algorithm check)
 */
export const creditCardSchema = z
  .string()
  .regex(/^\d{13,19}$/, 'Invalid card number')
  .refine(luhnCheck, 'Invalid card number');

/**
 * CVV validation
 */
export const cvvSchema = z
  .string()
  .regex(/^\d{3,4}$/, 'CVV must be 3 or 4 digits');

/**
 * Date in MM/YY format
 */
export const expiryDateSchema = z
  .string()
  .regex(/^\d{2}\/\d{2}$/, 'Expiry must be in MM/YY format');

/**
 * Luhn algorithm for credit card validation
 */
function luhnCheck(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, '');
  let sum = 0;
  let isEven = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i]!, 10);

    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}
