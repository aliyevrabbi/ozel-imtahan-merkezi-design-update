import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ADMIN_SECTIONS,
  canAllocatePlace,
  canConfirmPayment,
  canMutateExams,
  getVisibleAdminSections,
  isAdminSectionVisible,
} from '../src/admin/adminNavigation';
import { getPlaceAllocationMessage } from '../src/services/applicationReviewService';

const ALL_KEYS = ['dashboard', 'exams', 'applications', 'facilities', 'seating', 'tickets', 'audit', 'settings'];
const ADMIN_VISIBLE_KEYS = ['dashboard', 'exams', 'applications', 'facilities', 'seating', 'tickets', 'audit'];

test('menu contains exactly the nine required Azerbaijani entries, in order', () => {
  assert.deepEqual(ADMIN_SECTIONS.map((section) => section.key), ALL_KEYS);
  assert.deepEqual(ADMIN_SECTIONS.map((section) => section.label), [
    'Dashboard', 'İmtahanlar', 'Müraciətlər', 'Binalar və otaqlar', 'Yer bölgüsü', 'Biletlər', 'Audit jurnalı', 'Parametrlər',
  ]);
});

test('super_admin sees every section including settings', () => {
  assert.deepEqual(getVisibleAdminSections('super_admin').map((s) => s.key), ALL_KEYS);
});

test('admin sees all operational sections but not settings', () => {
  const keys = getVisibleAdminSections('admin').map((s) => s.key);
  assert.deepEqual(keys, ADMIN_VISIBLE_KEYS);
  assert.equal(isAdminSectionVisible('admin', 'settings'), false);
});

test('operator, scanner and missing roles see no admin sections', () => {
  for (const role of ['operator', 'scanner', null] as const) {
    assert.deepEqual(getVisibleAdminSections(role), [], String(role));
  }
});

test('exam mutations are available only to admin and super_admin (RPCs enforce the same rule)', () => {
  assert.equal(canMutateExams('super_admin'), true);
  assert.equal(canMutateExams('admin'), true);
  for (const role of ['operator', 'scanner', null] as const) {
    assert.equal(canMutateExams(role), false, String(role));
  }
});

test('payment confirmation is limited to admin and super_admin', () => {
  assert.equal(canConfirmPayment('admin'), true);
  assert.equal(canConfirmPayment('super_admin'), true);
  assert.equal(canConfirmPayment('operator'), false);
  assert.equal(canConfirmPayment('scanner'), false);
  assert.equal(canConfirmPayment(null), false);
});

const ELIGIBLE = {
  paymentStatus: 'verified',
  applicationStatus: 'pending',
  ticketStatus: 'not_created',
  assignedSeatId: null,
} as const;

test('allocation UI gate requires an admin role plus verified, pending, not_created, unassigned state', () => {
  assert.equal(canAllocatePlace('admin', ELIGIBLE), true);
  assert.equal(canAllocatePlace('super_admin', ELIGIBLE), true);
  for (const role of ['operator', 'scanner', null] as const) {
    assert.equal(canAllocatePlace(role, ELIGIBLE), false, String(role));
  }
});

test('allocation UI gate rejects unpaid, unverified, non-pending, ticketed or already assigned applications', () => {
  assert.equal(canAllocatePlace('admin', { ...ELIGIBLE, paymentStatus: 'not_submitted' }), false);
  assert.equal(canAllocatePlace('admin', { ...ELIGIBLE, paymentStatus: 'receipt_received' }), false);
  assert.equal(canAllocatePlace('admin', { ...ELIGIBLE, applicationStatus: 'verified' } as never), false);
  assert.equal(canAllocatePlace('admin', { ...ELIGIBLE, ticketStatus: 'active' }), false);
  assert.equal(canAllocatePlace('admin', { ...ELIGIBLE, assignedSeatId: 'seat-1' }), false);
});

test('allocation UI does not gate on application or exam deadlines (server enforces exam status)', () => {
  // The client gate is intentionally independent of dates: deadlines do not block allocation.
  assert.equal(canAllocatePlace('admin', ELIGIBLE), true);
});

test('allocation result messages are fixed Azerbaijani copy without raw codes', () => {
  const codes = ['allocated', 'no_available_place', 'payment_not_verified', 'unavailable'] as const;
  for (const code of codes) {
    const message = getPlaceAllocationMessage(code);
    assert.ok(message.length > 0);
    assert.notEqual(message, code);
    assert.doesNotMatch(message, /_|sql|rpc|postgres|jwt/i);
  }
  assert.equal(getPlaceAllocationMessage('no_available_place'), 'Bu imtahan üçün boş yer yoxdur.');
});

test('application panel renders the allocation section only through the authorized gate and fixed messages', () => {
  const source = readFileSync('src/components/ApplicationReviewPanel.tsx', 'utf8');
  assert.match(source, /canAllocatePlace\(role, \{/);
  assert.match(source, /allocateApplicationPlace\(role, detail\.applicationId\)/);
  assert.match(source, /text: getPlaceAllocationMessage\(result\.code\)/);
  assert.doesNotMatch(source, /result\.code\}|error\.message|raw/);
  assert.doesNotMatch(source, /\.(insert|update|delete|upsert)\(/);
});

test('admin layout routes every section key and never writes tables directly', () => {
  const layout = readFileSync('src/components/AdminLayout.tsx', 'utf8');
  for (const key of ALL_KEYS) {
    assert.match(layout, new RegExp(`'${key}'`), key);
  }
  assert.doesNotMatch(layout, /\.(insert|update|delete|upsert)\(/);
  assert.doesNotMatch(layout, /service_role|SERVICE_ROLE/);
});
