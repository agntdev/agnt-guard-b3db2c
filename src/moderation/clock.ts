let source = () => new Date();

/** The single clock seam for verification expiry, rate windows, and reports. */
export function now(): Date {
  return source();
}

/** Test hook; production code never overrides the clock. */
export function setClockForTest(next?: () => Date): void {
  source = next ?? (() => new Date());
}
