import {
  normalizePhone,
  maskPhone,
  phoneSchema,
  createQueueSchema,
  updateQueueSchema,
  issueTokenSchema,
  advanceQueueSchema,
} from '@/features/queue/schemas';
import { mapDatabaseError } from '@/features/queue/errorMap';
import { calculatePeopleAhead, calculateEta } from '@/features/queue/eta';

describe('Phone Normalization & Validation', () => {
  it('normalizes standard 11-digit Bangladeshi mobile numbers (013-019)', () => {
    expect(normalizePhone('01712345678')).toBe('+8801712345678');
    expect(normalizePhone('01812345678')).toBe('+8801812345678');
    expect(normalizePhone('01912345678')).toBe('+8801912345678');
    expect(normalizePhone('01312345678')).toBe('+8801312345678');
    expect(normalizePhone('01412345678')).toBe('+8801412345678');
    expect(normalizePhone('01512345678')).toBe('+8801512345678');
    expect(normalizePhone('01612345678')).toBe('+8801612345678');
  });

  it('normalizes 13-digit numbers starting with 8801', () => {
    expect(normalizePhone('8801712345678')).toBe('+8801712345678');
    expect(normalizePhone('8801312345678')).toBe('+8801312345678');
  });

  it('accepts already normalized +8801 numbers', () => {
    expect(normalizePhone('+8801712345678')).toBe('+8801712345678');
    expect(normalizePhone('+8801912345678')).toBe('+8801912345678');
  });

  it('handles surrounding whitespace', () => {
    expect(normalizePhone('  01712345678  ')).toBe('+8801712345678');
  });

  it('returns null for null, undefined, or empty string', () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('   ')).toBeNull();
  });

  it('rejects invalid operator digits (010, 011, 012)', () => {
    expect(() => normalizePhone('01012345678')).toThrow();
    expect(() => normalizePhone('01112345678')).toThrow();
    expect(() => normalizePhone('01212345678')).toThrow();
  });

  it('rejects wrong lengths', () => {
    expect(() => normalizePhone('0171234567')).toThrow(); // 10 digits
    expect(() => normalizePhone('017123456789')).toThrow(); // 12 digits
  });

  it('rejects non-numeric characters and other country formats', () => {
    expect(() => normalizePhone('0171234ABCD')).toThrow();
    expect(() => normalizePhone('+12345678901')).toThrow();
    expect(() => normalizePhone('017-12345678')).toThrow();
  });

  it('phoneSchema transforms correctly', () => {
    expect(phoneSchema.parse('01712345678')).toBe('+8801712345678');
    expect(phoneSchema.parse('')).toBeNull();
    expect(phoneSchema.parse(null)).toBeNull();
    expect(phoneSchema.parse(undefined)).toBeNull();
  });
});

describe('Phone Masking for Staff Screen', () => {
  it('masks phone exposing only the last 3 digits', () => {
    expect(maskPhone('+8801712345678')).toBe('•••••••••678');
    expect(maskPhone('01712345678')).toBe('•••••••••678');
    expect(maskPhone('+8801999999123')).toBe('•••••••••123');
  });

  it('returns null for empty or null phone', () => {
    expect(maskPhone(null)).toBeNull();
    expect(maskPhone(undefined)).toBeNull();
    expect(maskPhone('')).toBeNull();
    expect(maskPhone('   ')).toBeNull();
  });
});

describe('Queue Schemas', () => {
  it('createQueueSchema accepts valid input and applies defaults', () => {
    const valid = createQueueSchema.parse({ name: 'General Consultation' });
    expect(valid.name).toBe('General Consultation');
    expect(valid.default_service_minutes).toBe(5);

    const withMinutes = createQueueSchema.parse({
      name: 'Ultrasound',
      default_service_minutes: 15,
    });
    expect(withMinutes.default_service_minutes).toBe(15);
  });

  it('createQueueSchema rejects names under 2 or over 60 chars', () => {
    expect(() => createQueueSchema.parse({ name: 'A' })).toThrow();
    expect(() => createQueueSchema.parse({ name: 'A'.repeat(61) })).toThrow();
  });

  it('createQueueSchema rejects invalid service minutes', () => {
    expect(() => createQueueSchema.parse({ name: 'Dental', default_service_minutes: 0 })).toThrow();
    expect(() => createQueueSchema.parse({ name: 'Dental', default_service_minutes: 121 })).toThrow();
  });

  it('updateQueueSchema requires at least one field', () => {
    expect(() => updateQueueSchema.parse({})).toThrow();
    expect(updateQueueSchema.parse({ name: 'New Name' }).name).toBe('New Name');
    expect(updateQueueSchema.parse({ is_active: false }).is_active).toBe(false);
  });

  it('issueTokenSchema validates request_id as UUID', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';
    const parsed = issueTokenSchema.parse({
      request_id: validUuid,
      phone: '01712345678',
    });
    expect(parsed.request_id).toBe(validUuid);
    expect(parsed.phone).toBe('+8801712345678');

    expect(() =>
      issueTokenSchema.parse({
        request_id: 'not-a-uuid',
      }),
    ).toThrow();
  });

  it('advanceQueueSchema validates action enum and optional expected_serving_token_id', () => {
    expect(advanceQueueSchema.parse({ action: 'next' }).action).toBe('next');
    expect(advanceQueueSchema.parse({ action: 'skip' }).action).toBe('skip');

    const validUuid = '123e4567-e89b-12d3-a456-426614174000';
    expect(
      advanceQueueSchema.parse({ action: 'next', expected_serving_token_id: validUuid })
        .expected_serving_token_id,
    ).toBe(validUuid);

    expect(() => advanceQueueSchema.parse({ action: 'invalid' })).toThrow();
  });
});

describe('Database Error Mapping', () => {
  it('maps database exception strings to their corresponding AppError and status', () => {
    const stale = mapDatabaseError(new Error('P0001: STALE_STATE occurred'));
    expect(stale.code).toBe('STALE_STATE');
    expect(stale.status).toBe(409);

    const paused = mapDatabaseError(new Error('QUEUE_PAUSED'));
    expect(paused.code).toBe('QUEUE_PAUSED');
    expect(paused.status).toBe(409);

    const inactive = mapDatabaseError(new Error('QUEUE_INACTIVE'));
    expect(inactive.code).toBe('QUEUE_INACTIVE');
    expect(inactive.status).toBe(409);

    const nothingServing = mapDatabaseError(new Error('NOTHING_SERVING'));
    expect(nothingServing.code).toBe('NOTHING_SERVING');
    expect(nothingServing.status).toBe(409);

    const notWaiting = mapDatabaseError(new Error('TOKEN_NOT_WAITING'));
    expect(notWaiting.code).toBe('TOKEN_NOT_WAITING');
    expect(notWaiting.status).toBe(409);

    const notFound = mapDatabaseError(new Error('NOT_FOUND'));
    expect(notFound.code).toBe('NOT_FOUND');
    expect(notFound.status).toBe(404);

    const forbidden = mapDatabaseError(new Error('FORBIDDEN'));
    expect(forbidden.code).toBe('FORBIDDEN');
    expect(forbidden.status).toBe(403);

    const duplicate = mapDatabaseError(new Error('DUPLICATE_NAME'));
    expect(duplicate.code).toBe('DUPLICATE_NAME');
    expect(duplicate.status).toBe(409);

    const unknown = mapDatabaseError(new Error('Something unusual broke'));
    expect(unknown.code).toBe('INTERNAL');
    expect(unknown.status).toBe(500);
  });
});

describe('ETA and People Ahead Calculations (FR-11)', () => {
  it('counts people ahead as serving token (if lower) plus waiting tokens with lower number', () => {
    // My number is 7, serving is 3, waiting are [4, 5, 6, 8, 9]
    // People ahead = 1 (serving 3) + 3 (waiting 4, 5, 6) = 4
    expect(calculatePeopleAhead(7, 3, [4, 5, 6, 8, 9])).toBe(4);

    // My number is 3, serving is 3 -> serving is not lower than mine -> 0
    expect(calculatePeopleAhead(3, 3, [4, 5, 6])).toBe(0);

    // My number is 5, serving is null, waiting are [1, 2, 3, 4] -> 4 ahead
    expect(calculatePeopleAhead(5, null, [1, 2, 3, 4])).toBe(4);

    // My number is 1, serving is null, waiting are [2, 3] -> 0 ahead
    expect(calculatePeopleAhead(1, null, [2, 3])).toBe(0);
  });

  it('calculates ETA by multiplying people ahead by average service minutes', () => {
    // 6 people ahead x 7 min = 42 min (explicit example in blueprint FR-11)
    expect(calculateEta(6, 7)).toBe(42);
    expect(calculateEta(4, 5.5)).toBe(22);
    expect(calculateEta(0, 5)).toBe(0);
    expect(calculateEta(3, 0)).toBe(0);
  });
});

