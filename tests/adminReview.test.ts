import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ADMIN_ROLES,
  OPERATOR_ROLES,
  getAuthRouteState,
  resolveProtectedRoute,
} from '../src/auth/adminRoutes';
import { runLoginAttempt } from '../src/auth/loginAttempt';
import {
  APPLICATION_DETAIL_FIELDS,
  APPLICATION_REVIEW_PAGE_SIZE,
  APPLICATION_REVIEW_FIELDS,
  ApplicationReviewError,
  getApplicationReviewErrorMessage,
  mapApplicationReviewDetail,
  listApplicationReviewPage,
} from '../src/services/applicationReviewService';
import { buildApplicationReviewQuery } from '../src/services/applicationReviewQuery';
import type { ApplicationStatus, PaymentStatus, TicketStatus } from '../src/types';

const UUID = '11111111-1111-4111-8111-111111111111';

test('resolves only the four exact protected paths', () => {
  assert.equal(resolveProtectedRoute('/admin/login')?.area, 'admin');
  assert.equal(resolveProtectedRoute('/admin')?.login, false);
  assert.equal(resolveProtectedRoute('/operator/login')?.area, 'operator');
  assert.equal(resolveProtectedRoute('/operator')?.login, false);
  for (const path of ['/administrator', '/administer', '/operator-extra', '/operator/login/extra', '/admin/', '/unknown']) {
    assert.equal(resolveProtectedRoute(path), null, path);
  }
});

test('auth route state protects anonymous users and rejects missing/inactive profile roles', () => {
  const common = { loading: false, configurationError: null, allowedRoles: ADMIN_ROLES } as const;
  assert.equal(getAuthRouteState({ ...common, hasSession: false, role: null }), 'login');
  assert.equal(getAuthRouteState({ ...common, hasSession: true, role: null }), 'unauthorized');
  assert.equal(getAuthRouteState({ ...common, hasSession: true, role: 'operator' }), 'unauthorized');
  assert.equal(getAuthRouteState({ ...common, hasSession: true, role: 'admin' }), 'authorized');
  assert.equal(getAuthRouteState({ ...common, hasSession: true, role: 'super_admin' }), 'authorized');
  assert.equal(getAuthRouteState({ ...common, allowedRoles: OPERATOR_ROLES, hasSession: true, role: 'operator' }), 'authorized');
  assert.equal(getAuthRouteState({ ...common, allowedRoles: OPERATOR_ROLES, hasSession: true, role: 'scanner' }), 'authorized');
  assert.equal(getAuthRouteState({ ...common, loading: true, hasSession: false, role: null }), 'loading');
  assert.equal(getAuthRouteState({ ...common, configurationError: 'not configured', hasSession: false, role: null }), 'configuration_error');
});

test('admin and operator role allowlists are deliberately separate', () => {
  assert.deepEqual([...ADMIN_ROLES], ['admin', 'super_admin']);
  assert.deepEqual([...OPERATOR_ROLES], ['operator', 'scanner']);
  assert.equal(ADMIN_ROLES.includes('operator' as never), false);
  assert.equal(OPERATOR_ROLES.includes('super_admin' as never), false);
});

test('login attempt always resets submitting state after thrown errors', async () => {
  const states: boolean[] = [];
  const result = await runLoginAttempt(async () => { throw new Error('private backend detail'); }, ' user@example.invalid ', 'password', (value) => states.push(value));
  assert.equal(result, 'failure');
  assert.deepEqual(states, [true, false]);
});

test('login attempt reports safe success and failure outcomes', async () => {
  const states: boolean[] = [];
  assert.equal(await runLoginAttempt(async (email) => email === 'valid@example.invalid' ? null : 'secret backend detail', ' valid@example.invalid ', 'password', (value) => states.push(value)), 'success');
  assert.equal(await runLoginAttempt(async () => 'raw error', 'user', 'password', (value) => states.push(value)), 'failure');
  assert.deepEqual(states, [true, false, true, false]);
});

function createQueryRecorder() {
  const calls: Array<[string, ...unknown[]]> = [];
  const query = {
    select: (fields: string) => { calls.push(['select', fields]); return query; },
    order: (column: string, options: unknown) => { calls.push(['order', column, options]); return query; },
    range: (from: number, to: number) => { calls.push(['range', from, to]); return query; },
    eq: (column: string, value: unknown) => { calls.push(['eq', column, value]); return query; },
    ilike: (column: string, value: unknown) => { calls.push(['ilike', column, value]); return query; },
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
  };
  const client = { from: (table: string) => { calls.push(['from', table]); return query; } };
  return { client, calls };
}

test('non-admin roles are rejected by the review service before any database query', async () => {
  await assert.rejects(() => listApplicationReviewPage('operator', 0), (error: unknown) => error instanceof ApplicationReviewError && error.code === 'not_authorized');
  await assert.rejects(() => listApplicationReviewPage('scanner', 0), (error: unknown) => error instanceof ApplicationReviewError && error.code === 'not_authorized');
  await assert.rejects(() => listApplicationReviewPage(null, 0), (error: unknown) => error instanceof ApplicationReviewError && error.code === 'not_authorized');
});

test('builds bounded newest-first pagination and filter/search query without mutations', () => {
  const { client, calls } = createQueryRecorder();
  buildApplicationReviewQuery(client as never, 2, {
    examId: UUID,
    applicationStatus: 'pending',
    paymentStatus: 'not_submitted',
    registrationSearch: ' OIM-2026 ',
  });
  assert.deepEqual(calls[0], ['from', 'applications']);
  assert.deepEqual(calls[1], ['select', APPLICATION_REVIEW_FIELDS.join(',')]);
  assert.deepEqual(calls[2], ['order', 'created_at', { ascending: false }]);
  assert.deepEqual(calls[3], ['order', 'registration_number', { ascending: true }]);
  assert.deepEqual(calls[4], ['range', 2 * APPLICATION_REVIEW_PAGE_SIZE, 3 * APPLICATION_REVIEW_PAGE_SIZE]);
  assert.ok(calls.some(([method, column, value]) => method === 'eq' && column === 'exam_id' && value === UUID));
  assert.ok(calls.some(([method, column, value]) => method === 'eq' && column === 'application_status' && value === 'pending'));
  assert.ok(calls.some(([method, column, value]) => method === 'eq' && column === 'payment_status' && value === 'not_submitted'));
  assert.ok(calls.some(([method, column, value]) => method === 'ilike' && column === 'registration_number' && value === '%OIM-2026%'));
  assert.equal(calls.some(([method]) => ['insert', 'update', 'delete', 'rpc'].includes(method)), false);
});

test('selects only allowlisted fields and does not fetch ledger, raw phones, internal notes, or UUID IDs', () => {
  assert.deepEqual(APPLICATION_REVIEW_FIELDS, [
    'registration_number', 'exam:exams(title)', 'student_name', 'student_surname', 'grade', 'school',
    'application_status', 'payment_status', 'ticket_status', 'created_at',
  ]);
  assert.ok(!APPLICATION_REVIEW_FIELDS.some((field) => /phone|internal|ledger|id$|application_submission_requests/i.test(field)));
  assert.deepEqual(APPLICATION_DETAIL_FIELDS, [
    'registration_number', 'exam:exams(title)', 'student_name', 'student_surname', 'student_father_name',
    'grade', 'school', 'student_phone', 'application_status', 'payment_status', 'ticket_status', 'created_at',
    'assigned_building_id', 'assigned_room_id', 'assigned_seat_id',
  ]);
  assert.ok(!APPLICATION_DETAIL_FIELDS.some((field) => /parent|normalized|internal|ledger|(^|:)id$/i.test(field)));
});

test('detail projection returns only allowlisted detail properties', () => {
  const row = {
    registration_number: 'OIM-2026-ABC', exam: { title: 'Review exam' }, student_name: 'Student', student_surname: 'Example',
    student_father_name: 'Parent', grade: '9', school: 'School', student_phone: '+994000000000',
    application_status: 'pending' as ApplicationStatus, payment_status: 'not_submitted' as PaymentStatus,
    ticket_status: 'not_created' as TicketStatus, created_at: '2026-01-01T00:00:00Z',
    id: UUID, parent_phone: '+994111111111', internal_note: 'private', payload_digest: 'private',
    assigned_building_id: null, assigned_room_id: null, assigned_seat_id: null,
  };
  const result = mapApplicationReviewDetail(row);
  assert.deepEqual(Object.keys(result).sort(), [
    'applicationId', 'applicationStatus', 'assignedBuildingId', 'assignedRoomId', 'assignedSeatId', 'createdAt', 'examTitle', 'grade', 'paymentStatus', 'registrationNumber', 'school',
    'studentFatherName', 'studentName', 'studentPhone', 'studentSurname', 'ticketStatus',
  ].sort());
  assert.equal('id' in result, false);
  assert.equal('parent_phone' in result, false);
  assert.equal('payload_digest' in result, false);
});

test('review service contains only read query methods and never references private ledger', () => {
  const servicePath = fileURLToPath(new URL('../src/services/applicationReviewService.ts', import.meta.url));
  const queryPath = fileURLToPath(new URL('../src/services/applicationReviewQuery.ts', import.meta.url));
  const source = `${readFileSync(servicePath, 'utf8')}\n${readFileSync(queryPath, 'utf8')}`;
  assert.doesNotMatch(source, /\.\s*(?:insert|update|delete|upsert)\s*\(/);
  assert.doesNotMatch(source, /application_submission_requests|private\./);
});

test('safe read errors never expose raw backend messages', () => {
  const raw = new Error('password, JWT, database SQL and phone number secret');
  assert.equal(getApplicationReviewErrorMessage(raw), 'Müraciət məlumatlarını yükləmək mümkün olmadı. Yenidən cəhd edin.');
  assert.equal(getApplicationReviewErrorMessage(new ApplicationReviewError('unavailable')), 'Müraciət məlumatlarını yükləmək mümkün olmadı. Yenidən cəhd edin.');
});
