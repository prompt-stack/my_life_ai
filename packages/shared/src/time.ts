/**
 * Returns true when `timeZone` is an IANA zone the runtime's Intl data knows.
 * Runs on both Node (api) and Hermes (mobile_app).
 */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
