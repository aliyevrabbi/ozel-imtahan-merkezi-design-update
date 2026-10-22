import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildTicketWhatsAppMessage,
  buildWhatsAppShareUrl,
  prepareTicketWhatsAppLink,
  WHATSAPP_MANUAL_SEND_NOTICE,
} from '../src/services/ticketWhatsApp';
import type { PublicTicketDisplay } from '../src/services/ticketService';

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde';
const TICKET_URL = `https://imtahanim.az/ticket/${TOKEN}`;

const TICKET: PublicTicketDisplay = {
  registrationNumber: 'REG-2026-0001',
  examTitle: 'Buraxılış imtahanı',
  examDate: '2026-11-20',
  startTime: '10:00',
  endTime: '12:00',
  buildingName: 'Əsas bina',
  roomName: 'Otaq 1',
  seatNumber: '07',
};

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

test('message contains the approved fields in the agreed Azerbaijani layout', () => {
  const message = buildTicketWhatsAppMessage(TICKET, TICKET_URL);
  assert.equal(message, [
    'Salam. İmtahan biletiniz hazırdır.',
    '',
    'Qeydiyyat nömrəsi: REG-2026-0001',
    'İmtahan: Buraxılış imtahanı',
    'Tarix: 2026-11-20',
    'Saat: 10:00 - 12:00',
    'Bina: Əsas bina',
    'Otaq: Otaq 1',
    'Yer: 07',
    '',
    'Biletə baxmaq və QR kodu açmaq üçün link:',
    TICKET_URL,
  ].join('\n'));
});

test('message excludes phone, payment, IDs, ledger, audit, token hash and raw errors', () => {
  const message = buildTicketWhatsAppMessage(TICKET, TICKET_URL);
  for (const forbidden of [
    /\+?994|phone|telefon/i,
    /payment|ödəniş|ledger|audit|token_hash|tokenHash/i,
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    /application|exam_id|examId|applicationId/i,
    /error|exception|stack/i,
  ]) {
    assert.doesNotMatch(message, forbidden);
  }
  // The only opaque token present is the one inside the secure link.
  assert.equal(message.split(TOKEN).length - 1, 1);
});

test('message carries only the HTTPS ticket URL as its link', () => {
  const message = buildTicketWhatsAppMessage(TICKET, TICKET_URL);
  const links = message.match(/https?:\/\/\S+/g) ?? [];
  assert.deepEqual(links, [TICKET_URL]);
  assert.match(links[0] ?? '', /^https:\/\/imtahanim\.az\/ticket\/[A-Za-z0-9_-]{43}$/);
});

test('wa.me URL has no recipient number and uses percent-encoded text', () => {
  const message = buildTicketWhatsAppMessage(TICKET, TICKET_URL);
  const url = buildWhatsAppShareUrl(message);
  assert.ok(url.startsWith('https://wa.me/?text='));
  assert.doesNotMatch(url, /wa\.me\/\+?\d/);
  assert.doesNotMatch(url, /[&?]phone=/);
  assert.doesNotMatch(url, /\n| /);
  const encoded = url.slice('https://wa.me/?text='.length);
  assert.equal(decodeURIComponent(encoded), message);
});

test('URL encoding preserves Azerbaijani letters, ampersands and line breaks', () => {
  const tricky = 'Ə ı Ş ç Ğ ö ü & ? # = \n+ %';
  const url = buildWhatsAppShareUrl(tricky);
  assert.equal(new URL(url).searchParams.get('text'), tricky);
  assert.doesNotMatch(url, /[^A-Za-z0-9\-_.~!*'()%?=:/&]/);
});

test('manual-send notice says the app only opened WhatsApp and never claims the message was sent', () => {
  assert.equal(
    WHATSAPP_MANUAL_SEND_NOTICE,
    'WhatsApp açıldı. Mesajı göndərmək üçün WhatsApp daxilində ‘Göndər’ düyməsinə basın.',
  );
  assert.doesNotMatch(WHATSAPP_MANUAL_SEND_NOTICE, /göndərildi|sent/i);
});

test('prepareTicketWhatsAppLink rejects a malformed ticket URL before any lookup', async () => {
  await assert.rejects(
    prepareTicketWhatsAppLink('https://imtahanim.az/ticket/short'),
    (error: unknown) => error instanceof Error && error.name === 'TicketServiceError',
  );
});

test('WhatsApp module has no Business API, webhook, automatic send or phone handling', () => {
  // Comments are stripped so that explanatory notes do not trip the checks; only code is inspected.
  const source = read('../src/services/ticketWhatsApp.ts').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(source, /graph\.facebook|whatsapp-business|webhook|fetch\(|sendMessage|api\.whatsapp/i);
  assert.doesNotMatch(source, /phone|telefon|recipient|localStorage|sessionStorage|console\./i);
  assert.doesNotMatch(source, /upload|storage\.from/);
});

test('admin UI: WhatsApp action exists only inside the issued-ticket block, so it is absent before issuance', () => {
  const panel = read('../src/components/ApplicationReviewPanel.tsx');
  const issuedBlock = panel.indexOf('{issuedUrl ? (');
  const whatsappButton = panel.indexOf("'WhatsApp mesajını hazırla'");
  assert.ok(issuedBlock > 0 && whatsappButton > issuedBlock, 'WhatsApp action must sit inside the issued block');
  assert.equal(panel.split("'WhatsApp mesajını hazırla'").length - 1, 1);
  assert.doesNotMatch(panel, /WhatsApp ilə göndərmə/);
});

test('admin UI: duplicate-click guard and popup handling for the WhatsApp action', () => {
  const panel = read('../src/components/ApplicationReviewPanel.tsx');
  assert.match(panel, /if \(!issuedUrl \|\| whatsappInFlight\.current\) return;/);
  assert.match(panel, /disabled=\{whatsappBusy\}/);
  assert.match(panel, /popup\.opener = null;/);
  assert.match(panel, /window\.open\('about:blank', '_blank'\)/);
  assert.match(panel, /setWhatsappMessage\(WHATSAPP_MANUAL_SEND_NOTICE\)/);
});

test('admin UI: no server-side WhatsApp send and no preview origin in the WhatsApp flow', () => {
  const panel = read('../src/components/ApplicationReviewPanel.tsx');
  assert.doesNotMatch(panel, /window\.location\.origin/);
  assert.doesNotMatch(panel, /fetch\(/);
});
