import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  allocateApplicationPlaceWithClient,
  getPlaceAllocationMessage,
  type PlaceAllocationCode,
  type PlaceAllocationClient,
} from '../src/services/applicationReviewService';

const migrationPath = fileURLToPath(
  new URL('../supabase/migrations/20261016100000_phase5_allocate_application_place.sql', import.meta.url),
);
const sql = readFileSync(migrationPath, 'utf8');

test('seat selection orders numerically so seat 2 is chosen before seat 10', () => {
  // The migration only casts seat numbers that pass a digits-only guard, then orders by the integer.
  assert.match(sql, /s\.seat_number ~ '\^\[0-9\]\{1,9\}\$'/);
  assert.match(sql, /order by er\.priority, s\.seat_number::integer, s\.id/);
  assert.doesNotMatch(sql, /order by[^;]*s\.seat_number\s*(,|\n|$)/);

  // Mirror of the SQL ordering rule: text ordering would put '10' first, numeric ordering puts '2' first.
  const seats = ['10', '2', '1'];
  assert.deepEqual([...seats].sort(), ['1', '10', '2']);
  assert.deepEqual([...seats].sort((a, b) => Number(a) - Number(b)), ['1', '2', '10']);
});

test('allocation RPC is SECURITY DEFINER with empty search_path and authenticated-only execute', () => {
  assert.match(sql, /create or replace function public\.allocate_application_place\(p_application_id uuid\)\s+returns jsonb\s+language plpgsql\s+security definer\s+set search_path = ''/);
  assert.match(sql, /revoke all on function public\.allocate_application_place\(uuid\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.allocate_application_place\(uuid\) to authenticated;/);
});

test('allocation is restricted to active admin and super_admin roles', () => {
  assert.match(sql, /private\.has_any_role\(array\['super_admin', 'admin'\]::public\.app_role\[\]\)/);
});

test('allocation returns only fixed codes and never leaks raw error details', () => {
  const codes = [
    'allocated', 'unauthenticated', 'not_authorized', 'invalid_request', 'not_found',
    'payment_not_verified', 'invalid_status', 'already_assigned', 'no_available_place',
    'allocation_conflict', 'allocation_failed',
  ];
  for (const code of codes) {
    assert.match(sql, new RegExp(`'${code}'`));
  }
  assert.doesNotMatch(sql, /sqlerrm|sqlstate|\bdetail\b|\bhint\b/i);
  assert.match(sql, /when unique_violation then\s+return private\.allocation_result\('allocation_conflict'\);/);
  assert.match(sql, /when others then\s+return private\.allocation_result\('allocation_failed'\);/);
});

test('allocation locks the application and exam, and only updates place columns', () => {
  assert.match(sql, /from public\.applications as a\s+where a\.id = p_application_id\s+for update;/);
  assert.match(sql, /from public\.exams as e\s+where e\.id = v_application\.exam_id\s+for update;/);
  assert.match(sql, /for update of s skip locked/);

  const updateBlock = sql.match(/update public\.applications as a\s+set([\s\S]*?)where a\.id = v_application\.id;/);
  assert.ok(updateBlock, 'expected a single application update');
  assert.doesNotMatch(updateBlock[1], /payment_status|application_status|ticket_status/);
});

test('allocation does not gate on the public application window', () => {
  const sqlWithoutComments = sql.replace(/--.*$/gm, '');
  assert.doesNotMatch(sqlWithoutComments, /application_deadline|application_open_at/);
  assert.match(sql, /v_exam\.status not in \('published', 'closed'\)/);
});

test('allocation writes one minimal audit row with no identifiers or personal data', () => {
  assert.match(sql, /'application\.place_allocated'/);
  assert.match(sql, /jsonb_build_object\('room_priority', v_priority, 'room_capacity', v_capacity\)/);
});

test('no cross-exam seat conflict rule is introduced', () => {
  assert.doesNotMatch(sql, /create\s+(unique\s+)?index/i);
});

const ID = '11111111-1111-4111-8111-111111111111';

function fakeClient(response: { data: unknown; error: unknown | null } | Error, calls: Array<{ fn: string; args: unknown }>): PlaceAllocationClient {
  return {
    rpc(fn, args) {
      calls.push({ fn, args });
      if (response instanceof Error) return Promise.reject(response);
      return Promise.resolve(response);
    },
  } as PlaceAllocationClient;
}

test('client calls only the allocation RPC with the application id', async () => {
  const calls: Array<{ fn: string; args: unknown }> = [];
  const result = await allocateApplicationPlaceWithClient(
    fakeClient({ data: { success: true, code: 'allocated', message: 'x' }, error: null }, calls),
    'admin',
    ID,
  );
  assert.deepEqual(calls, [{ fn: 'allocate_application_place', args: { p_application_id: ID } }]);
  assert.deepEqual(result, { success: true, code: 'allocated' });
});

test('client rejects non-admin roles before calling the RPC', async () => {
  for (const role of ['operator', 'scanner', null] as const) {
    const calls: Array<{ fn: string; args: unknown }> = [];
    await assert.rejects(allocateApplicationPlaceWithClient(fakeClient({ data: null, error: null }, calls), role, ID));
    assert.equal(calls.length, 0);
  }
});

test('client maps RPC errors and unknown payloads to a generic unavailable failure', async () => {
  const calls: Array<{ fn: string; args: unknown }> = [];
  await assert.rejects(allocateApplicationPlaceWithClient(fakeClient({ data: null, error: { message: 'raw db text' } }, calls), 'super_admin', ID));
  await assert.rejects(allocateApplicationPlaceWithClient(fakeClient({ data: { success: true, code: 'made_up' }, error: null }, calls), 'admin', ID));
  await assert.rejects(allocateApplicationPlaceWithClient(fakeClient(new Error('network'), calls), 'admin', ID));
});

test('client rejects malformed application ids before calling the RPC', async () => {
  const calls: Array<{ fn: string; args: unknown }> = [];
  await assert.rejects(allocateApplicationPlaceWithClient(fakeClient({ data: null, error: null }, calls), 'admin', 'not-a-uuid'));
  assert.equal(calls.length, 0);
});

test('every fixed allocation code has a distinct, non-empty client message', () => {
  const codes: PlaceAllocationCode[] = [
    'allocated', 'unauthenticated', 'not_authorized', 'invalid_request', 'not_found', 'payment_not_verified',
    'invalid_status', 'already_assigned', 'no_available_place', 'allocation_conflict', 'allocation_failed',
  ];
  const messages = codes.map((code) => getPlaceAllocationMessage(code));
  assert.equal(new Set(messages).size, codes.length);
  for (const message of messages) assert.ok(message.length > 0);
  assert.ok(getPlaceAllocationMessage('unavailable').length > 0);
});
