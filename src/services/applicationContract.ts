export interface PublicApplicationInput {
  idempotencyKey: string;
  examId: string;
  studentName: string;
  studentSurname: string;
  studentFatherName: string;
  grade: string;
  school: string;
  courseOrTutor: string;
  studentPhone: string;
  parentName: string;
  parentPhone: string;
  city: string;
  publicNote: string;
}

export interface PublicApplicationResult {
  success: true;
  registrationNumber: string;
}

export interface SimplifiedPublicApplicationFormInput {
  idempotencyKey: string;
  examId: string;
  studentName: string;
  studentSurname: string;
  studentFatherName: string;
  grade: string;
  school: string;
  mobileDigits: string;
  selectedExamCity: string | null | undefined;
}

export type SimplifiedPublicApplicationFormResult =
  | { submitted: true; result: PublicApplicationResult }
  | { submitted: false; reason: 'missing_city' | 'invalid_phone' };

export function sanitizeAzerbaijaniMobileInput(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('00994')) return digits.slice(5, 14);
  if (digits.startsWith('994')) return digits.slice(3, 12);
  return digits.slice(0, 9);
}

export function normalizeAzerbaijaniMobile(digits: string): string | null {
  return /^[0-9]{9}$/.test(digits) ? `+994${digits}` : null;
}

export async function submitSimplifiedPublicApplicationForm(
  form: SimplifiedPublicApplicationFormInput,
  submit: (input: PublicApplicationInput) => Promise<PublicApplicationResult>,
): Promise<SimplifiedPublicApplicationFormResult> {
  const city = form.selectedExamCity?.trim();
  if (!city) return { submitted: false, reason: 'missing_city' };

  const mobile = normalizeAzerbaijaniMobile(form.mobileDigits);
  if (!mobile) return { submitted: false, reason: 'invalid_phone' };

  const result = await submit({
    idempotencyKey: form.idempotencyKey,
    examId: form.examId,
    studentName: form.studentName,
    studentSurname: form.studentSurname,
    studentFatherName: form.studentFatherName,
    grade: form.grade,
    school: form.school,
    courseOrTutor: '',
    studentPhone: mobile,
    parentName: '',
    parentPhone: mobile,
    city,
    publicNote: '',
  });
  return { submitted: true, result };
}

export function simplifiedApplicationFormErrorMessage(reason: 'missing_city' | 'invalid_phone'): string {
  return reason === 'missing_city'
    ? 'Seçilmiş imtahan üçün şəhər məlumatı təyin edilməyib.'
    : 'Mobil nömrəni düzgün daxil edin.';
}

export type PublicApplicationErrorCode =
  | 'invalid_request'
  | 'invalid_exam'
  | 'invalid_application'
  | 'invalid_phone'
  | 'duplicate_request'
  | 'request_conflict'
  | 'application_closed'
  | 'application_insert_failed'
  | 'application_not_null_failed'
  | 'application_foreign_key_failed'
  | 'application_unique_failed'
  | 'application_check_failed'
  | 'application_data_format_failed'
  | 'application_permission_failed'
  | 'application_dependency_failed'
  | 'ledger_insert_failed'
  | 'helper_function_failed'
  | 'unexpected_database_error'
  | 'application_submit_failed';

export type PublicApplicationSubmitErrorCode = PublicApplicationErrorCode | 'network_error' | 'generic_unexpected_error';

export type ApplicationSubmissionStage = 'client_validation' | 'rpc_request' | 'rpc_response' | 'network';
export type ApplicationDiagnosticCategory =
  | 'request_conflict'
  | 'duplicate_request'
  | 'validation'
  | 'generic_unexpected_error'
  | 'network_error'
  | 'application_insert_failed'
  | 'application_not_null_failed'
  | 'application_foreign_key_failed'
  | 'application_unique_failed'
  | 'application_check_failed'
  | 'application_data_format_failed'
  | 'application_permission_failed'
  | 'application_dependency_failed'
  | 'ledger_insert_failed'
  | 'helper_function_failed'
  | 'unexpected_database_error';
export type ApplicationDiagnosticExamStatus = 'published_open' | 'missing_or_closed' | 'unknown';

export type SubmittedGradeCategory = 'allowed' | 'disallowed' | 'unknown';

export interface ApplicationSubmissionDiagnostics {
  stage: ApplicationSubmissionStage;
  httpStatus: number | null;
  postgresCode: string | null;
  safeCategory: ApplicationDiagnosticCategory;
  rpc: 'submit_public_application';
  parameterContract: 'pass' | 'fail';
  exam: ApplicationDiagnosticExamStatus;
  selectedExamGradeCount?: number;
  submittedGradeAllowed?: 'pass' | 'fail';
  submittedGradeCategory?: SubmittedGradeCategory;
}

export interface ApplicationSubmissionDiagnosticContext {
  parameterContract: 'pass' | 'fail';
  exam: ApplicationDiagnosticExamStatus;
  httpStatus?: number | null;
  includeDiagnostics?: boolean;
}

export interface ApplicationDiagnosticRow {
  label: string;
  value: string;
}

export type ApplicationGradeSubmission<T> =
  | {
    allowed: true;
    grade: string;
    result: T;
    selectedExamGradeCount: number;
    submittedGradeAllowed: 'pass';
    submittedGradeCategory: 'allowed';
  }
  | {
    allowed: false;
    selectedExamGradeCount: number;
    submittedGradeAllowed: 'fail';
    submittedGradeCategory: 'disallowed' | 'unknown';
  };

export function submitWithAllowedApplicationGrade<T>(
  examGrades: readonly string[],
  currentGrade: unknown,
  submit: (grade: string) => T,
): ApplicationGradeSubmission<T> {
  const normalizedGrades = examGrades.map((grade) => String(grade).trim()).filter(Boolean);
  const grade = typeof currentGrade === 'string' ? currentGrade.trim() : String(currentGrade ?? '').trim();
  const allowed = normalizedGrades.length > 0 && normalizedGrades.includes(grade);

  if (!allowed) {
    return {
      allowed: false,
      selectedExamGradeCount: normalizedGrades.length,
      submittedGradeAllowed: 'fail',
      submittedGradeCategory: normalizedGrades.length === 0 ? 'unknown' : 'disallowed',
    };
  }

  return {
    allowed: true,
    grade,
    result: submit(grade),
    selectedExamGradeCount: normalizedGrades.length,
    submittedGradeAllowed: 'pass',
    submittedGradeCategory: 'allowed',
  };
}

const SAFE_PUBLIC_APPLICATION_ERROR_CODES = new Set<Exclude<PublicApplicationErrorCode, 'application_submit_failed'>>([
  'invalid_request', 'invalid_exam', 'invalid_application', 'invalid_phone',
  'duplicate_request', 'request_conflict', 'application_closed',
  'application_insert_failed', 'application_not_null_failed', 'application_foreign_key_failed',
  'application_unique_failed', 'application_check_failed', 'application_data_format_failed',
  'application_permission_failed', 'application_dependency_failed', 'ledger_insert_failed',
  'helper_function_failed', 'unexpected_database_error',
]);

function isPublicApplicationErrorCode(value: string): value is Exclude<PublicApplicationErrorCode, 'application_submit_failed'> {
  return SAFE_PUBLIC_APPLICATION_ERROR_CODES.has(value as Exclude<PublicApplicationErrorCode, 'application_submit_failed'>);
}

export class PublicApplicationSubmitError extends Error {
  constructor(readonly code: PublicApplicationSubmitErrorCode, readonly diagnostics?: ApplicationSubmissionDiagnostics) {
    super(code);
    this.name = 'PublicApplicationSubmitError';
  }
}

export function applicationDiagnosticCategory(code: PublicApplicationSubmitErrorCode): ApplicationDiagnosticCategory {
  switch (code) {
    case 'request_conflict': return 'request_conflict';
    case 'duplicate_request': return 'duplicate_request';
    case 'invalid_request':
    case 'invalid_exam':
    case 'invalid_application':
    case 'invalid_phone':
    case 'application_closed': return 'validation';
    case 'network_error': return 'network_error';
    case 'application_insert_failed': return 'application_insert_failed';
    case 'application_not_null_failed': return 'application_not_null_failed';
    case 'application_foreign_key_failed': return 'application_foreign_key_failed';
    case 'application_unique_failed': return 'application_unique_failed';
    case 'application_check_failed': return 'application_check_failed';
    case 'application_data_format_failed': return 'application_data_format_failed';
    case 'application_permission_failed': return 'application_permission_failed';
    case 'application_dependency_failed': return 'application_dependency_failed';
    case 'ledger_insert_failed': return 'ledger_insert_failed';
    case 'helper_function_failed': return 'helper_function_failed';
    case 'unexpected_database_error': return 'unexpected_database_error';
    case 'application_submit_failed':
    case 'generic_unexpected_error': return 'generic_unexpected_error';
  }
}

function safeHttpStatus(status: unknown): number | null {
  return typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
}

function safePostgresCode(code: unknown): string | null {
  return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? code : null;
}

export function readPublicApplicationErrorCode(error: unknown): PublicApplicationSubmitErrorCode {
  if (error instanceof PublicApplicationSubmitError) {
    if (error.code === 'network_error') return error.code;
    return isPublicApplicationErrorCode(error.code) ? error.code : 'generic_unexpected_error';
  }
  if (error && typeof error === 'object') {
    const value = error as { code?: unknown; message?: unknown; status?: unknown; name?: unknown };
    if (value.code === 'P0001' && typeof value.message === 'string' && isPublicApplicationErrorCode(value.message)) {
      return value.message;
    }
    if (value.status === 0 || value instanceof TypeError || value.name === 'AbortError') return 'network_error';
  } else if (error instanceof TypeError) {
    return 'network_error';
  }
  return 'generic_unexpected_error';
}

export function createApplicationSubmissionDiagnostics(
  error: unknown,
  stage: ApplicationSubmissionStage,
  context: ApplicationSubmissionDiagnosticContext,
): ApplicationSubmissionDiagnostics {
  const value = error && typeof error === 'object' ? error as { code?: unknown; status?: unknown } : {};
  const code = readPublicApplicationErrorCode(error);
  return {
    stage: code === 'network_error' ? 'network' : stage,
    httpStatus: safeHttpStatus(context.httpStatus) ?? safeHttpStatus(value.status),
    postgresCode: safePostgresCode(value.code),
    safeCategory: applicationDiagnosticCategory(code),
    rpc: 'submit_public_application',
    parameterContract: context.parameterContract,
    exam: context.exam,
  };
}

export function createClientValidationDiagnostics(exam: ApplicationDiagnosticExamStatus): ApplicationSubmissionDiagnostics {
  return {
    stage: 'client_validation', httpStatus: null, postgresCode: null, safeCategory: 'validation',
    rpc: 'submit_public_application', parameterContract: 'pass', exam,
  };
}

const DIAGNOSTIC_STAGES = new Set<ApplicationSubmissionStage>(['client_validation', 'rpc_request', 'rpc_response', 'network']);
const DIAGNOSTIC_CATEGORIES = new Set<ApplicationDiagnosticCategory>([
  'request_conflict', 'duplicate_request', 'validation', 'generic_unexpected_error', 'network_error',
  'application_insert_failed', 'application_not_null_failed', 'application_foreign_key_failed',
  'application_unique_failed', 'application_check_failed', 'application_data_format_failed',
  'application_permission_failed', 'application_dependency_failed', 'ledger_insert_failed',
  'helper_function_failed', 'unexpected_database_error',
]);
const DIAGNOSTIC_EXAMS = new Set<ApplicationDiagnosticExamStatus>(['published_open', 'missing_or_closed', 'unknown']);

export function getDevelopmentApplicationDiagnosticRows(
  diagnostics: unknown,
  isDevelopment: boolean,
): ApplicationDiagnosticRow[] | null {
  if (!isDevelopment || !diagnostics || typeof diagnostics !== 'object') return null;
  const value = diagnostics as Partial<ApplicationSubmissionDiagnostics>;
  if (!DIAGNOSTIC_STAGES.has(value.stage as ApplicationSubmissionStage)
      || !DIAGNOSTIC_CATEGORIES.has(value.safeCategory as ApplicationDiagnosticCategory)
      || !DIAGNOSTIC_EXAMS.has(value.exam as ApplicationDiagnosticExamStatus)
      || (value.parameterContract !== 'pass' && value.parameterContract !== 'fail')) return null;
  const rows: ApplicationDiagnosticRow[] = [
    { label: 'Mərhələ', value: value.stage as ApplicationSubmissionStage },
    { label: 'HTTP status', value: safeHttpStatus(value.httpStatus) === null ? 'yoxdur' : String(value.httpStatus) },
    { label: 'PostgreSQL code', value: safePostgresCode(value.postgresCode) ?? 'yoxdur' },
    { label: 'Təhlükəsiz kateqoriya', value: value.safeCategory as ApplicationDiagnosticCategory },
    { label: 'RPC', value: 'submit_public_application' },
    { label: 'Parametr müqaviləsi', value: value.parameterContract },
    { label: 'İmtahan vəziyyəti', value: value.exam as ApplicationDiagnosticExamStatus },
  ];

  if (Number.isInteger(value.selectedExamGradeCount) && (value.selectedExamGradeCount ?? -1) >= 0
      && (value.submittedGradeAllowed === 'pass' || value.submittedGradeAllowed === 'fail')
      && (value.submittedGradeCategory === 'allowed' || value.submittedGradeCategory === 'disallowed'
        || value.submittedGradeCategory === 'unknown')) {
    rows.push(
      { label: 'Seçilmiş imtahan sinif sayı', value: String(value.selectedExamGradeCount) },
      { label: 'Göndərilən sinif uyğundur', value: value.submittedGradeAllowed },
      { label: 'Göndərilən sinif kateqoriyası', value: value.submittedGradeCategory },
    );
  }
  return rows;
}

export function publicApplicationErrorMessage(code: PublicApplicationSubmitErrorCode): string {
  switch (code) {
    case 'request_conflict':
      return 'Bu müraciət açarı ilə fərqli məlumat göndərilib. Səhifəni yeniləyib yenidən cəhd edin.';
    case 'duplicate_request':
      return 'Bu müraciət artıq qəbul edilib. Qeydiyyat nömrəsini yoxlayın.';
    case 'invalid_request':
    case 'invalid_exam':
    case 'invalid_application':
    case 'invalid_phone':
    case 'application_closed':
      return 'Daxil etdiyiniz məlumatları yoxlayın.';
    case 'network_error':
      return 'Serverə qoşulmaq mümkün olmadı. İnternet bağlantısını yoxlayıb yenidən cəhd edin.';
    case 'application_insert_failed':
    case 'application_not_null_failed':
    case 'application_foreign_key_failed':
    case 'application_unique_failed':
    case 'application_check_failed':
    case 'application_data_format_failed':
    case 'application_permission_failed':
    case 'application_dependency_failed':
      return 'Müraciət məlumatlarını yadda saxlamaq mümkün olmadı. Zəhmət olmasa, sonra yenidən cəhd edin.';
    case 'ledger_insert_failed':
      return 'Müraciət qeydiyyatı tamamlana bilmədi. Zəhmət olmasa, sonra yenidən cəhd edin.';
    case 'helper_function_failed':
      return 'Bilet qeydiyyatı üçün texniki xidmət əlçatan olmadı. Zəhmət olmasa, sonra yenidən cəhd edin.';
    case 'unexpected_database_error':
      return 'Serverdə gözlənilməyən texniki xəta baş verdi. Zəhmət olmasa, sonra yenidən cəhd edin.';
    case 'application_submit_failed':
    case 'generic_unexpected_error':
      return 'Müraciəti qəbul etmək mümkün olmadı. Zəhmət olmasa, yenidən cəhd edin.';
  }
  return 'Müraciəti qəbul etmək mümkün olmadı. Zəhmət olmasa, yenidən cəhd edin.';
}

export function toPublicApplicationRpcArgs(input: PublicApplicationInput): Record<string, string | null> {
  return {
    p_idempotency_key: input.idempotencyKey,
    p_exam_id: input.examId,
    p_student_name: input.studentName,
    p_student_surname: input.studentSurname,
    p_student_father_name: input.studentFatherName,
    p_grade: input.grade,
    p_school: input.school,
    p_course_or_tutor: input.courseOrTutor || null,
    p_student_phone: input.studentPhone,
    p_parent_name: input.parentName || null,
    p_parent_phone: input.parentPhone,
    p_city: input.city,
    p_public_note: input.publicNote || null,
  };
}

export function readPublicApplicationResult(
  data: unknown,
  error: unknown,
  context: ApplicationSubmissionDiagnosticContext = { parameterContract: 'pass', exam: 'unknown' },
): PublicApplicationResult {
  if (error) {
    const code = readPublicApplicationErrorCode(error);
    const stage = code === 'network_error' ? 'network' : 'rpc_response';
    const diagnostics = context.includeDiagnostics
      ? createApplicationSubmissionDiagnostics(error, stage, context)
      : undefined;
    throw new PublicApplicationSubmitError(code, diagnostics);
  }
  if (!Array.isArray(data) || data.length !== 1) {
    const safeError = new Error('generic_unexpected_error');
    const diagnostics = context.includeDiagnostics
      ? createApplicationSubmissionDiagnostics(safeError, 'rpc_response', context)
      : undefined;
    throw new PublicApplicationSubmitError('generic_unexpected_error', diagnostics);
  }
  const result = data[0] as { success?: unknown; registration_number?: unknown };
  if (result?.success !== true || typeof result.registration_number !== 'string') {
    const safeError = new Error('generic_unexpected_error');
    const diagnostics = context.includeDiagnostics
      ? createApplicationSubmissionDiagnostics(safeError, 'rpc_response', context)
      : undefined;
    throw new PublicApplicationSubmitError('generic_unexpected_error', diagnostics);
  }
  return { success: true, registrationNumber: result.registration_number };
}
