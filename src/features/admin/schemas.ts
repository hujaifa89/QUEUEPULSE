import { z } from 'zod';

export const createOrganizationSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(80, 'Name must not exceed 80 characters'),
});

export const updateOrganizationSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  is_active: z.boolean().optional(),
}).refine((data) => data.name !== undefined || data.is_active !== undefined, {
  message: 'At least one field (name or is_active) must be provided',
});

export const createStaffSchema = z.object({
  email: z.string().email('Invalid email address'),
  full_name: z.string().min(2, 'Full name must be at least 2 characters').max(80, 'Full name must not exceed 80 characters'),
  organization_id: z.string().uuid('Invalid organization UUID'),
});

export const updateStaffSchema = z.object({
  full_name: z.string().min(2).max(80).optional(),
  is_active: z.boolean().optional(),
  organization_id: z.string().uuid().optional(),
}).refine(
  (data) => data.full_name !== undefined || data.is_active !== undefined || data.organization_id !== undefined,
  { message: 'At least one field must be provided' },
);

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
