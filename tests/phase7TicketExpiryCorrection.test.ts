import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const correctionSql = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/20261019120000_phase7_ticket_expiry_correction.sql', import.meta.url)),
  'utf8',
);

const issueFn = /create or replace function public\.issue_application_ticket[\s\S]*?\$\$;/.exec(correctionSql)?.[0] ?? '';
const lookupFn = /create or replace function public\.get_ticket_by_token[\s\S]*?\$\$;/.exec(correctionSql)?.[0] ?? '';

test('expiry correction: both functions are replaced with unchanged signatures and safe settings', () => {
  assert.ok(issueFn, 'issue_application_ticket replacement is present');
  assert.ok(lookupFn, 'get_ticket_by_token replacement is present');
  assert.match(issueFn, /\(p_application_id uuid\)\s+returns jsonb\s+language plpgsql\s+security definer\s+set search_path = ''/);
  assert.match(lookupFn, /\(p_token text\)\s+returns jsonb\s+language plpgsql\s+security definer\s+set search_path = ''/);
});

test('expiry correction: issuance sets expires_at to the end of the 30th day after exam_date in Asia/Baku', () => {
  assert.match(issueFn, /\(v_exam_date \+ 30\)::timestamp \+ interval '1 day' - interval '1 second'\)\s+at time zone 'Asia\/Baku'/);
  assert.match(issueFn, /insert into public\.tickets \(application_id, version, status, token_hash, expires_at, created_by\)/);
  assert.match(issueFn, /pg_catalog\.sha256\(convert_to\(v_token, 'UTF8'\)\)/);
});

test('expiry correction: lookup requires a non-null future expiry and rejects revoked tickets', () => {
  assert.match(lookupFn, /t\.expires_at is not null\s+and t\.expires_at > statement_timestamp\(\)/);
  assert.match(lookupFn, /t\.revoked_at is null/);
  assert.doesNotMatch(lookupFn, /t\.expires_at is null or/);
});

test('expiry correction: expired, revoked and unknown tokens share the generic invalid response', () => {
  assert.equal((lookupFn.match(/private\.ticket_lookup_result\('invalid_link'\)/g) ?? []).length, 3);
  assert.doesNotMatch(lookupFn, /'(expired|revoked)'/i);
});

test('expiry correction: lookup returns only approved display fields', () => {
  const returned = lookupFn.split("'ticket', jsonb_build_object")[1] ?? '';
  for (const forbidden of ['expires_at', 'application_id', 'student_phone', 'token_hash', 'payment_', 'ledger', 'audit_logs']) {
    assert.doesNotMatch(returned, new RegExp(forbidden));
  }
});

test('expiry correction: no table grants, schema objects or audit writes are changed', () => {
  assert.doesNotMatch(correctionSql, /\bgrant\b/i);
  assert.doesNotMatch(correctionSql, /\brevoke\b/i);
  assert.doesNotMatch(correctionSql, /create table|alter table|create index|create trigger/i);
  // The existing issuance audit row is preserved in the function body; the lookup writes nothing.
  assert.match(issueFn, /insert into public\.audit_logs/);
  assert.doesNotMatch(lookupFn, /insert into|update public\.|delete from/i);
});
