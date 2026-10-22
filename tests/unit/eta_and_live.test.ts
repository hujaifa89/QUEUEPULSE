import { peopleAhead, etaMinutes } from '@/features/queue/eta';
import { shouldApplyUpdate } from '@/features/live/useQueueLive';

describe('ETA and People Ahead Business Logic (FR-11)', () => {
  it('serving 12, mine 18, waiting 13-17 gives 6 ahead and 42 minutes at 7 minutes average', () => {
    const waiting = [13, 14, 15, 16, 17];
    const ahead = peopleAhead(waiting, 12, 18);
    expect(ahead).toBe(6);

    const wait = etaMinutes(ahead, 7);
    expect(wait).toBe(42);
  });

  it('cancelled gaps (serving 12, waiting [13,15,17], mine 18) give 4 ahead', () => {
    const waiting = [13, 15, 17];
    const ahead = peopleAhead(waiting, 12, 18);
    expect(ahead).toBe(4);

    const wait = etaMinutes(ahead, 7);
    expect(wait).toBe(28);
  });

  it('handles unsorted arrays correctly', () => {
    const unsortedWaiting = [17, 13, 16, 14, 15];
    const ahead = peopleAhead(unsortedWaiting, 12, 18);
    expect(ahead).toBe(6);
  });

  it('serving equal to mine gives 0 ahead', () => {
    // When I am currently serving, 0 people are ahead of me
    const ahead = peopleAhead([19, 20], 18, 18);
    expect(ahead).toBe(0);
  });

  it('serving higher than mine adds nothing', () => {
    // When serving number is higher than mine (e.g. I was skipped or late)
    const ahead = peopleAhead([25, 26], 20, 18);
    expect(ahead).toBe(0);
  });

  it('handles rounding of a 0.5 average and never returns below 0', () => {
    // 3 people ahead x 5.5 min = 16.5 -> rounds to 17
    expect(etaMinutes(3, 5.5)).toBe(17);

    // 1 person ahead x 2.5 min = 2.5 -> rounds to 3
    expect(etaMinutes(1, 2.5)).toBe(3);

    // 0 people ahead
    expect(etaMinutes(0, 5)).toBe(0);

    // Negative inputs never return below 0
    expect(etaMinutes(-2, 5)).toBe(0);
    expect(etaMinutes(3, -4)).toBe(0);
  });
});

describe('Live Queue Versioning (FR-10, DEC-03)', () => {
  it('applies a message only when its version is strictly higher than current', () => {
    expect(shouldApplyUpdate(5, 4)).toBe(true);
    expect(shouldApplyUpdate(10, 1)).toBe(true);
  });

  it('ignores older or equal version messages', () => {
    // Equal version is ignored
    expect(shouldApplyUpdate(4, 4)).toBe(false);

    // Older version is ignored (out-of-order broadcast protection)
    expect(shouldApplyUpdate(3, 4)).toBe(false);
    expect(shouldApplyUpdate(1, 10)).toBe(false);
  });
});
