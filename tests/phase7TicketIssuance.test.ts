import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { canIssueTicket } from '../src/admin/adminNavigation';
import {
  buildTicketUrl,
  getTicketByTokenWithClient,
  getTicketIssueMessage,
  getTicketPathToken,
  getTicketServiceErrorMessage,
  issueApplicationTicketWithClient,
  TicketServiceError,
  type TicketIssueClient,
  type TicketLookupClient,
} from '../src/services/ticketService';

const APPLICATION_ID = '11111111-2222-4333-8444-555555555555';
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde';
assert.equal(TOKEN.length, 43);
const LINK = `/ticket/${TOKEN}`;

const migrationSql = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/20261016120000_phase7_ticket_issuance.sql', import.meta.url)),
  'utf8',
);

function issueClient(response: { data?: unknown; error?: unknown }, calls: string[] = []): TicketIssueClient {
  return {
    rpc(fn, args) {
      calls.push(`${fn}:${args.p_application_id}`);
      return Promise.resolve({ data: response.data ?? null, error: response.error ?? null });
    },
  };
}

const eligible = {
  paymentStatus: 'verified' as const,
  applicationStatus: 'pending' as const,
  ticketStatus: 'not_created' as const,
  assignedBuildingId: 'b',
  assignedRoomId: 'r',
  assignedSeatId: 's',
};

test('payment not verified is reported by code without calling a different path', async () => {
  const calls: string[] = [];
  const result = await issueApplicationTicketWithClient(
    issueClient({ data: { success: false, code: 'payment_not_verified', message: 'raw' } }, calls),
    'admin',
    APPLICATION_ID,
  );
  assert.deepEqual(result, { success: false, code: 'payment_not_verified', ticketLink: null });
  assert.deepEqual(calls, [`issue_application_ticket:${APPLICATION_ID}`]);
  assert.equal(getTicketIssueMessage('payment_not_verified'), 'Bilet yaratmaq üçün ödəniş təsdiqlənməlidir.');
});

test('place not assigned and invalid status map to fixed codes', async () => {
  const placeless = await issueApplicationTicketWithClient(
    issueClient({ data: { success: false, code: 'place_not_assigned' } }), 'super_admin', APPLICATION_ID,
  );
  assert.equal(placeless.code, 'place_not_assigned');
  const invalid = await issueApplicationTicketWithClient(
    issueClient({ data: { success: false, code: 'invalid_status' } }), 'admin', APPLICATION_ID,
  );
  assert.equal(invalid.code, 'invalid_status');
  assert.match(getTicketIssueMessage('place_not_assigned'), /yer təyin/);
});

test('already_issued is idempotent: success false, no link returned', async () => {
  const result = await issueApplicationTicketWithClient(
    issueClient({ data: { success: false, code: 'already_issued' } }), 'admin', APPLICATION_ID,
  );
  assert.deepEqual(result, { success: false, code: 'already_issued', ticketLink: null });
});

test('eligible issuance returns the opaque link and builds an absolute URL', async () => {
  const result = await issueApplicationTicketWithClient(
    issueClient({ data: { success: true, code: 'issued', ticket_link: LINK } }), 'admin', APPLICATION_ID,
  );
  assert.equal(result.success, true);
  assert.equal(result.ticketLink, LINK);
  assert.equal(buildTicketUrl('https://example.test', LINK), `https://example.test${LINK}`);
  assert.equal(buildTicketUrl('https://example.test', '/ticket/short'), null);
  assert.equal(buildTicketUrl('https://example.test', null), null);
});

test('issued without a well-formed link is treated as unavailable, never shown', async () => {
  await assert.rejects(
    issueApplicationTicketWithClient(
      issueClient({ data: { success: true, code: 'issued', ticket_link: '/admin/x' } }), 'admin', APPLICATION_ID,
    ),
    (error: unknown) => error instanceof TicketServiceError && error.code === 'unavailable',
  );
});

test('non-admin roles and malformed ids never reach the RPC', async () => {
  const calls: string[] = [];
  await assert.rejects(
    issueApplicationTicketWithClient(issueClient({ data: {} }, calls), 'operator', APPLICATION_ID),
    (error: unknown) => error instanceof TicketServiceError && error.code === 'not_authorized',
  );
  await assert.rejects(
    issueApplicationTicketWithClient(issueClient({ data: {} }, calls), 'admin', 'not-a-uuid'),
    (error: unknown) => error instanceof TicketServiceError && error.code === 'invalid_request',
  );
  assert.deepEqual(calls, []);
});

test('raw RPC errors and thrown exceptions never surface their text', async () => {
  const secret = 'SQLSTATE 23505 duplicate key 998877 +994501234567';
  await assert.rejects(
    issueApplicationTicketWithClient(issueClient({ error: { message: secret } }), 'admin', APPLICATION_ID),
    (error: unknown) => error instanceof TicketServiceError && error.code === 'unavailable',
  );
  const throwing: TicketIssueClient = { rpc: () => { throw new Error(secret); } };
  await assert.rejects(issueApplicationTicketWithClient(throwing, 'admin', APPLICATION_ID));
  const message = getTicketServiceErrorMessage(new Error(secret));
  assert.doesNotMatch(message, /SQLSTATE|998877|994501234567/);
});

test('no ticket-issue message ever contains the token or a link', () => {
  const codes = ['issued', 'unauthenticated', 'not_authorized', 'invalid_request', 'not_found', 'already_issued',
    'payment_not_verified', 'place_not_assigned', 'invalid_status', 'issue_failed', 'unavailable'] as const;
  for (const code of codes) {
    const text = getTicketIssueMessage(code);
    assert.doesNotMatch(text, /\/ticket\//);
    assert.doesNotMatch(text, /[A-Za-z0-9_-]{43}/);
  }
});

test('public lookup: malformed tokens skip the RPC and return the generic invalid result', async () => {
  const calls: string[] = [];
  const client: TicketLookupClient = {
    rpc(fn) { calls.push(fn); return Promise.resolve({ data: null, error: null }); },
  };
  assert.deepEqual(await getTicketByTokenWithClient(client, 'short'), { found: false });
  assert.deepEqual(calls, []);
});

test('public lookup maps only minimum display fields and hides everything else', async () => {
  const client: TicketLookupClient = {
    rpc: () => Promise.resolve({
      data: {
        success: true,
        code: 'found',
        ticket: {
          registration_number: 'REG-1',
          exam_title: 'Buraxılış',
          exam_date: '2026-11-01',
          start_time: '09:00',
          end_time: '11:00',
          building_name: 'Bina A',
          room_name: 'Otaq 1',
          seat_number: '4',
          phone: '+994501234567',
          application_id: APPLICATION_ID,
        },
      },
      error: null,
    }),
  };
  const result = await getTicketByTokenWithClient(client, TOKEN);
  assert.equal(result.found, true);
  if (!result.found) return;
  assert.deepEqual(Object.keys(result.ticket).sort(), [
    'buildingName', 'endTime', 'examDate', 'examTitle', 'registrationNumber', 'roomName', 'seatNumber', 'startTime',
  ]);
  assert.equal(result.ticket.registrationNumber, 'REG-1');
});

test('public lookup: invalid or revoked tokens return the same generic result', async () => {
  const client: TicketLookupClient = {
    rpc: () => Promise.resolve({ data: { success: false, code: 'invalid_link', message: 'x' }, error: null }),
  };
  assert.deepEqual(await getTicketByTokenWithClient(client, TOKEN), { found: false });
});

test('public lookup transport failure is an unavailable error without raw text', async () => {
  const client: TicketLookupClient = { rpc: () => Promise.resolve({ data: null, error: { message: 'boom' } }) };
  await assert.rejects(getTicketByTokenWithClient(client, TOKEN), (error: unknown) =>
    error instanceof TicketServiceError && error.code === 'unavailable');
});

test('route parser accepts only the opaque 43-character token path', () => {
  assert.equal(getTicketPathToken(LINK), TOKEN);
  assert.equal(getTicketPathToken(`${LINK}/`), TOKEN);
  assert.equal(getTicketPathToken('/ticket/short'), null);
  assert.equal(getTicketPathToken('/ticket/'), null);
  assert.equal(getTicketPathToken('/admin/applications'), null);
});

test('eligibility requires verified payment, pending status, not_created ticket and full place', () => {
  assert.equal(canIssueTicket('admin', eligible), true);
  assert.equal(canIssueTicket('super_admin', eligible), true);
  assert.equal(canIssueTicket('operator', eligible), false);
  assert.equal(canIssueTicket(null, eligible), false);
  assert.equal(canIssueTicket('admin', { ...eligible, paymentStatus: 'receipt_received' }), false);
  assert.equal(canIssueTicket('admin', { ...eligible, applicationStatus: 'confirmed' }), false);
  assert.equal(canIssueTicket('admin', { ...eligible, ticketStatus: 'active' }), false);
  assert.equal(canIssueTicket('admin', { ...eligible, assignedBuildingId: null }), false);
  assert.equal(canIssueTicket('admin', { ...eligible, assignedRoomId: null }), false);
  assert.equal(canIssueTicket('admin', { ...eligible, assignedSeatId: null }), false);
});

test('SQL: both RPCs are SECURITY DEFINER with empty search_path and fixed grants', () => {
  assert.match(migrationSql, /create function public\.issue_application_ticket\(p_application_id uuid\)\s+returns jsonb\s+language plpgsql\s+security definer\s+set search_path = ''/);
  assert.match(migrationSql, /create function public\.get_ticket_by_token\(p_token text\)\s+returns jsonb\s+language plpgsql\s+security definer\s+set search_path = ''/);
  assert.match(migrationSql, /revoke all on function public\.issue_application_ticket\(uuid\) from public, anon;/);
  assert.match(migrationSql, /grant execute on function public\.issue_application_ticket\(uuid\) to authenticated;/);
  assert.match(migrationSql, /grant execute on function public\.get_ticket_by_token\(text\) to anon, authenticated;/);
  assert.match(migrationSql, /revoke all on public\.tickets from anon;/);
});

test('SQL: admin role check, row lock and eligibility rules are present', () => {
  assert.match(migrationSql, /private\.has_any_role\(array\['super_admin', 'admin'\]::public\.app_role\[\]\)/);
  assert.match(migrationSql, /where a\.id = p_application_id\s+for update;/);
  assert.match(migrationSql, /payment_not_verified/);
  assert.match(migrationSql, /place_not_assigned/);
  assert.match(migrationSql, /in \('archived', 'finished'\)/);
  assert.match(migrationSql, /'already_issued'/);
});

test('SQL: token is generated with gen_random_bytes and only its SHA-256 digest is stored', () => {
  assert.match(migrationSql, /extensions\.gen_random_bytes\(32\)/);
  assert.match(migrationSql, /pg_catalog\.sha256\(convert_to\(v_token, 'UTF8'\)\)/);
  const insert = /insert into public\.tickets[\s\S]*?;/.exec(migrationSql);
  assert.ok(insert, 'ticket insert must exist');
  // The plaintext appears only inside the SHA-256 expression, never as a stored value.
  assert.equal((insert[0].match(/v_token/g) ?? []).length, 1);
  assert.match(insert[0], /pg_catalog\.sha256\(convert_to\(v_token, 'UTF8'\)\)/);
});

test('SQL: exactly one audit row with the ticket_issued action, and no token in audit details', () => {
  const matches = migrationSql.match(/'application\.ticket_issued'/g) ?? [];
  assert.equal(matches.length, 1);
  const audit = /insert into public\.audit_logs[\s\S]*?;/.exec(migrationSql);
  assert.ok(audit);
  assert.doesNotMatch(audit[0], /v_token|token_hash/);
});

test('SQL: raw errors and SQLSTATE are never returned to clients', () => {
  assert.doesNotMatch(migrationSql, /sqlerrm|sqlstate/i);
  assert.doesNotMatch(migrationSql, /\braise\s+(notice|log|warning)\b/i);
});

test('SQL: public lookup exposes no internal identifiers, phone or ledger fields', () => {
  const lookup = /create function public\.get_ticket_by_token[\s\S]*?\$\$;/.exec(migrationSql);
  assert.ok(lookup);
  for (const forbidden of ['application_id', 'student_phone', 'token_hash', 'payment_', 'ledger', 'audit_logs']) {
    assert.doesNotMatch(lookup[0].split("'ticket', jsonb_build_object")[1] ?? '', new RegExp(forbidden));
  }
});

test('client code: no storage, logging, or PDF/QR/WhatsApp side effects in ticket paths', () => {
  const files = [
    '../src/services/ticketService.ts',
    '../src/components/TicketLinkPage.tsx',
  ];
  for (const file of files) {
    const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
    assert.doesNotMatch(source, /localStorage|sessionStorage/);
    assert.doesNotMatch(source, /console\./);
    assert.doesNotMatch(source, /from 'qrcode'|whatsapp|wa\.me|jspdf|pdfkit/i);
  }
});
