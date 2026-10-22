import { z } from 'zod';

/**
 * Normalizes Bangladeshi phone numbers into +8801XXXXXXXXX format.
 * Accepts:
 *   - 01XXXXXXXXX (11 digits, operator digit 3-9) -> +8801XXXXXXXXX
 *   - +8801XXXXXXXXX (14 chars) -> +8801XXXXXXXXX
 *   - 8801XXXXXXXXX (13 digits) -> +8801XXXXXXXXX
 * Rejects all other formats or operator digits (0, 1, 2).
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^01[3-9]\d{8}$/.test(trimmed)) {
    return `+88${trimmed}`;
  }
  if (/^8801[3-9]\d{8}$/.test(trimmed)) {
    return `+${trimmed}`;
  }
  if (/^\+8801[3-9]\d{8}$/.test(trimmed)) {
    return trimmed;
  }

  throw new Error('Invalid Bangladeshi mobile phone format. Expected 01XXXXXXXXX, +8801XXXXXXXXX, or 8801XXXXXXXXX with operator digit 3-9.');
}

/**
 * Masks phone number showing ONLY the last 3 digits for staff screens.
 * Phone numbers are optional, stored in international format, never logged or sent to live page.
 */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const clean = phone.trim();
  if (!clean) return null;
  const last3 = clean.slice(-3);
  return `•••••••••${last3}`;
}

export const phoneSchema = z
  .string()
  .nullish()
  .transform((val) => {
    if (!val || val.trim() === '') return null;
    return normalizePhone(val);
  });

export const createQueueSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Queue name must be at least 2 characters')
    .max(60, 'Queue name must not exceed 60 characters'),
  default_service_minutes: z.coerce
    .number()
    .int('Default service minutes must be an integer')
    .min(1, 'Service minutes must be between 1 and 120')
    .max(120, 'Service minutes must be between 1 and 120')
    .default(5),
});

export const updateQueueSchema = z
  .object({
    name: z.string().trim().min(2).max(60).optional(),
    default_service_minutes: z.coerce.number().int().min(1).max(120).optional(),
    is_active: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.default_service_minutes !== undefined ||
      data.is_active !== undefined,
    { message: 'At least one field must be provided for update' },
  );

export const issueTokenSchema = z.object({
  phone: phoneSchema.optional(),
  request_id: z.string().uuid('request_id must be a valid UUID'),
});

export const advanceQueueSchema = z.object({
  action: z.enum(['next', 'skip'], {
    errorMap: () => ({ message: 'Action must be "next" or "skip"' }),
  }),
  expected_serving_token_id: z.string().uuid().nullable().optional(),
});

export type CreateQueueInput = z.infer<typeof createQueueSchema>;
export type UpdateQueueInput = z.infer<typeof updateQueueSchema>;
export type IssueTokenInput = z.infer<typeof issueTokenSchema>;
export type AdvanceQueueInput = z.infer<typeof advanceQueueSchema>;
