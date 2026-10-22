/**
 * Calculates the number of people ahead of a given token number (FR-11).
 * peopleAhead(waitingNumbers, servingNumber, myNumber) =
 *   (servingNumber is not null and lower than myNumber ? 1 : 0) +
 *   the count of waitingNumbers lower than myNumber
 */
export function peopleAhead(
  waitingNumbers: number[] | null | undefined,
  servingNumber: number | null | undefined,
  myNumber: number,
): number {
  let count = 0;

  // Serving token counts if currently serving and lower than mine
  if (servingNumber !== null && servingNumber !== undefined && servingNumber < myNumber) {
    count += 1;
  }

  // Waiting tokens with a lower number
  if (Array.isArray(waitingNumbers)) {
    for (const num of waitingNumbers) {
      if (num < myNumber) {
        count += 1;
      }
    }
  }

  return count;
}

/**
 * Calculates estimated wait time in minutes (FR-11).
 * etaMinutes(peopleAhead, avgMinutes) = Math.round(peopleAhead * avgMinutes), never below 0.
 */
export function etaMinutes(peopleAheadCount: number, avgMinutes: number): number {
  if (peopleAheadCount <= 0 || avgMinutes <= 0) {
    return 0;
  }
  return Math.max(0, Math.round(peopleAheadCount * avgMinutes));
}

// Backwards-compatible aliases
export function calculatePeopleAhead(
  myNumber: number,
  servingNumber: number | null | undefined,
  waitingNumbers: number[] | null | undefined,
): number {
  return peopleAhead(waitingNumbers, servingNumber, myNumber);
}

export const calculateEta = etaMinutes;
