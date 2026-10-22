import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AppRole } from '../src/types';
import {
  ApplicationReviewError,
  confirmApplicationPaymentWithClient,
  getPaymentConfirmationErrorMessage,
  getPaymentConfirmationMessage,
  getPaymentPanelState,
  getPaymentPanelText,
} from '../src/services/applicationReviewService';
import type { PaymentConfirmationClient } from '../src/services/applicationReviewService';

const UUID = '11111111-2222-4333-8444-555555555555';
const MIGRATION_PATH = fileURLToPath(new URL('../supabase/migrations/20261015120000_phase3b_confirm_application_payment.sql', import.meta.url));
const PANEL_PATH = fileURLToPath(new URL('../src/components/ApplicationReviewPanel.tsx', import.meta.url));
const SERVICE_PATH = fileURLToPath(new URL('../src/services/applicationReviewService.ts', import.meta.url));

function recordingClient(response: { data: unknown; error: unknown | null } | (() => never)) {
  const calls: Array<{ fn: string; args: { p_application_id: string } }> = [];
  const client: PaymentConfirmationClient = {
    rpc(fn, args) {
      calls.push({ fn, args });
      if (typeof response === 'function') return response();
      return Promise.resolve(response);
    },
  };
  return { client, calls };
}

test('RPC contract: SECURITY DEFINER, pinned search_path, row lock, role gate, and only the payment status changes', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  assert.match(sql, /create or replace function public\.confirm_application_payment\(p_application_id uuid\)/);
  assert.match(sql, /security definer\s+set search_path = ''/);
  assert.match(sql, /if v_actor_id is null then/);
  assert.match(sql, /private\.has_any_role\(array\['super_admin', 'admin'\]::public\.app_role\[\]\)/);
  assert.match(sql, /for update;/);
  assert.match(sql, /v_application\.payment_status = 'verified'/);
  assert.match(sql, /v_application\.payment_status <> 'not_submitted' or v_application\.application_status <> 'pending'/);
  assert.match(sql, /set payment_status = 'verified',\s+updated_at = now\(\)/);
  assert.doesNotMatch(sql, /set\s+[^;]*(application_status|ticket_status|assigned_)/);
});

test('RPC contract: audit row is inserted in the same function with minimal metadata only', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  assert.match(sql, /insert into public\.audit_logs \(actor_profile_id, action, entity_type, entity_id, details\)/);
  assert.match(sql, /'application\.payment_verified'/);
  const auditBlock = sql.slice(sql.indexOf('insert into public.audit_logs'), sql.indexOf("'application.payment_verified'") + 200);
  assert.doesNotMatch(auditBlock, /phone|token|receipt|student_name|email/i);
});

test('RPC contract: returns only success, code and a fixed safe message; anon/authenticated direct updates revoked', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  assert.match(sql, /returns jsonb/);
  assert.doesNotMatch(sql, /sqlerrm|sqlstate|raise\s+exception/i);
  assert.match(sql, /revoke all on function public\.confirm_application_payment\(uuid\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.confirm_application_payment\(uuid\) to authenticated;/);
  assert.match(sql, /revoke update on public\.applications from public, anon, authenticated;/);
});

test('admin and super_admin RPC success is reported as success with payment_verified code', async () => {
  for (const role of ['admin', 'super_admin'] as AppRole[]) {
    const { client, calls } = recordingClient({ data: { success: true, code: 'payment_verified' }, error: null });
    const result = await confirmApplicationPaymentWithClient(client, role, UUID);
    assert.deepEqual(result, { success: true, code: 'payment_verified' });
    assert.deepEqual(calls, [{ fn: 'confirm_application_payment', args: { p_application_id: UUID } }]);
  }
});

test('operator, scanner and missing role are rejected before any RPC call', async () => {
  for (const role of ['operator', 'scanner', null] as Array<AppRole | null>) {
    const { client, calls } = recordingClient({ data: { success: true, code: 'payment_verified' }, error: null });
    await assert.rejects(
      confirmApplicationPaymentWithClient(client, role, UUID),
      (error: unknown) => error instanceof ApplicationReviewError && error.code === 'not_authorized',
    );
    assert.equal(calls.length, 0);
  }
});

test('unauthenticated RPC response maps to a safe code without a raw message', async () => {
  const { client } = recordingClient({ data: { success: false, code: 'unauthenticated', message: 'raw' }, error: null });
  const result = await confirmApplicationPaymentWithClient(client, 'admin', UUID);
  assert.deepEqual(result, { success: false, code: 'unauthenticated' });
  assert.equal(getPaymentConfirmationMessage(result.code), 'Sessiya tapılmadı. Yenidən daxil olun.');
});

test('repeated confirmation returns already_verified and is rejected safely', async () => {
  const { client } = recordingClient({ data: { success: false, code: 'already_verified' }, error: null });
  const result = await confirmApplicationPaymentWithClient(client, 'super_admin', UUID);
  assert.equal(result.success, false);
  assert.equal(result.code, 'already_verified');
});

test('invalid application status is rejected with a safe code', async () => {
  const { client } = recordingClient({ data: { success: false, code: 'invalid_status' }, error: null });
  const result = await confirmApplicationPaymentWithClient(client, 'admin', UUID);
  assert.deepEqual(result, { success: false, code: 'invalid_status' });
});

test('missing application maps to not_found', async () => {
  const { client } = recordingClient({ data: { success: false, code: 'not_found' }, error: null });
  const result = await confirmApplicationPaymentWithClient(client, 'admin', UUID);
  assert.deepEqual(result, { success: false, code: 'not_found' });
});

test('malformed id is rejected locally without calling the RPC', async () => {
  const { client, calls } = recordingClient({ data: { success: true, code: 'payment_verified' }, error: null });
  await assert.rejects(confirmApplicationPaymentWithClient(client, 'admin', 'not-a-uuid'));
  assert.equal(calls.length, 0);
});

test('RPC transport errors and malformed payloads never expose raw backend text', async () => {
  const raw = 'duplicate key SQL error with phone +994501234567 and JWT eyJhbGci';
  const thrown = recordingClient(() => { throw new Error(raw); });
  await assert.rejects(confirmApplicationPaymentWithClient(thrown.client, 'admin', UUID), (error: unknown) => {
    assert.ok(error instanceof ApplicationReviewError);
    assert.equal(getPaymentConfirmationErrorMessage(error), 'Ödənişi təsdiq etmək mümkün olmadı. Yenidən cəhd edin.');
    return true;
  });

  const errored = recordingClient({ data: null, error: { message: raw } });
  await assert.rejects(confirmApplicationPaymentWithClient(errored.client, 'admin', UUID));

  const malformed = recordingClient({ data: { success: true, code: 'unknown_code' }, error: null });
  await assert.rejects(confirmApplicationPaymentWithClient(malformed.client, 'admin', UUID));

  const message = getPaymentConfirmationErrorMessage(new Error(raw));
  assert.equal(message.includes('SQL'), false);
  assert.equal(message.includes('+994'), false);
});

test('frontend service never performs direct table writes and calls only the RPC', () => {
  const source = readFileSync(SERVICE_PATH, 'utf8');
  assert.doesNotMatch(source, /\.\s*(?:insert|update|delete|upsert)\s*\(/);
  assert.match(source, /client\.rpc\('confirm_application_payment'/);
});

test('admin panel exposes the confirm button through the service and guards duplicate clicks', () => {
  const source = readFileSync(PANEL_PATH, 'utf8');
  assert.match(source, /Ödənişi təsdiqlə/);
  assert.match(source, /role="alertdialog"/);
  assert.match(source, /paymentInFlight\.current/);
  assert.match(source, /confirmApplicationPayment\(role, detail\.applicationId\)/);
  assert.doesNotMatch(source, /\.\s*(?:insert|update|delete|upsert)\s*\(/);
  assert.match(source, /const paymentState = getPaymentPanelState\(detail\.paymentStatus, detail\.applicationStatus\)/);
  assert.match(source, /canConfirmPayment = paymentState === 'confirmable'/);
  assert.match(source, /paymentState === 'verified' \? null : <button/);
});

test('verified payment shows neutral status text and no invalid-transition warning', () => {
  assert.equal(getPaymentPanelState('verified', 'pending'), 'verified');
  assert.equal(getPaymentPanelText('verified'), 'Ödəniş artıq təsdiqlənib.');
  assert.equal(getPaymentPanelText('verified').includes('mümkün deyil'), false);
});

test('pending application with not_submitted payment is confirmable and shows the confirmation helper', () => {
  assert.equal(getPaymentPanelState('not_submitted', 'pending'), 'confirmable');
  assert.equal(
    getPaymentPanelText('confirmable'),
    'Ödəniş qəbz yoxlanıldıqdan sonra təsdiqlənə bilər. Müraciət statusu “Gözləyir” olaraq qalır.',
  );
});

test('invalid application status with not_submitted payment shows the invalid-transition warning', () => {
  for (const applicationStatus of ['under_review', 'confirmed', 'rejected', 'cancelled', 'attended'] as const) {
    assert.equal(getPaymentPanelState('not_submitted', applicationStatus), 'invalid_transition');
    assert.match(getPaymentPanelText('invalid_transition'), /mümkün deyil/);
  }
});

test('successful confirmation keeps success copy, refreshes detail, and hides the button once verified', () => {
  const source = readFileSync(PANEL_PATH, 'utf8');
  assert.match(source, /type: result\.success \? 'success' : 'error'/);
  assert.match(source, /setRefreshKey\(\(current\) => current \+ 1\)/);
  assert.match(source, /paymentState === 'verified' \? null : <button/);
  assert.equal(getPaymentPanelState('verified', 'pending'), 'verified');
});
