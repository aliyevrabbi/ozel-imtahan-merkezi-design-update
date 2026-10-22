import QRCode from 'qrcode';
import { getTicketByToken, getTicketPathToken, TicketServiceError } from './ticketService';
import type { PublicTicketDisplay } from './ticketService';

// PDF generation approach: the card is rendered on a canvas (so Azerbaijani glyphs render with the
// system font) and embedded as a single JPEG in a minimal PDF. No persistent storage, no third-party
// PDF library, and no network calls beyond the public ticket lookup used to read the display fields.

export const TICKET_PDF_CENTER_NAME = 'Özəl İmtahan Mərkəzi';
export const TICKET_PDF_TITLE = 'İmtahan bileti';
export const TICKET_PDF_INSTRUCTION = 'İmtahan zamanı bu biletdəki QR kodu və ya linki təqdim edin.';
export const TICKET_PDF_FILENAME = 'imtahan-bileti.pdf';

export interface TicketCardField {
  label: string;
  value: string;
}

// The only ticket data printed on the card: the approved public display fields. Student name is not
// part of the approved lookup contract and is therefore omitted; phone, payment, ledger, audit,
// UUIDs and token hash never reach this module.
export function getTicketCardFields(ticket: PublicTicketDisplay): TicketCardField[] {
  return [
    { label: 'Qeydiyyat nömrəsi', value: ticket.registrationNumber },
    { label: 'İmtahan', value: ticket.examTitle },
    { label: 'Tarix', value: ticket.examDate },
    { label: 'Başlama vaxtı', value: ticket.startTime },
    { label: 'Bitmə vaxtı', value: ticket.endTime },
    { label: 'Bina', value: ticket.buildingName },
    { label: 'Otaq', value: ticket.roomName },
    { label: 'Yer nömrəsi', value: ticket.seatNumber },
  ];
}

const PDF_PAGE_WIDTH = 595;
const PDF_PAGE_HEIGHT = 842;
const CARD_WIDTH = 1240;
const CARD_HEIGHT = 1754;
const QR_SIZE = 620;
const FONT_FAMILY = 'Arial, Helvetica, sans-serif';

const encoder = new TextEncoder();

// Wraps one JPEG (DCTDecode) image on an A4 page. Byte offsets in the xref table are computed from the
// actual output, so the file is valid without any external library.
export function buildJpegPdf(jpeg: Uint8Array, width: number, height: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: Uint8Array | string) => {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: string) => {
    offsets[id] = length;
    push(`${id} 0 obj\n${body}\nendobj\n`);
  };
  const stream = (id: number, dict: string, data: Uint8Array) => {
    offsets[id] = length;
    push(`${id} 0 obj\n<< ${dict} /Length ${data.length} >>\nstream\n`);
    push(data);
    push('\nendstream\nendobj\n');
  };

  push('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  stream(4, `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, jpeg);
  stream(5, '', encoder.encode(`q ${PDF_PAGE_WIDTH} 0 0 ${PDF_PAGE_HEIGHT} 0 0 cm /Im0 Do Q`));

  const xrefOffset = length;
  let xref = `xref\n0 6\n0000000000 65535 f \n`;
  for (let id = 1; id <= 5; id += 1) {
    xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  push(xref);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const output = new Uint8Array(length);
  let position = 0;
  for (const chunk of chunks) {
    output.set(chunk, position);
    position += chunk.length;
  }
  return output;
}

function wrapByCharacter(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const char of text) {
    const candidate = current + char;
    if (current !== '' && context.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }
  if (current !== '') lines.push(current);
  return lines;
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new TicketServiceError('unavailable'));
        return;
      }
      blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
    }, 'image/jpeg', 0.92);
  });
}

// Draws the card. The text comes only from getTicketCardFields and the secure link; the QR canvas
// must have been generated from the same ticket URL.
async function renderTicketCardJpeg(fields: readonly TicketCardField[], ticketUrl: string): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new TicketServiceError('unavailable');

  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  context.fillStyle = '#0F172A';
  context.textBaseline = 'top';
  context.font = `bold 60px ${FONT_FAMILY}`;
  context.fillText(TICKET_PDF_CENTER_NAME, 80, 90, CARD_WIDTH - 160);
  context.font = `bold 84px ${FONT_FAMILY}`;
  context.fillText(TICKET_PDF_TITLE, 80, 180, CARD_WIDTH - 160);
  context.strokeStyle = '#CBD5E1';
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(80, 320);
  context.lineTo(CARD_WIDTH - 80, 320);
  context.stroke();

  fields.forEach((field, index) => {
    const x = 80 + (index % 2) * 540;
    const y = 360 + Math.floor(index / 2) * 140;
    context.fillStyle = '#64748B';
    context.font = `bold 34px ${FONT_FAMILY}`;
    context.fillText(field.label, x, y, 500);
    context.fillStyle = '#0F172A';
    context.font = `bold 48px ${FONT_FAMILY}`;
    context.fillText(field.value, x, y + 46, 500);
  });

  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, ticketUrl, { margin: 2, width: QR_SIZE, errorCorrectionLevel: 'M' });
  context.drawImage(qrCanvas, (CARD_WIDTH - QR_SIZE) / 2, 960, QR_SIZE, QR_SIZE);

  context.fillStyle = '#0F172A';
  context.font = `32px ${FONT_FAMILY}`;
  context.textAlign = 'center';
  let linkY = 1610;
  for (const line of wrapByCharacter(context, ticketUrl, CARD_WIDTH - 160)) {
    context.fillText(line, CARD_WIDTH / 2, linkY);
    linkY += 42;
  }
  context.font = `bold 36px ${FONT_FAMILY}`;
  context.fillText(TICKET_PDF_INSTRUCTION, CARD_WIDTH / 2, 1690, CARD_WIDTH - 160);

  return canvasToJpeg(canvas);
}

// Builds and downloads the PDF for an issued ticket. Only the secure link from the issuance response
// is used; the display fields are read through the public, token-scoped lookup. Nothing is stored.
export async function downloadIssuedTicketPdf(ticketUrl: string): Promise<void> {
  let token: string | null;
  try {
    token = getTicketPathToken(new URL(ticketUrl).pathname);
  } catch {
    token = null;
  }
  if (!token) throw new TicketServiceError('invalid_request');

  const lookup = await getTicketByToken(token);
  if (!lookup.found) throw new TicketServiceError('unavailable');

  const jpeg = await renderTicketCardJpeg(getTicketCardFields(lookup.ticket), ticketUrl);
  const pdf = buildJpegPdf(jpeg, CARD_WIDTH, CARD_HEIGHT);
  const pdfBytes = new Uint8Array(pdf.byteLength);
  pdfBytes.set(pdf);
  const blobUrl = URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }));
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = TICKET_PDF_FILENAME;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

// Small QR preview for the admin panel. Encodes only the ticket URL.
export function buildTicketQrDataUrl(ticketUrl: string): Promise<string> {
  return QRCode.toDataURL(ticketUrl, { margin: 2, width: 240, errorCorrectionLevel: 'M' });
}
