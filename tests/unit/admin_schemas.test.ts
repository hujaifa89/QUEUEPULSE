import {
  createOrganizationSchema,
  updateOrganizationSchema,
  createStaffSchema,
  updateStaffSchema,
} from '@/features/admin/schemas';

describe('Admin Zod Schemas', () => {
  describe('createOrganizationSchema', () => {
    it('accepts valid organization names (2-80 characters)', () => {
      expect(createOrganizationSchema.safeParse({ name: 'Central Clinic' }).success).toBe(true);
      expect(createOrganizationSchema.safeParse({ name: 'AB' }).success).toBe(true);
      expect(createOrganizationSchema.safeParse({ name: 'A'.repeat(80) }).success).toBe(true);
    });

    it('rejects names shorter than 2 or longer than 80 characters', () => {
      expect(createOrganizationSchema.safeParse({ name: 'A' }).success).toBe(false);
      expect(createOrganizationSchema.safeParse({ name: '' }).success).toBe(false);
      expect(createOrganizationSchema.safeParse({ name: 'A'.repeat(81) }).success).toBe(false);
    });
  });

  describe('updateOrganizationSchema', () => {
    it('accepts partial valid updates', () => {
      expect(updateOrganizationSchema.safeParse({ name: 'Updated Name' }).success).toBe(true);
      expect(updateOrganizationSchema.safeParse({ is_active: false }).success).toBe(true);
      expect(updateOrganizationSchema.safeParse({ name: 'Updated Name', is_active: true }).success).toBe(true);
    });

    it('rejects empty update payloads', () => {
      expect(updateOrganizationSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('createStaffSchema', () => {
    const validStaff = {
      email: 'staff@clinic.com',
      full_name: 'Nasrin Receptionist',
      organization_id: 'a0000000-0000-0000-0000-000000000001',
    };

    it('accepts valid staff payload', () => {
      expect(createStaffSchema.safeParse(validStaff).success).toBe(true);
    });

    it('rejects invalid email formats', () => {
      expect(createStaffSchema.safeParse({ ...validStaff, email: 'not-an-email' }).success).toBe(false);
    });

    it('rejects names under 2 or over 80 characters', () => {
      expect(createStaffSchema.safeParse({ ...validStaff, full_name: 'A' }).success).toBe(false);
      expect(createStaffSchema.safeParse({ ...validStaff, full_name: 'A'.repeat(81) }).success).toBe(false);
    });

    it('rejects invalid organization UUIDs', () => {
      expect(createStaffSchema.safeParse({ ...validStaff, organization_id: 'not-a-uuid' }).success).toBe(false);
    });
  });

  describe('updateStaffSchema', () => {
    it('accepts valid partial updates', () => {
      expect(updateStaffSchema.safeParse({ full_name: 'Updated Name' }).success).toBe(true);
      expect(updateStaffSchema.safeParse({ is_active: false }).success).toBe(true);
      expect(updateStaffSchema.safeParse({ organization_id: 'a0000000-0000-0000-0000-000000000002' }).success).toBe(true);
    });

    it('rejects empty update payloads', () => {
      expect(updateStaffSchema.safeParse({}).success).toBe(false);
    });
  });
});
