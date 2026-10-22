import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { canIssueTicket } from '../src/admin/adminNavigation';
import {
  buildTicketQrPayload,
  getTicketByTokenWithClient,
  getTicketPublicOrigin,
  getTicketIssueMessage,
  issueApplicationTicketWithClient,
  TICKET_LOOKUP_INVALID_MESSAGE,
  TICKET_ORIGIN_NOT_CONFIGURED_MESSAGE,
  type TicketIssueClient,
  type TicketLookupClient,
} from '../src/services/ticketService';
import { buildJpegPdf, getTicketCardFields } from '../src/services/ticketPdf';

const APPLICATION_ID = '11111111-2222-4333-8444-555555555555';
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde';
const LINK = `/ticket/${TOKEN}`;
const PRODUCTION_ORIGIN = 'https://imtahanim.az';

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

const migrationSql = read('../supabase/migrations/20261016120000_phase7_ticket_issuance.sql');

const eligible = {
  paymentStatus: 'verified' as const,
  applicationStatus: 'pending' as const,
  ticketStatus: 'not_created' as const,
  assignedBuildingId: 'b',
  assignedRoomId: 'r',
  assignedSeatId: 's',
};

const DISPLAY = {
  registrationNumber: 'REG-2026-0001',
  examTitle: 'Buraxılış imtahanı',
  examDate: '2026-11-20',
  startTime: '10:00',
  endTime: '12:00',
  buildingName: 'Əsas bina',
  roomName: 'Otaq 1',
  seatNumber: '07',
};

function issueClient(response: { data?: unknown; error?: unknown }, calls: string[] = []): TicketIssueClient {
  return {
    rpc(fn, args) {
      calls.push(`${fn}:${args.p_application_id}`);
      return Promise.resolve({ data: response.data ?? null, error: response.error ?? null });
    },
  };
}

// ---- eligibility and issuance contract ----

test('unpaid, unassigned, and invalid-status applications cannot get a ticket button', () => {
  assert.equal(canIssueTicket('admin', { ...eligible, paymentStatus: 'not_submitted' }), false);
  assert.equal(canIssueTicket('admin', { ...eligible, paymentStatus: 'receipt_received' }), false);
  assert.equal(canIssueTicket('admin', { ...eligible, assignedSeatId: null }), false);
  assert.equal(canIssueTicket('admin', { ...eligible, assignedBuildingId: null }), false);
  assert.equal(canIssueTicket('admin', { ...eligible, applicationStatus: 'rejected' }), false);
  assert.equal(canIssueTicket('admin', { ...eligible, applicationStatus: 'cancelled' }), false);
  assert.equal(canIssueTicket('admin', { ...eligible, ticketStatus: 'active' }), false);
  assert.equal(canIssueTicket('operator', eligible), false);
  assert.equal(canIssueTicket('admin', eligible), true);
});

test('invalid status returned by the RPC is rejected with a fixed message and no link', async () => {
  const result = await issueApplicationTicketWithClient(
    issueClient({ data: { success: false, code: 'invalid_status' } }), 'admin', APPLICATION_ID,
  );
  assert.deepEqual(result, { success: false, code: 'invalid_status', ticketLink: null });
  assert.equal(getTicketIssueMessage('invalid_status'), 'Bu müraciət üçün bilet yaratmaq mümkün deyil.');
});

test('successful issuance returns exactly one opaque link', async () => {
  const calls: string[] = [];
  const result = await issueApplicationTicketWithClient(
    issueClient({ data: { success: true, code: 'issued', ticket_link: LINK } }, calls), 'admin', APPLICATION_ID,
  );
  assert.equal(result.success, true);
  assert.equal(result.ticketLink, LINK);
  assert.deepEqual(calls, [`issue_application_ticket:${APPLICATION_ID}`]);
});

test('already_issued keeps idempotent behaviour: no link, no second ticket call', async () => {
  const result = await issueApplicationTicketWithClient(
    issueClient({ data: { success: false, code: 'already_issued' } }), 'admin', APPLICATION_ID,
  );
  assert.deepEqual(result, { success: false, code: 'already_issued', ticketLink: null });
});

// ---- production origin and QR payload ----

test('production origin is required: missing, malformed, insecure, loopback and preview origins are rejected', () => {
  for (const bad of [undefined, null, '', '   ', 'not a url', 'http://imtahanim.az', 'http://localhost:3000',
    'https://localhost:3000', 'https://127.0.0.1', 'https://pv-5c83546c0108-0253d153.style.dev',
    'https://preview.imtahanim.az', 'https://imtahanim.az/path', 'https://imtahanim.az?x=1',
    'https://user:pass@imtahanim.az']) {
    assert.equal(getTicketPublicOrigin(bad), null, `expected rejection for ${String(bad)}`);
  }
  assert.equal(getTicketPublicOrigin(PRODUCTION_ORIGIN), PRODUCTION_ORIGIN);
  assert.equal(getTicketPublicOrigin('https://imtahanim.az/'), PRODUCTION_ORIGIN);
});

test('preview or localhost origin is never embedded in a QR payload', () => {
  assert.equal(buildTicketQrPayload('http://localhost:3000', LINK), null);
  assert.equal(buildTicketQrPayload('https://pv-5c83546c0108-0253d153.style.dev', LINK), null);
  assert.equal(buildTicketQrPayload(null, LINK), null);
});

test('QR payload is exactly the opaque HTTPS ticket URL with no personal data', () => {
  const payload = buildTicketQrPayload(PRODUCTION_ORIGIN, LINK);
  assert.equal(payload, `${PRODUCTION_ORIGIN}/ticket/${TOKEN}`);
  assert.match(payload ?? '', /^https:\/\/imtahanim\.az\/ticket\/[A-Za-z0-9_-]{43}$/);
  assert.doesNotMatch(payload ?? '', /REG-|Buraxılış|APPLICATION|11111111|\+994|\{|"/);
  assert.equal(buildTicketQrPayload(PRODUCTION_ORIGIN, '/ticket/short'), null);
  assert.equal(buildTicketQrPayload(PRODUCTION_ORIGIN, null), null);
});

// ---- PDF content and structure ----

test('PDF card fields are exactly the approved display fields, in order', () => {
  const fields = getTicketCardFields(DISPLAY);
  assert.deepEqual(fields.map((field) => field.label), [
    'Qeydiyyat nömrəsi', 'İmtahan', 'Tarix', 'Başlama vaxtı', 'Bitmə vaxtı', 'Bina', 'Otaq', 'Yer nömrəsi',
  ]);
  assert.deepEqual(fields.map((field) => field.value), Object.values(DISPLAY));
});

test('PDF card never prints phone, payment, ledger, audit, UUID or token hash data', () => {
  const printed = getTicketCardFields(DISPLAY).map((field) => `${field.label} ${field.value}`).join('\n');
  for (const forbidden of [/\+?994/, /phone|telefon/i, /payment|ödəniş|ledger|audit|token_hash|application_id/i,
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, /ticket\//]) {
    assert.doesNotMatch(printed, forbidden);
  }
});

test('PDF wrapper is a valid single-page PDF with correct xref offsets and no personal text', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const pdf = buildJpegPdf(jpeg, 1240, 1754);
  const text = Buffer.from(pdf).toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.match(text, /\/Filter \/DCTDecode/);
  assert.match(text, /\/MediaBox \[0 0 595 842\]/);
  assert.match(text, /%%EOF\n$/);

  const xrefStart = Number(/startxref\n(\d+)\n/.exec(text)?.[1]);
  assert.equal(text.slice(xrefStart, xrefStart + 4), 'xref');
  const entries = [...text.matchAll(/^(\d{10}) 00000 n $/gm)].map((match) => Number(match[1]));
  assert.equal(entries.length, 5);
  entries.forEach((offset, index) => {
    assert.match(text.slice(offset), new RegExp(`^${index + 1} 0 obj`));
  });
  for (const forbidden of [/phone|telefon|payment|ledger|audit|token_hash/i]) {
    assert.doesNotMatch(text, forbidden);
  }
});

test('PDF generation is limited to the issued ticket flow and never stores or uploads the file', () => {
  const pdfSource = read('../src/services/ticketPdf.ts');
  assert.doesNotMatch(pdfSource, /localStorage|sessionStorage|console\.|fetch\(|storage\.from|upload|from\('/);
  assert.match(pdfSource, /QRCode\.toCanvas\(qrCanvas, ticketUrl,/);
  assert.match(pdfSource, /getTicketByToken\(token\)/);
});

// ---- public lookup and privacy ----

test('invalid, expired, revoked or unknown ticket links return the generic invalid result', async () => {
  const lookupClient = (data: unknown): TicketLookupClient => ({
    rpc: () => Promise.resolve({ data, error: null }),
  });
  assert.deepEqual(await getTicketByTokenWithClient(lookupClient({ code: 'not_found' }), TOKEN), { found: false });
  assert.deepEqual(await getTicketByTokenWithClient(lookupClient({ code: 'revoked' }), TOKEN), { found: false });
  assert.equal(TICKET_LOOKUP_INVALID_MESSAGE, 'Bilet linki etibarsızdır və ya müddəti bitib.');
});

test('anon has no direct access to tickets; the token is hashed and plaintext is never inserted', () => {
  assert.match(migrationSql, /revoke all on public\.tickets from anon;/);
  assert.match(migrationSql, /token_hash, created_by\)\s*values/);
  assert.match(migrationSql, /pg_catalog\.sha256\(convert_to\(p_token, 'UTF8'\)\)/);
});

// ---- admin UI wiring ----

test('admin panel: origin is checked before the RPC, duplicate clicks are guarded, and no preview origin is used', () => {
  const panel = read('../src/components/ApplicationReviewPanel.tsx');
  const originCheck = panel.indexOf('getConfiguredTicketOrigin()');
  const rpcCall = panel.indexOf('await issueApplicationTicket(role');
  assert.ok(originCheck > 0 && rpcCall > originCheck, 'origin check must precede the RPC call');
  assert.match(panel, /if \(ticketInFlight\.current \|\| !detail\) return;/);
  assert.match(panel, /disabled=\{issuing \|\| confirmOpen\}/);
  assert.doesNotMatch(panel, /window\.location\.origin/);
  assert.match(panel, /TICKET_ORIGIN_NOT_CONFIGURED_MESSAGE/);
  assert.match(panel, /WhatsApp mesaj\u0131n\u0131 haz\u0131rla/);
  assert.doesNotMatch(panel, /wa\.me|whatsapp\.com\/send|graph\.facebook/i);
});

test('admin panel: PDF download and copy only act on the issued link, and the button is hidden for ineligible applications', () => {
  const panel = read('../src/components/ApplicationReviewPanel.tsx');
  assert.match(panel, /if \(!issuedUrl \|\| pdfInFlight\.current\) return;/);
  assert.match(panel, /if \(!issuedUrl\) return;/);
  assert.match(panel, /const issuable = canIssueTicket\(role, \{/);
  assert.match(panel, /detail\.ticketStatus === 'active' \? \(/);
});

test('ticket messages never contain tokens or links', () => {
  for (const code of ['issued', 'already_issued', 'payment_not_verified', 'place_not_assigned', 'invalid_status'] as const) {
    assert.doesNotMatch(getTicketIssueMessage(code), /\/ticket\/|[A-Za-z0-9_-]{43}/);
  }
  assert.equal(TICKET_ORIGIN_NOT_CONFIGURED_MESSAGE.includes('/ticket/'), false);
});

test('public ticket page stays minimal: no storage, no third-party resources, no QR or PDF', () => {
  const page = read('../src/components/TicketLinkPage.tsx');
  assert.doesNotMatch(page, /localStorage|sessionStorage|console\.|<script|<img|googleapis|analytics/i);
  assert.doesNotMatch(page, /ticketPdf|qrcode/);
  const html = read('../index.html');
  assert.match(html, /<meta name="referrer" content="no-referrer" \/>/);
});
