import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  archiveExam,
  canArchiveExam,
  changeExamStatus,
  createExam,
  EXAM_CATEGORY_LABELS,
  getAllowedExamTransitions,
  getExamResultMessage,
  parseExamResult,
  updateExam,
  validateExamForm,
  type ExamFormInput,
  type ExamRpcClient,
} from '../src/services/examManagementService';
import {
  filterExamSummaries,
  isoToLocalInput,
  localInputToIso,
} from '../src/components/ExamManagementPanel';

const VALID: ExamFormInput = {
  title: '  Buraxılış imtahanı  ',
  category: 'buraxilis',
  organizer: 'Mərkəz',
  grades: ['11'],
  subjects: ['Riyaziyyat', 'Fizika'],
  examDate: '2099-06-01',
  startTime: '10:00',
  endTime: '13:00',
  city: 'Bakı',
  applicationOpenAt: '2099-01-01T08:00:00.000Z',
  applicationDeadline: '2099-05-01T08:00:00.000Z',
  priceDescription: null,
  description: null,
};

interface Call { fn: string; args: Record<string, unknown> }

function fakeClient(response: { data?: unknown; error?: unknown } = { data: { success: true, code: 'created' } }) {
  const calls: Call[] = [];
  const client: ExamRpcClient = {
    rpc(fn, args) {
      calls.push({ fn, args });
      return Promise.resolve({ data: response.data ?? null, error: response.error ?? null });
    },
  };
  return { client, calls };
}

test('valid exam form passes client validation', () => {
  assert.equal(validateExamForm(VALID, '2026-10-16', true), null);
});

test('client validation rejects each invalid field with a specific code', () => {
  const cases: Array<[Partial<ExamFormInput>, string]> = [
    [{ title: '   ' }, 'invalid_title'],
    [{ category: 'unknown' }, 'invalid_category'],
    [{ organizer: '' }, 'invalid_organizer'],
    [{ grades: [] }, 'invalid_grades'],
    [{ grades: ['  '] }, 'invalid_grades'],
    [{ subjects: [] }, 'invalid_subjects'],
    [{ city: ' ' }, 'invalid_city'],
    [{ examDate: '01/06/2099' }, 'invalid_exam_date'],
    [{ examDate: '2020-01-01' }, 'invalid_exam_date'],
    [{ startTime: '13:00', endTime: '10:00' }, 'invalid_time_range'],
    [{ startTime: '10:00', endTime: '10:00' }, 'invalid_time_range'],
    [{ applicationOpenAt: '2099-06-01T00:00:00.000Z', applicationDeadline: '2099-05-01T00:00:00.000Z' }, 'invalid_application_window'],
    [{ applicationOpenAt: 'not-a-date' }, 'invalid_request'],
  ];
  for (const [patch, code] of cases) {
    assert.equal(validateExamForm({ ...VALID, ...patch }, '2026-10-16', true), code, JSON.stringify(patch));
  }
});

test('a past exam date is allowed when the date is unchanged on update', () => {
  assert.equal(validateExamForm({ ...VALID, examDate: '2020-01-01' }, '2026-10-16', false), null);
});

test('status transitions match the safe forward-only table', () => {
  assert.deepEqual(getAllowedExamTransitions('draft'), ['published']);
  assert.deepEqual(getAllowedExamTransitions('published'), ['closed', 'archived']);
  assert.deepEqual(getAllowedExamTransitions('closed'), ['finished', 'archived']);
  assert.deepEqual(getAllowedExamTransitions('finished'), ['archived']);
  assert.deepEqual(getAllowedExamTransitions('archived'), []);
  assert.equal(canArchiveExam('draft'), false);
  assert.equal(canArchiveExam('published'), true);
});

test('unsafe transitions are rejected without calling the database', async () => {
  const { client, calls } = fakeClient();
  const admin = 'admin' as const;
  for (const [from, to] of [['draft', 'finished'], ['published', 'draft'], ['finished', 'published'], ['draft', 'archived'], ['archived', 'published']] as const) {
    const result = await changeExamStatus(admin, 'exam-1', from, to, client);
    assert.equal(result.success, false, `${from}->${to}`);
    assert.equal(result.code, 'invalid_status_transition');
  }
  assert.equal(calls.length, 0);
});

test('a safe status transition calls change_exam_status with only id and target status', async () => {
  const { client, calls } = fakeClient({ data: { success: true, code: 'status_changed' } });
  const result = await changeExamStatus('super_admin', 'exam-1', 'draft', 'published', client);
  assert.equal(result.success, true);
  assert.deepEqual(calls, [{ fn: 'change_exam_status', args: { p_exam_id: 'exam-1', p_status: 'published' } }]);
});

test('archive goes through archive_exam, never through a status write', async () => {
  const { client, calls } = fakeClient({ data: { success: true, code: 'archived' } });
  const result = await archiveExam('admin', 'exam-1', client);
  assert.equal(result.code, 'archived');
  assert.deepEqual(calls, [{ fn: 'archive_exam', args: { p_exam_id: 'exam-1' } }]);
});

test('create sends trimmed, RPC-named parameters', async () => {
  const { client, calls } = fakeClient();
  await createExam('admin', { ...VALID, grades: [' 11 ', ''], subjects: ['Riyaziyyat'] }, client);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].fn, 'create_exam');
  assert.equal(calls[0].args.p_title, 'Buraxılış imtahanı');
  assert.deepEqual(calls[0].args.p_grades, ['11']);
  assert.equal(calls[0].args.p_price_description, null);
  assert.equal(calls[0].args.p_application_open_at, '2099-01-01T08:00:00.000Z');
});

test('update passes the exam id and the date-change flag through validation', async () => {
  const { client, calls } = fakeClient({ data: { success: true, code: 'updated' } });
  const result = await updateExam('admin', 'exam-9', VALID, true, client);
  assert.equal(result.code, 'updated');
  assert.equal(calls[0].fn, 'update_exam');
  assert.equal(calls[0].args.p_exam_id, 'exam-9');
});

test('operator, scanner and anonymous callers never reach the database', async () => {
  for (const role of ['operator', 'scanner', null] as const) {
    const { client, calls } = fakeClient();
    const results = [
      await createExam(role, VALID, client),
      await updateExam(role, 'e', VALID, true, client),
      await changeExamStatus(role, 'e', 'draft', 'published', client),
      await archiveExam(role, 'e', client),
    ];
    for (const result of results) {
      assert.equal(result.success, false);
      assert.equal(result.code, 'not_authorized');
    }
    assert.equal(calls.length, 0, String(role));
  }
});

test('database errors become the fixed fallback message with no raw text', async () => {
  const raw = 'duplicate key value violates unique constraint "exams_pkey" at user@example.com';
  const { client } = fakeClient({ error: { message: raw } });
  const result = await archiveExam('admin', 'exam-1', client);
  assert.equal(result.success, false);
  assert.equal(result.code, 'unavailable');
  assert.doesNotMatch(result.message, /duplicate|constraint|example\.com|exams_pkey/);
});

test('unknown or malformed RPC payloads are rejected safely', () => {
  assert.equal(parseExamResult(null).code, 'unavailable');
  assert.equal(parseExamResult({ success: true, code: 'DROP TABLE' }).code, 'unavailable');
  assert.equal(parseExamResult({ success: 'yes', code: 'created' }).code, 'unavailable');
  const ok = parseExamResult({ success: true, code: 'created', extra: 'secret' });
  assert.deepEqual(Object.keys(ok).sort(), ['code', 'message', 'success']);
});

test('every known result code has a fixed Azerbaijani message without raw identifiers', () => {
  const codes = ['created', 'updated', 'status_changed', 'archived', 'not_authorized', 'unauthenticated', 'not_found', 'exam_locked', 'invalid_status_transition', 'invalid_title', 'unavailable'] as const;
  for (const code of codes) {
    const message = getExamResultMessage(code);
    assert.ok(message.length > 0);
    assert.doesNotMatch(message, /_|sql|rpc|postgres|jwt/i);
  }
});

test('list filter combines status and a case-insensitive text query', () => {
  const exams = [
    { id: '1', status: 'draft', title: 'Riyaziyyat', organizer: 'A', city: 'Bakı' },
    { id: '2', status: 'published', title: 'Fizika', organizer: 'Mərkəz', city: 'Gəncə' },
    { id: '3', status: 'published', title: 'Kimya', organizer: 'B', city: 'bakı' },
  ] as const;
  assert.deepEqual(filterExamSummaries(exams, { status: '', query: '' }).map((e) => e.id), ['1', '2', '3']);
  assert.deepEqual(filterExamSummaries(exams, { status: 'published', query: '' }).map((e) => e.id), ['2', '3']);
  assert.deepEqual(filterExamSummaries(exams, { status: 'published', query: 'BAKI' }).map((e) => e.id), ['3']);
  assert.deepEqual(filterExamSummaries(exams, { status: '', query: 'mərkəz' }).map((e) => e.id), ['2']);
  assert.deepEqual(filterExamSummaries(exams, { status: 'archived', query: '' }), []);
});

test('datetime-local conversion round-trips and rejects empty or invalid values', () => {
  const iso = '2099-01-01T08:30:00.000Z';
  const local = isoToLocalInput(iso);
  assert.match(local, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  assert.equal(localInputToIso(local), new Date(local).toISOString());
  assert.equal(isoToLocalInput(null), '');
  assert.equal(localInputToIso(''), null);
  assert.equal(localInputToIso('not-a-date'), null);
});

test('category labels cover every category the form offers', () => {
  assert.equal(Object.keys(EXAM_CATEGORY_LABELS).length, 5);
});

test('exam panel and service never write tables directly or use service_role', () => {
  for (const file of ['src/components/ExamManagementPanel.tsx', 'src/services/examManagementService.ts']) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /\.(insert|update|delete|upsert)\(/, file);
    assert.doesNotMatch(source, /service_role|SERVICE_ROLE/, file);
  }
});

test('exam panel guards duplicate actions with a ref and disables controls while busy', () => {
  const source = readFileSync('src/components/ExamManagementPanel.tsx', 'utf8');
  assert.match(source, /if \(inFlight\.current\) return;/);
  assert.match(source, /disabled=\{busy\}/);
});

test('exam panel uses the required Azerbaijani labels', () => {
  const source = readFileSync('src/components/ExamManagementPanel.tsx', 'utf8');
  for (const label of ['Yeni imtahan', 'İmtahanı redaktə et', 'Statusu dəyiş', 'Arxivlə', 'Müraciət müddəti', 'Otaqlar və yerlər', 'Təsdiqlənmiş ödənişlər', 'Təyin olunmuş yerlər']) {
    assert.ok(source.includes(label), label);
  }
});

test('archive requires an explicit confirmation step in the panel', () => {
  const source = readFileSync('src/components/ExamManagementPanel.tsx', 'utf8');
  assert.match(source, /confirmArchiveId === exam\.id/);
  assert.match(source, /role="alertdialog"/);
});

test('admin layout routes exams to the new panel and seating to the read-only section', () => {
  const layout = readFileSync('src/components/AdminLayout.tsx', 'utf8');
  assert.match(layout, /case 'exams': return <ExamManagementPanel role=\{role\} \/>;/);
  assert.match(layout, /case 'seating': return <ExamsSection role=\{role\} \/>;/);
});
