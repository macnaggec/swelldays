/**
 * Form Validation Utilities
 *
 * Helpers for using Zod validation on the client side when needed.
 * Use this for complex forms that benefit from instant validation feedback.
 *
 * For simple forms, prefer HTML5 validation attributes (required, minLength, etc.)
 */

import { z } from 'zod';

/**
 * Validates form data against a Zod schema and returns formatted errors
 * suitable for displaying in form fields.
 *
 * @example
 * const result = validateForm(loginSchema, formData);
 * if (!result.success) {
 *   // result.errors = { email: 'Invalid email', password: 'Too short' }
 * }
 */
export function validateForm<T extends z.ZodType>(
  schema: T,
  data: unknown
):
  | { success: true; data: z.infer<T> }
  | { success: false; errors: Record<string, string> } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  // Convert Zod errors to field-level error messages
  const errors: Record<string, string> = {};
  result.error.issues.forEach((issue) => {
    const field = issue.path[0];
    if (field && typeof field === 'string') {
      errors[field] = issue.message;
    }
  });

  return { success: false, errors };
}

/**
 * Hook for client-side form validation with Zod
 * Use when you need instant validation feedback before server submission.
 *
 * @example
 * function MyForm() {
 *   const { validate, errors } = useFormValidation(mySchema);
 *
 *   const handleSubmit = (e: FormEvent) => {
 *     const formData = new FormData(e.currentTarget);
 *     const result = validate(Object.fromEntries(formData));
 *
 *     if (!result.success) {
 *       e.preventDefault();
 *       return; // Show errors
 *     }
 *     // Let form submit to server action
 *   };
 * }
 */
export function useFormValidation<T extends z.ZodType>(schema: T) {
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const validate = (data: unknown) => {
    const result = validateForm(schema, data);
    if (!result.success) {
      setErrors(result.errors);
    } else {
      setErrors({});
    }
    return result;
  };

  const clearErrors = () => setErrors({});
  const clearError = (field: string) => {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  return { validate, errors, clearErrors, clearError };
}

// Re-export React for the hook
import React from 'react';
