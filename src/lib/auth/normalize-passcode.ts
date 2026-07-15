/**
 * Normalize a child passcode to meet Supabase's minimum password length (6 chars).
 * 4-digit passcodes are padded by appending the first 2 chars of the passcode.
 * Examples: '0000' -> '000000', '1234' -> '123412', 'abcd' -> 'abcdab'
 * Passcodes >=6 chars are returned unchanged.
 */
export function normalizePasscode(passcode: string): string {
  if (passcode.length >= 6) return passcode;
  const needed = 6 - passcode.length;
  return passcode + passcode.slice(0, needed);
}
