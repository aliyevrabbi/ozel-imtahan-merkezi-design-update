import { getTicketByToken, getTicketPathToken, TicketServiceError } from './ticketService';
import type { PublicTicketDisplay } from './ticketService';

// Manual flow only: this builds a prepared message and a wa.me link. Nothing is sent by the app.
// The admin presses WhatsApp's own Send button. No recipient number is known or embedded.
export const WHATSAPP_SHARE_BASE_URL = 'https://wa.me/';

export const WHATSAPP_MANUAL_SEND_NOTICE = 'WhatsApp açıldı. Mesajı göndərmək üçün WhatsApp daxilində ‘Göndər’ düyməsinə basın.';

// Builds the Azerbaijani prepared message from approved display fields and the secure ticket link only.
export function buildTicketWhatsAppMessage(ticket: PublicTicketDisplay, ticketUrl: string): string {
  return [
    'Salam. İmtahan biletiniz hazırdır.',
    '',
    `Qeydiyyat nömrəsi: ${ticket.registrationNumber}`,
    `İmtahan: ${ticket.examTitle}`,
    `Tarix: ${ticket.examDate}`,
    `Saat: ${ticket.startTime} - ${ticket.endTime}`,
    `Bina: ${ticket.buildingName}`,
    `Otaq: ${ticket.roomName}`,
    `Yer: ${ticket.seatNumber}`,
    '',
    'Biletə baxmaq və QR kodu açmaq üçün link:',
    ticketUrl,
  ].join('\n');
}

// Recipient-less share link. Text is percent-encoded with encodeURIComponent so Azerbaijani letters,
// line breaks, and the URL survive intact.
export function buildWhatsAppShareUrl(message: string): string {
  return `${WHATSAPP_SHARE_BASE_URL}?text=${encodeURIComponent(message)}`;
}

// Re-reads the approved display fields through the public, token-scoped lookup, then builds the link.
// The lookup returns no phone number, so the message is never addressed to a recipient.
export async function prepareTicketWhatsAppLink(ticketUrl: string): Promise<string> {
  const token = getTicketPathToken(new URL(ticketUrl).pathname);
  if (!token) throw new TicketServiceError('invalid_request');
  const lookup = await getTicketByToken(token);
  if (!lookup.found) throw new TicketServiceError('unavailable');
  return buildWhatsAppShareUrl(buildTicketWhatsAppMessage(lookup.ticket, ticketUrl));
}
