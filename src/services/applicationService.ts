import { getSupabaseClient } from './supabaseClient';
import {
  PublicApplicationSubmitError,
  createApplicationSubmissionDiagnostics,
  readPublicApplicationErrorCode,
  readPublicApplicationResult,
  toPublicApplicationRpcArgs,
} from './applicationContract';
import type {
  ApplicationDiagnosticExamStatus,
  PublicApplicationInput,
  PublicApplicationResult,
} from './applicationContract';

export type { PublicApplicationInput, PublicApplicationResult } from './applicationContract';

export async function submitPublicApplication(
  input: PublicApplicationInput,
  examStatus: ApplicationDiagnosticExamStatus = 'unknown',
): Promise<PublicApplicationResult> {
  const args = toPublicApplicationRpcArgs(input);
  const expectedKeys = [
    'p_idempotency_key', 'p_exam_id', 'p_student_name', 'p_student_surname', 'p_student_father_name',
    'p_grade', 'p_school', 'p_course_or_tutor', 'p_student_phone', 'p_parent_name', 'p_parent_phone',
    'p_city', 'p_public_note',
  ];
  const parameterContract: 'pass' | 'fail' = Object.keys(args).length === expectedKeys.length
    && expectedKeys.every((key) => Object.hasOwn(args, key)) ? 'pass' : 'fail';
  const context = { parameterContract, exam: examStatus, includeDiagnostics: import.meta.env.DEV } as const;
  const client = getSupabaseClient();
  if (!client) {
    const diagnostics = import.meta.env.DEV
      ? {
        stage: 'rpc_request' as const, httpStatus: null, postgresCode: null,
        safeCategory: 'generic_unexpected_error' as const, rpc: 'submit_public_application' as const,
        parameterContract, exam: examStatus,
      }
      : undefined;
    throw new PublicApplicationSubmitError('application_submit_failed', diagnostics);
  }

  let response;
  try {
    response = await client.rpc('submit_public_application', args);
  } catch (error: unknown) {
    const code = readPublicApplicationErrorCode(error);
    const diagnostics = import.meta.env.DEV
      ? createApplicationSubmissionDiagnostics(error, code === 'network_error' ? 'network' : 'rpc_request', context)
      : undefined;
    throw new PublicApplicationSubmitError(code, diagnostics);
  }

  return readPublicApplicationResult(response.data, response.error, {
    ...context,
    httpStatus: response.status,
    includeDiagnostics: import.meta.env.DEV,
  });
}
