import type { AppRole } from '../types';
import { getSupabaseClient } from './supabaseClient';

// Server contract: public.issue_application_ticket(p_application_id uuid) and
// public.get_ticket_by_token(p_token text). Raw server errors are never exposed; messages are
// chosen by code only. The plaintext token exists only in the issuance response and is never stored
// in browser storage and is never logged.

export const TICKET_ISSUE_CODES = [
  'issued',
  'unauthenticated',
  'not_authorized',
  'invalid_request',
  'not_found',
  'already_issued',
  'payment_not_verified',
  'place_not_assigned',
  'invalid_status',
  'issue_failed',
] as const;

export type TicketIssueCode = typeof TICKET_ISSUE_CODES[number];

export interface TicketIssueResult {
  success: boolean;
  code: TicketIssueCode;
  ticketLink: string | null;
}

export interface TicketIssueClient {
  rpc(fn: 'issue_application_ticket', args: { p_application_id: string }): PromiseLike<{ data: unknown; error: unknown | null }>;
}

export const TICKET_LINK_PATTERN = /^\/ticket\/([A-Za-z0-9_-]{43})$/;
const TICKET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TICKET_ISSUE_ROLES: readonly AppRole[] = ['admin', 'super_admin'];

export type TicketServiceErrorCode = 'not_authorized' | 'invalid_request' | 'unavailable';

export class TicketServiceError extends Error {
  constructor(readonly code: TicketServiceErrorCode) {
    super(code);
    this.name = 'TicketServiceError';
  }
}

export interface PublicTicketDisplay {
  registrationNumber: string;
  examTitle: string;
  examDate: string;
  startTime: string;
  endTime: string;
  buildingName: string;
  roomName: string;
  seatNumber: string;
}

export type TicketLookupResult =
  | { found: true; ticket: PublicTicketDisplay }
  | { found: false };

export interface TicketLookupClient {
  rpc(fn: 'get_ticket_by_token', args: { p_token: string }): PromiseLike<{ data: unknown; error: unknown | null }>;
}

// Recognises the opaque public route /ticket/<token> and returns the token, or null.
export function getTicketPathToken(pathname: string): string | null {
  const match = /^\/ticket\/([^/?#]+)\/?$/.exec(pathname);
  if (!match || !TICKET_TOKEN_PATTERN.test(match[1])) return null;
  return match[1];
}

// Builds the absolute secure link from the server-issued relative path. Returns null for anything
// that does not match the opaque link shape, so nothing unexpected is ever copied.
export function buildTicketUrl(origin: string, ticketLink: string | null): string | null {
  if (!ticketLink || !TICKET_LINK_PATTERN.test(ticketLink)) return null;
  return `${origin}${ticketLink}`;
}

export const TICKET_ORIGIN_NOT_CONFIGURED_MESSAGE = 'Bilet linki üçün istehsal domeni konfiqurasiya edilməyib. Bilet yaradılmadı.';

// Validates the production public origin. Only a plain https origin with no path, query, or
// credentials is accepted. Loopback and preview hosts are rejected so a preview or localhost origin
// can never be embedded in a production QR code or PDF.
export function getTicketPublicOrigin(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const isLoopback = host === 'localhost' || host === '[::1]' || /^127\./.test(host) || host === '0.0.0.0';
  const isPreviewHost = host.endsWith('.style.dev') || host.includes('preview') || host.startsWith('pv-');
  if (url.protocol !== 'https:' || isLoopback || isPreviewHost) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== '/' && url.pathname !== '') return null;
  return url.origin;
}

// Reads the production origin from the build-time public variable. Never falls back to the browser
// location or a preview URL.
export function getConfiguredTicketOrigin(): string | null {
  return getTicketPublicOrigin(import.meta.env?.VITE_PUBLIC_APP_ORIGIN);
}

// The QR payload is exactly the secure ticket URL: https://<production-origin>/ticket/<opaque-token>.
export function buildTicketQrPayload(origin: string | null, ticketLink: string | null): string | null {
  const safeOrigin = getTicketPublicOrigin(origin);
  if (!safeOrigin) return null;
  return buildTicketUrl(safeOrigin, ticketLink);
}

export function getTicketIssueMessage(code: TicketIssueCode | 'unavailable'): string {
  switch (code) {
    case 'issued': return 'Bilet yaradıldı.';
    case 'unauthenticated': return 'Sessiya tapılmadı. Yenidən daxil olun.';
    case 'not_authorized': return 'Bu əməliyyat üçün icazə yoxdur.';
    case 'invalid_request': return 'Müraciət identifikatoru düzgün deyil.';
    case 'not_found': return 'Müraciət tapılmadı.';
    case 'already_issued': return 'Bu müraciət üçün aktiv bilet artıq mövcuddur.';
    case 'payment_not_verified': return 'Bilet yaratmaq üçün ödəniş təsdiqlənməlidir.';
    case 'place_not_assigned': return 'Bilet yaratmaq üçün əvvəlcə yer təyin edilməlidir.';
    case 'invalid_status': return 'Bu müraciət üçün bilet yaratmaq mümkün deyil.';
    default: return 'Bilet yaradılmadı. Yenidən cəhd edin.';
  }
}

export function getTicketServiceErrorMessage(error: unknown): string {
  if (error instanceof TicketServiceError && error.code === 'not_authorized') {
    return 'Bu əməliyyat üçün icazə yoxdur.';
  }
  return 'Bilet əməliyyatı tamamlanmadı. Yenidən cəhd edin.';
}

export const TICKET_LOOKUP_INVALID_MESSAGE = 'Bilet linki etibarsızdır və ya müddəti bitib.';

function isTicketIssuePayload(value: unknown): value is { success: boolean; code: TicketIssueCode; ticket_link?: unknown } {
  if (!value || typeof value !== 'object') return false;
  const payload = value as { success?: unknown; code?: unknown };
  return typeof payload.success === 'boolean'
    && typeof payload.code === 'string'
    && (TICKET_ISSUE_CODES as readonly string[]).includes(payload.code);
}

// Calls only the guarded RPC. The client role check is a UX guard; the RPC re-checks the role.
export async function issueApplicationTicketWithClient(
  client: TicketIssueClient | null,
  role: AppRole | null,
  applicationId: string,
): Promise<TicketIssueResult> {
  if (!role || !TICKET_ISSUE_ROLES.includes(role)) throw new TicketServiceError('not_authorized');
  if (!UUID_PATTERN.test(applicationId)) throw new TicketServiceError('invalid_request');
  if (!client) throw new TicketServiceError('unavailable');

  let response: { data: unknown; error: unknown | null };
  try {
    response = await client.rpc('issue_application_ticket', { p_application_id: applicationId });
  } catch {
    throw new TicketServiceError('unavailable');
  }
  if (response.error || !isTicketIssuePayload(response.data)) {
    throw new TicketServiceError('unavailable');
  }

  const payload = response.data;
  const ticketLink = payload.code === 'issued' && typeof payload.ticket_link === 'string'
    && TICKET_LINK_PATTERN.test(payload.ticket_link)
    ? payload.ticket_link
    : null;
  if (payload.code === 'issued' && ticketLink === null) {
    throw new TicketServiceError('unavailable');
  }
  return { success: payload.success, code: payload.code, ticketLink };
}

export function issueApplicationTicket(role: AppRole | null, applicationId: string): Promise<TicketIssueResult> {
  return issueApplicationTicketWithClient(getSupabaseClient() as unknown as TicketIssueClient | null, role, applicationId);
}

interface PublicTicketRaw {
  registration_number: string;
  exam_title: string;
  exam_date: string;
  start_time: string;
  end_time: string;
  building_name: string;
  room_name: string;
  seat_number: string;
}

const PUBLIC_TICKET_KEYS: readonly (keyof PublicTicketRaw)[] = [
  'registration_number', 'exam_title', 'exam_date', 'start_time', 'end_time', 'building_name', 'room_name', 'seat_number',
];

function isPublicTicketRaw(value: unknown): value is PublicTicketRaw {
  if (!value || typeof value !== 'object') return false;
  const ticket = value as Record<string, unknown>;
  return PUBLIC_TICKET_KEYS.every((key) => typeof ticket[key] === 'string');
}

function mapPublicTicket(raw: PublicTicketRaw): PublicTicketDisplay {
  return {
    registrationNumber: raw.registration_number,
    examTitle: raw.exam_title,
    examDate: raw.exam_date,
    startTime: raw.start_time,
    endTime: raw.end_time,
    buildingName: raw.building_name,
    roomName: raw.room_name,
    seatNumber: raw.seat_number,
  };
}

// Public, anonymous lookup. Any non-found outcome is reported as the same generic invalid result.
export async function getTicketByTokenWithClient(
  client: TicketLookupClient | null,
  token: string,
): Promise<TicketLookupResult> {
  if (!TICKET_TOKEN_PATTERN.test(token)) return { found: false };
  if (!client) throw new TicketServiceError('unavailable');

  let response: { data: unknown; error: unknown | null };
  try {
    response = await client.rpc('get_ticket_by_token', { p_token: token });
  } catch {
    throw new TicketServiceError('unavailable');
  }
  if (response.error || !response.data || typeof response.data !== 'object') {
    throw new TicketServiceError('unavailable');
  }

  const payload = response.data as { code?: unknown; ticket?: unknown };
  if (payload.code !== 'found' || !isPublicTicketRaw(payload.ticket)) return { found: false };
  return { found: true, ticket: mapPublicTicket(payload.ticket) };
}

export function getTicketByToken(token: string): Promise<TicketLookupResult> {
  return getTicketByTokenWithClient(getSupabaseClient() as unknown as TicketLookupClient | null, token);
}
