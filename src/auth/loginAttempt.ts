export type LoginAttemptResult = 'success' | 'failure';

export async function runLoginAttempt(
  signIn: (email: string, password: string) => Promise<string | null>,
  email: string,
  password: string,
  setSubmitting: (submitting: boolean) => void,
): Promise<LoginAttemptResult> {
  setSubmitting(true);
  try {
    const error = await signIn(email.trim(), password);
    return error ? 'failure' : 'success';
  } catch {
    return 'failure';
  } finally {
    setSubmitting(false);
  }
}
