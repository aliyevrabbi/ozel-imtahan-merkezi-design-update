import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  getDevelopmentApplicationDiagnosticRows,
  publicApplicationErrorMessage,
  PublicApplicationSubmitError,
  readPublicApplicationErrorCode,
  normalizeAzerbaijaniMobile,
  readPublicApplicationResult,
  sanitizeAzerbaijaniMobileInput,
  simplifiedApplicationFormErrorMessage,
  submitSimplifiedPublicApplicationForm,
  submitWithAllowedApplicationGrade,
  toPublicApplicationRpcArgs,
} from '../src/services/applicationContract';
import type { PublicApplicationInput } from '../src/services/applicationContract';

const input: PublicApplicationInput = {
  idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  examId: '11111111-1111-4111-8111-111111111111',
  studentName: 'Synthetic', studentSurname: 'Student', studentFatherName: 'Test Father',
  grade: '9', school: 'Synthetic School', courseOrTutor: '', studentPhone: '+994501234567',
  parentName: '', parentPhone: '+994501234567', city: 'Test şəhəri', publicNote: '',
};

test('submission RPC returns only the minimal accepted response and sends only allowed parameters', async () => {
  const requestBody = toPublicApplicationRpcArgs(input);
  const result = readPublicApplicationResult([{
    success: true,
    application_id: 'internal-app-uuid',
    registration_number: 'OIM-2035-ABCDEF012345',
    student_phone: '+994 50 123 45 67',
    parent_phone: '+994 50 765 43 21',
    internal_note: 'private note',
    payment_status: 'verified',
    ticket_id: 'internal-ticket-id',
    assigned_seat_id: 'internal-seat-id',
  }], null);
  assert.deepEqual(result, { success: true, registrationNumber: 'OIM-2035-ABCDEF012345' });
  assert.equal('applicationId' in result, false);
  assert.equal('application_id' in result, false);
  assert.equal(Object.keys(requestBody).length, 13);
  assert.deepEqual(Object.keys(requestBody).sort(), [
      'p_course_or_tutor', 'p_exam_id', 'p_grade', 'p_idempotency_key', 'p_parent_name',
      'p_parent_phone', 'p_public_note', 'p_school', 'p_student_father_name',
      'p_student_name', 'p_student_phone', 'p_student_surname', 'p_city',
  ].sort());
  assert.equal('application_status' in requestBody, false);
  assert.equal('assigned_seat_id' in requestBody, false);
});

test('simplified form exposes only required visible controls and no legacy contact/location inputs', () => {
  const formSource = readFileSync(fileURLToPath(new URL('../src/components/ApplicationForm.tsx', import.meta.url)), 'utf8');
  assert.match(formSource, /Mobil nömrə/);
  assert.match(formSource, /Ata adı/);
  assert.match(formSource, /İmtahanı Seçin/);
  assert.match(formSource, /Sinif \*/);
  assert.match(formSource, /Təhsil Aldığı Məktəb/);
  assert.match(formSource, /application-mobile/);
  assert.doesNotMatch(formSource, /Şagirdin Telefonu|Valideynin Telefonu|Valideynin Adı Soyadı|Kurs \/ müəllim|<label[^>]*>\s*Şəhər/);
  assert.equal((formSource.match(/label htmlFor="application-mobile"/g) ?? []).length, 1);
  assert.equal((formSource.match(/name="mobile"/g) ?? []).length, 1);
  assert.match(formSource, /<span aria-hidden="true"[^>]*>\+994<\/span>/);
  assert.doesNotMatch(formSource, /name="(?:studentPhone|parentPhone|parentName|courseOrTutor|city)"/);
});

test('mobile sanitizer accepts only the local suffix, strips invalid characters, and avoids a second +994 prefix', () => {
  assert.equal(sanitizeAzerbaijaniMobileInput('50a 123-45(67)'), '501234567');
  assert.equal(sanitizeAzerbaijaniMobileInput('+994 50 123 45 67'), '501234567');
  assert.equal(sanitizeAzerbaijaniMobileInput('+ 994 50 123 45 67'), '501234567');
  assert.equal(sanitizeAzerbaijaniMobileInput('00994 50 123 45 67'), '501234567');
  assert.equal(normalizeAzerbaijaniMobile(sanitizeAzerbaijaniMobileInput('+994 50 123 45 67')), '+994501234567');
  assert.equal(normalizeAzerbaijaniMobile('50123456'), null);
  assert.equal(normalizeAzerbaijaniMobile('501234567'), '+994501234567');
});

test('simplified form maps one canonical mobile to both phone parameters and nulls removed optional values', async () => {
  let rpcCallCount = 0;
  const outcome = await submitSimplifiedPublicApplicationForm({
    idempotencyKey: input.idempotencyKey, examId: input.examId, studentName: input.studentName,
    studentSurname: input.studentSurname, studentFatherName: input.studentFatherName,
    grade: '9', school: input.school, mobileDigits: '501234567', selectedExamCity: ' Gəncə ',
  }, async (mapped) => {
    rpcCallCount += 1;
    const args = toPublicApplicationRpcArgs(mapped);
    assert.equal(args.p_student_phone, '+994501234567');
    assert.equal(args.p_parent_phone, '+994501234567');
    assert.equal(args.p_parent_name, null);
    assert.equal(args.p_course_or_tutor, null);
    assert.equal(args.p_city, 'Gəncə');
    assert.equal(args.p_grade, '9');
    assert.equal(Object.keys(args).length, 13);
    return { success: true, registrationNumber: 'OIM-2035-ABCDEF012345' };
  });
  assert.deepEqual(outcome, { submitted: true, result: { success: true, registrationNumber: 'OIM-2035-ABCDEF012345' } });
  assert.equal(rpcCallCount, 1);
});

test('missing selected exam city and incomplete mobile block submission before RPC', async () => {
  let rpcCallCount = 0;
  const base = {
    idempotencyKey: input.idempotencyKey, examId: input.examId, studentName: input.studentName,
    studentSurname: input.studentSurname, studentFatherName: input.studentFatherName,
    grade: '9', school: input.school, mobileDigits: '501234567',
  };
  const submit = async () => {
    rpcCallCount += 1;
    return { success: true as const, registrationNumber: 'OIM-2035-ABCDEF012345' };
  };
  assert.deepEqual(await submitSimplifiedPublicApplicationForm({ ...base, selectedExamCity: '  ' }, submit), {
    submitted: false, reason: 'missing_city',
  });
  assert.equal(simplifiedApplicationFormErrorMessage('missing_city'), 'Seçilmiş imtahan üçün şəhər məlumatı təyin edilməyib.');
  assert.deepEqual(await submitSimplifiedPublicApplicationForm({ ...base, selectedExamCity: 'Gəncə', mobileDigits: '50123456' }, submit), {
    submitted: false, reason: 'invalid_phone',
  });
  assert.equal(rpcCallCount, 0);
});

test('grade 9 is allowed for an exam whose only supported grade is 9', () => {
  let rpcCallCount = 0;
  const submission = submitWithAllowedApplicationGrade(['9'], '9', (grade) => {
    rpcCallCount += 1;
    return toPublicApplicationRpcArgs({ ...input, grade });
  });

  assert.equal(submission.allowed, true);
  if (!submission.allowed) return;
  assert.equal(submission.result.p_grade, '9');
  assert.equal(rpcCallCount, 1);
  assert.equal(submission.selectedExamGradeCount, 1);
  assert.equal(submission.submittedGradeAllowed, 'pass');
  assert.equal(submission.submittedGradeCategory, 'allowed');
});

test('grade 11 is blocked for an exam whose only supported grade is 9', () => {
  let rpcCallCount = 0;
  const submission = submitWithAllowedApplicationGrade(['9'], '11', () => {
    rpcCallCount += 1;
  });

  assert.deepEqual(submission, {
    allowed: false,
    selectedExamGradeCount: 1,
    submittedGradeAllowed: 'fail',
    submittedGradeCategory: 'disallowed',
  });
  assert.equal(rpcCallCount, 0);
  assert.equal(publicApplicationErrorMessage('invalid_application'), 'Daxil etdiyiniz məlumatları yoxlayın.');
});

test('empty/loading exam grades block submission until a valid grade is selected', () => {
  let rpcCallCount = 0;
  const pending = submitWithAllowedApplicationGrade([], '11', () => {
    rpcCallCount += 1;
  });
  assert.deepEqual(pending, {
    allowed: false,
    selectedExamGradeCount: 0,
    submittedGradeAllowed: 'fail',
    submittedGradeCategory: 'unknown',
  });
  assert.equal(rpcCallCount, 0);

  const loaded = submitWithAllowedApplicationGrade(['9'], '9', () => {
    rpcCallCount += 1;
  });
  assert.equal(loaded.allowed, true);
  assert.equal(rpcCallCount, 1);
});

test('submission service maps every exact known P0001 category to the existing safe Azerbaijani toast message', () => {
  const cases = [
    ['invalid_request', 'Daxil etdiyiniz məlumatları yoxlayın.'],
    ['invalid_exam', 'Daxil etdiyiniz məlumatları yoxlayın.'],
    ['invalid_application', 'Daxil etdiyiniz məlumatları yoxlayın.'],
    ['invalid_phone', 'Daxil etdiyiniz məlumatları yoxlayın.'],
    ['application_closed', 'Daxil etdiyiniz məlumatları yoxlayın.'],
    ['request_conflict', 'Bu müraciət açarı ilə fərqli məlumat göndərilib. Səhifəni yeniləyib yenidən cəhd edin.'],
    ['duplicate_request', 'Bu müraciət artıq qəbul edilib. Qeydiyyat nömrəsini yoxlayın.'],
  ] as const;

  for (const [category, expectedMessage] of cases) {
    const error = { code: 'P0001', message: category };
    const safeCode = readPublicApplicationErrorCode(error);
    assert.equal(safeCode, category);
    assert.equal(publicApplicationErrorMessage(safeCode), expectedMessage);

    assert.throws(
      () => readPublicApplicationResult(null, error),
      (thrown: unknown) => thrown instanceof PublicApplicationSubmitError
        && thrown.code === category
        && publicApplicationErrorMessage(thrown.code) === expectedMessage,
    );
  }
});

test('all fixed application INSERT SQLSTATE categories are recognized and displayed safely in development', () => {
  const cases = [
    ['application_insert_failed', 'Müraciət məlumatlarını yadda saxlamaq mümkün olmadı. Zəhmət olmasa, sonra yenidən cəhd edin.'],
    ['application_not_null_failed', 'Müraciət məlumatlarını yadda saxlamaq mümkün olmadı. Zəhmət olmasa, sonra yenidən cəhd edin.'],
    ['application_foreign_key_failed', 'Müraciət məlumatlarını yadda saxlamaq mümkün olmadı. Zəhmət olmasa, sonra yenidən cəhd edin.'],
    ['application_unique_failed', 'Müraciət məlumatlarını yadda saxlamaq mümkün olmadı. Zəhmət olmasa, sonra yenidən cəhd edin.'],
    ['application_check_failed', 'Müraciət məlumatlarını yadda saxlamaq mümkün olmadı. Zəhmət olmasa, sonra yenidən cəhd edin.'],
    ['application_data_format_failed', 'Müraciət məlumatlarını yadda saxlamaq mümkün olmadı. Zəhmət olmasa, sonra yenidən cəhd edin.'],
    ['application_permission_failed', 'Müraciət məlumatlarını yadda saxlamaq mümkün olmadı. Zəhmət olmasa, sonra yenidən cəhd edin.'],
    ['application_dependency_failed', 'Müraciət məlumatlarını yadda saxlamaq mümkün olmadı. Zəhmət olmasa, sonra yenidən cəhd edin.'],
    ['ledger_insert_failed', 'Müraciət qeydiyyatı tamamlana bilmədi. Zəhmət olmasa, sonra yenidən cəhd edin.'],
    ['helper_function_failed', 'Bilet qeydiyyatı üçün texniki xidmət əlçatan olmadı. Zəhmət olmasa, sonra yenidən cəhd edin.'],
    ['unexpected_database_error', 'Serverdə gözlənilməyən texniki xəta baş verdi. Zəhmət olmasa, sonra yenidən cəhd edin.'],
  ] as const;

  for (const [category, expectedMessage] of cases) {
    const error = { code: 'P0001', message: category };
    assert.equal(readPublicApplicationErrorCode(error), category);
    assert.equal(publicApplicationErrorMessage(category), expectedMessage);
    assert.throws(
      () => readPublicApplicationResult(null, error),
      (thrown: unknown) => thrown instanceof PublicApplicationSubmitError
        && thrown.code === category
        && thrown.message === category,
    );

    const rows = getDevelopmentApplicationDiagnosticRows({
      stage: 'rpc_response', httpStatus: 400, postgresCode: 'P0001', safeCategory: category,
      rpc: 'submit_public_application', parameterContract: 'pass', exam: 'published_open',
    }, true);
    assert.ok(rows);
    assert.deepEqual(rows.find(({ label }) => label === 'Təhlükəsiz kateqoriya'), {
      label: 'Təhlükəsiz kateqoriya', value: category,
    });

    const developmentError = (() => {
      try {
        readPublicApplicationResult(null, error, {
          parameterContract: 'pass', exam: 'published_open', includeDiagnostics: true,
        });
      } catch (thrown) {
        return thrown as PublicApplicationSubmitError;
      }
      throw new Error('expected readPublicApplicationResult to reject');
    })();
    const diagnosticRows = getDevelopmentApplicationDiagnosticRows(developmentError.diagnostics, true);
    assert.deepEqual(diagnosticRows?.find(({ label }) => label === 'Təhlükəsiz kateqoriya'), {
      label: 'Təhlükəsiz kateqoriya', value: category,
    });
  }
});

test('unknown diagnostic categories fall back to generic and are not rendered in development', () => {
  const rawBackendMessage = 'private table detail with phone +994501234567';
  assert.equal(readPublicApplicationErrorCode({ code: 'P0001', message: 'private_insert_failure ' + rawBackendMessage }), 'generic_unexpected_error');
  assert.equal(publicApplicationErrorMessage('generic_unexpected_error'), 'Müraciəti qəbul etmək mümkün olmadı. Zəhmət olmasa, yenidən cəhd edin.');
  assert.equal(getDevelopmentApplicationDiagnosticRows({
    stage: 'rpc_response', httpStatus: 400, postgresCode: 'P0001', safeCategory: 'private_insert_failure',
    rpc: 'submit_public_application', parameterContract: 'pass', exam: 'published_open', message: rawBackendMessage,
  }, true), null);
  assert.equal(publicApplicationErrorMessage(readPublicApplicationErrorCode({ code: 'P0001', message: rawBackendMessage })).includes(rawBackendMessage), false);
});

test('unknown and non-exact P0001 messages remain generic and never leak backend text', () => {
  const rawBackendMessage = 'private database detail: student_phone +994501234567';
  const errors = [
    { code: 'P0001', message: rawBackendMessage, details: rawBackendMessage, hint: rawBackendMessage },
    { code: 'P0001', message: 'invalid_phone: ' + rawBackendMessage },
    { code: 'P0001', message: ' invalid_phone ' },
    { code: 'P0001', message: 'application_submit_failed' },
  ];

  for (const error of errors) {
    const safeCode = readPublicApplicationErrorCode(error);
    const userMessage = publicApplicationErrorMessage(safeCode);
    assert.equal(safeCode, 'generic_unexpected_error');
    assert.equal(userMessage, 'Müraciəti qəbul etmək mümkün olmadı. Zəhmət olmasa, yenidən cəhd edin.');
    assert.equal(userMessage.includes(rawBackendMessage), false);
    assert.equal(userMessage.includes('+994501234567'), false);

    assert.throws(
      () => readPublicApplicationResult(null, error),
      (thrown: unknown) => thrown instanceof PublicApplicationSubmitError
        && thrown.code === 'generic_unexpected_error'
        && !thrown.message.includes(rawBackendMessage)
        && !thrown.message.includes('+994501234567'),
    );
  }
});

test('production submission errors carry no diagnostic fields and production projection omits debug rows', () => {
  let productionError: unknown;
  try {
    readPublicApplicationResult(null, { code: 'P0001', message: 'application_insert_failed', status: 400 }, {
      parameterContract: 'pass', exam: 'published_open', includeDiagnostics: false,
    });
  } catch (error) {
    productionError = error;
  }
  assert.ok(productionError instanceof PublicApplicationSubmitError);
  assert.equal(productionError.diagnostics, undefined);
  const productionToast = publicApplicationErrorMessage(productionError.code);
  assert.equal(productionToast, 'Müraciət məlumatlarını yadda saxlamaq mümkün olmadı. Zəhmət olmasa, sonra yenidən cəhd edin.');
  assert.equal(productionToast.includes('application_insert_failed'), false);
  assert.equal(productionToast.includes('unknown backend message'), false);

  const rows = getDevelopmentApplicationDiagnosticRows({
    stage: 'rpc_response', httpStatus: 400, postgresCode: 'P0001', safeCategory: 'generic_unexpected_error',
    rpc: 'submit_public_application',    parameterContract: 'pass', exam: 'published_open',
    selectedExamGradeCount: 1, submittedGradeAllowed: 'pass', submittedGradeCategory: 'allowed',
  }, false);
  assert.equal(rows, null);
});

test('development diagnostics projection exposes only allowlisted sanitized fields', () => {
  const sensitiveValues = [
    'studentPhone +994501234567',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'eyJhbGciOiJIUzI1NiJ9.private-token',
    'select * from private.application_submission_requests',
    'application_submission_requests.student_phone',
  ];
  const rows = getDevelopmentApplicationDiagnosticRows({
    stage: 'rpc_response',
    httpStatus: 400,
    postgresCode: 'P0001 with raw message',
    safeCategory: 'generic_unexpected_error',
    rpc: 'submit_public_application',
    parameterContract: 'pass',
    exam: 'published_open',
    selectedExamGradeCount: 1,
    submittedGradeAllowed: 'fail',
    submittedGradeCategory: 'disallowed',
    message: sensitiveValues[0],
    details: sensitiveValues.join(' '),
    payload: sensitiveValues,
    token: sensitiveValues[2],
  }, true);
  assert.ok(rows);
  assert.deepEqual(rows, [
    { label: 'Mərhələ', value: 'rpc_response' },
    { label: 'HTTP status', value: '400' },
    { label: 'PostgreSQL code', value: 'yoxdur' },
    { label: 'Təhlükəsiz kateqoriya', value: 'generic_unexpected_error' },
    { label: 'RPC', value: 'submit_public_application' },
    { label: 'Parametr müqaviləsi', value: 'pass' },
    { label: 'İmtahan vəziyyəti', value: 'published_open' },
    { label: 'Seçilmiş imtahan sinif sayı', value: '1' },
    { label: 'Göndərilən sinif uyğundur', value: 'fail' },
    { label: 'Göndərilən sinif kateqoriyası', value: 'disallowed' },
  ]);
  const renderedFields = rows.map(({ label, value }) => `${label}: ${value}`).join('\n');
  for (const secret of sensitiveValues) assert.equal(renderedFields.includes(secret), false);
  assert.equal(renderedFields.includes('P0001 with raw message'), false);
});

test('diagnostic builder exposes SQLSTATE only as the exact code P0001', () => {
  const rawMessage = 'P0001: private.application_submission_requests contains phone +994501234567';
  const error = Object.assign(new Error(rawMessage), { code: 'P0001', status: 400, details: rawMessage, hint: rawMessage });
  const safeError = (() => {
    try {
      readPublicApplicationResult(null, error, { parameterContract: 'pass', exam: 'published_open', includeDiagnostics: true });
    } catch (thrown) {
      return thrown as PublicApplicationSubmitError;
    }
    throw new Error('expected readPublicApplicationResult to reject');
  })();
  const rows = getDevelopmentApplicationDiagnosticRows(safeError.diagnostics, true);
  assert.ok(rows);
  assert.deepEqual(rows.find(({ label }) => label === 'PostgreSQL code'), { label: 'PostgreSQL code', value: 'P0001' });
  const renderedFields = rows.map(({ label, value }) => `${label}: ${value}`).join('\n');
  assert.equal(renderedFields.includes(rawMessage), false);
  assert.equal(renderedFields.includes('application_submission_requests'), false);
  assert.equal(renderedFields.includes('+994501234567'), false);
  assert.equal(safeError.message.includes('P0001'), false);
});

test('diagnostic projection rejects unsafe diagnostic enum values and exposes no raw values', () => {
  assert.equal(getDevelopmentApplicationDiagnosticRows({
    stage: 'private SQL query', httpStatus: 400, postgresCode: 'P0001',
    safeCategory: 'generic_unexpected_error', rpc: 'submit_public_application',
    parameterContract: 'pass', exam: 'published_open',
  }, true), null);
});

test('submission service maps network/fetch failures to a safe network category', () => {
  assert.equal(readPublicApplicationErrorCode({ status: 0, message: 'FetchError: private endpoint text' }), 'network_error');
  assert.equal(readPublicApplicationErrorCode(new TypeError('Failed to fetch internal endpoint')), 'network_error');
  assert.equal(publicApplicationErrorMessage('network_error'), 'Serverə qoşulmaq mümkün olmadı. İnternet bağlantısını yoxlayıb yenidən cəhd edin.');
});

test('submission service maps unexpected errors generically and preserves the generic Azerbaijani message', () => {
  const rawDatabaseError = {
    message: 'duplicate key at private.application_submission_requests; phone value redacted',
    code: '23505', details: 'sensitive row detail', hint: 'private schema hint',
  };
  const genericMessage = 'Müraciəti qəbul etmək mümkün olmadı. Zəhmət olmasa, yenidən cəhd edin.';
  assert.equal(readPublicApplicationErrorCode(rawDatabaseError), 'generic_unexpected_error');
  assert.equal(publicApplicationErrorMessage(readPublicApplicationErrorCode(rawDatabaseError)), genericMessage);
  assert.equal(readPublicApplicationErrorCode({ message: 'private text', code: 'P0001' }), 'generic_unexpected_error');
  assert.equal(publicApplicationErrorMessage('generic_unexpected_error'), genericMessage);
  assert.equal(publicApplicationErrorMessage('application_submit_failed'), genericMessage);
});

test('submission service hides raw database errors and private details', () => {
  const unsafeErrors = [
    { message: 'duplicate key value violates constraint private.application_submission_requests_idempotency_key_unique', code: '23505', details: 'phone +994501234567' },
    { message: 'SQL statement failed near private.application_submission_requests', code: '42601', hint: 'internal detail' },
    { message: 'P0001: student phone +12025550101', code: 'P0001' },
    null,
  ];
  for (const error of unsafeErrors) {
    assert.equal(readPublicApplicationErrorCode(error), 'generic_unexpected_error');
  }
  assert.throws(
    () => readPublicApplicationResult(null, unsafeErrors[0]),
    (error: unknown) => error instanceof PublicApplicationSubmitError
      && error.code === 'generic_unexpected_error'
      && !error.message.includes('23505') && !error.message.includes('+994'),
  );
});
