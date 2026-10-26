export const MAX_PASSWORD_BYTES = 72;

export function isPasswordWithinLimit(password: string): boolean {
  return new TextEncoder().encode(password).byteLength <= MAX_PASSWORD_BYTES;
}
