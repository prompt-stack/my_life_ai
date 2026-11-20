/** Injectable time source so services and tools can be tested with a fixed time. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};
