export const MIN_PASSWORD = 8

/** Returns a message to show the person, or null when the new password is fine. */
export function checkPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`
  // Supabase stores a bcrypt hash, which only reads the first 72 bytes.
  if (new TextEncoder().encode(password).length > 72) return 'Use at most 72 characters.'
  if (password !== confirm) return 'The two passwords do not match.'
  return null
}

/** Friendly wording for the few errors Supabase can return when saving a password. */
export function passwordError(message: string): string {
  if (/different from the old password/i.test(message)) return 'Choose a password you have not used before.'
  if (/weak|easy to guess|pwned|compromised/i.test(message)) return 'That password is too easy to guess. Try a longer one.'
  if (/at least|characters/i.test(message)) return message
  return 'Could not save the password. Please try again.'
}
