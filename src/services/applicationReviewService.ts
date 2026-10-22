import type { ApplicationStatus, AppRole, PaymentStatus, TicketStatus } from '../types';
import { getSupabaseClient } from './supabaseClient';
import { buildApplicationReviewQuery } from './applicationReviewQuery';
import type { ApplicationReviewQueryClient } from './applicationReviewQuery';
export { buildApplicationReviewQuery } from './applicationReviewQuery';

export const APPLICATION_REVIEW_PAGE_SIZE = 20;
export const APPLICATION_REVIEW_FIELDS = [
  'registration_number',
  'exam:exams(title)',
  'student_name',
  'student_surname',
  'grade',
  'school',
  'application_status',
  'payment_status',
  'ticket_status',
  'created_at',
] as const;

export const APPLICATION_DETAIL_FIELDS = [
  'registration_number',
  'exam:exams(title)',
  'student_name',
  'student_surname',
  'student_father_name',
  'grade',
  'school',
  'student_phone',
  'application_status',
  'payment_status',
  'ticket_status',
  'created_at',
  'assigned_building_id',
  'assigned_room_id',
  'assigned_seat_id',
] as const;

type ReviewFields = typeof APPLICATION_REVIEW_FIELDS[number];
type DetailFields = typeof APPLICATION_DETAIL_FIELDS[number];

interface ApplicationReviewRaw {
  registration_number: string;
  exam: { title: string } | null;
  student_name: string;
  student_surname: string;
  grade: string;
  school: string | null;
  application_status: ApplicationStatus;
  payment_status: PaymentStatus;
  ticket_status: TicketStatus;
  created_at: string;
}

interface ApplicationDetailRaw extends ApplicationReviewRaw {
  id: string;
  student_father_name: string | null;
  student_phone: string;
  assigned_building_id: string | null;
  assigned_room_id: string | null;
  assigned_seat_id: string | null;
}

export interface ApplicationReviewItem {
  registrationNumber: string;
  examTitle: string;
  studentName: string;
  studentSurname: string;
  grade: string;
  school: string | null;
  applicationStatus: ApplicationStatus;
  paymentStatus: PaymentStatus;
  ticketStatus: TicketStatus;
  createdAt: string;
}

export interface ApplicationReviewDetail extends ApplicationReviewItem {
  applicationId: string;
  studentFatherName: string | null;
  studentPhone: string;
  assignedBuildingId: string | null;
  assignedRoomId: string | null;
  assignedSeatId: string | null;
}

export interface ApplicationReviewFilters {
  examId?: string;
  applicationStatus?: ApplicationStatus | '';
  paymentStatus?: PaymentStatus | '';
  ticketStatus?: TicketStatus | '';
  registrationSearch?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface ApplicationReviewPage {
  items: ApplicationReviewItem[];
  page: number;
  pageSize: number;
  hasNextPage: boolean;
}

export type ApplicationReviewErrorCode =
  | 'not_authorized'
  | 'unavailable'
  | 'invalid_filter'
  | 'not_found';

export interface ReviewExamOption {
  id: string;
  title: string;
}

export class ApplicationReviewError extends Error {
  constructor(readonly code: ApplicationReviewErrorCode) {
    super(code);
    this.name = 'ApplicationReviewError';
  }
}

const APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  'pending', 'under_review', 'confirmed', 'rejected', 'cancelled', 'attended',
];
const PAYMENT_STATUSES: readonly PaymentStatus[] = [
  'not_submitted', 'receipt_received', 'verified', 'rejected',
];
const REVIEW_ROLES: readonly AppRole[] = ['admin', 'super_admin'];
const EXAM_FILTER_ROLES: readonly AppRole[] = ['admin', 'super_admin', 'operator', 'scanner'];

export function getApplicationReviewErrorMessage(error: unknown): string {
  if (!(error instanceof ApplicationReviewError)) return 'Müraciət məlumatlarını yükləmək mümkün olmadı. Yenidən cəhd edin.';
  if (error.code === 'not_authorized') return 'Bu məlumatlara baxmaq üçün icazə yoxdur.';
  if (error.code === 'not_found') return 'Müraciət tapılmadı.';
  if (error.code === 'invalid_filter') return 'Axtarış meyarlarını yoxlayın.';
  return 'Müraciət məlumatlarını yükləmək mümkün olmadı. Yenidən cəhd edin.';
}

export async function listReviewExamOptions(role: AppRole | null): Promise<ReviewExamOption[]> {
  if (!role || !EXAM_FILTER_ROLES.includes(role)) throw new ApplicationReviewError('not_authorized');
  const client = getSupabaseClient();
  if (!client) throw new ApplicationReviewError('unavailable');
  try {
    const { data, error } = await client.from('exams').select('id,title').order('title', { ascending: true }).limit(200);
    if (error || !data) throw new ApplicationReviewError('unavailable');
    return (data as Array<{ id: string; title: string }>).map(({ id, title }) => ({ id, title }));
  } catch {
    throw new ApplicationReviewError('unavailable');
  }
}

function assertReviewRole(role: AppRole | null): asserts role is 'admin' | 'super_admin' {
  if (!role || !REVIEW_ROLES.includes(role)) throw new ApplicationReviewError('not_authorized');
}

function mapReviewRow(row: ApplicationReviewRaw): ApplicationReviewItem {
  return {
    registrationNumber: row.registration_number,
    examTitle: row.exam?.title ?? 'İmtahan məlumatı mövcud deyil',
    studentName: row.student_name,
    studentSurname: row.student_surname,
    grade: row.grade,
    school: row.school,
    applicationStatus: row.application_status,
    paymentStatus: row.payment_status,
    ticketStatus: row.ticket_status,
    createdAt: row.created_at,
  };
}

export function mapApplicationReviewDetail(row: ApplicationDetailRaw): ApplicationReviewDetail {
  return {
    ...mapReviewRow(row),
    applicationId: row.id,
    studentFatherName: row.student_father_name,
    studentPhone: row.student_phone,
    assignedBuildingId: row.assigned_building_id,
    assignedRoomId: row.assigned_room_id,
    assignedSeatId: row.assigned_seat_id,
  };
}

export async function listApplicationReviewPage(
  role: AppRole | null,
  page: number,
  filters: ApplicationReviewFilters = {},
): Promise<ApplicationReviewPage> {
  assertReviewRole(role);
  const client = getSupabaseClient();
  if (!client) throw new ApplicationReviewError('unavailable');

  let response;
  try {
    response = await buildApplicationReviewQuery(client as unknown as ApplicationReviewQueryClient, page, filters);
  } catch (error) {
    if (error instanceof ApplicationReviewError) throw error;
    throw new ApplicationReviewError('unavailable');
  }
  if (response.error || !response.data) throw new ApplicationReviewError('unavailable');

  const rows = response.data as unknown as ApplicationReviewRaw[];
  const items = rows.slice(0, APPLICATION_REVIEW_PAGE_SIZE).map(mapReviewRow);
  return {
    items,
    page,
    pageSize: APPLICATION_REVIEW_PAGE_SIZE,
    hasNextPage: rows.length > APPLICATION_REVIEW_PAGE_SIZE,
  };
}

export async function getApplicationReviewDetail(
  role: AppRole | null,
  registrationNumber: string,
): Promise<ApplicationReviewDetail> {
  assertReviewRole(role);
  const normalizedRegistration = registrationNumber.trim();
  if (!normalizedRegistration || normalizedRegistration.length > 64) throw new ApplicationReviewError('invalid_filter');
  const client = getSupabaseClient();
  if (!client) throw new ApplicationReviewError('unavailable');

  try {
    const { data, error } = await client
      .from('applications')
      .select([...APPLICATION_DETAIL_FIELDS, 'id'].join(','))
      .eq('registration_number', normalizedRegistration)
      .maybeSingle();
    if (error) throw new ApplicationReviewError('unavailable');
    if (!data) throw new ApplicationReviewError('not_found');
    return mapApplicationReviewDetail(data as unknown as ApplicationDetailRaw);
  } catch (error) {
    if (error instanceof ApplicationReviewError) throw error;
    throw new ApplicationReviewError('unavailable');
  }
}

export const APPLICATION_REVIEW_ALLOWED_FIELDS: readonly ReviewFields[] = APPLICATION_REVIEW_FIELDS;
export const APPLICATION_DETAIL_ALLOWED_FIELDS: readonly DetailFields[] = APPLICATION_DETAIL_FIELDS;

export type PaymentConfirmationCode =
  | 'payment_verified'
  | 'unauthenticated'
  | 'not_authorized'
  | 'invalid_request'
  | 'not_found'
  | 'already_verified'
  | 'invalid_status';

export interface PaymentConfirmationResult {
  success: boolean;
  code: PaymentConfirmationCode;
}

export interface PaymentConfirmationClient {
  rpc(fn: 'confirm_application_payment', args: { p_application_id: string }): PromiseLike<{ data: unknown; error: unknown | null }>;
}

const PAYMENT_CONFIRMATION_CODES: readonly PaymentConfirmationCode[] = [
  'payment_verified', 'unauthenticated', 'not_authorized', 'invalid_request', 'not_found', 'already_verified', 'invalid_status',
];

// Messages are chosen by code on the client; raw server message text is never displayed.
export function getPaymentConfirmationMessage(code: PaymentConfirmationCode | 'unavailable'): string {
  switch (code) {
    case 'payment_verified': return 'Ödəniş təsdiqləndi.';
    case 'unauthenticated': return 'Sessiya tapılmadı. Yenidən daxil olun.';
    case 'not_authorized': return 'Bu əməliyyat üçün icazə yoxdur.';
    case 'invalid_request': return 'Müraciət identifikatoru düzgün deyil.';
    case 'not_found': return 'Müraciət tapılmadı.';
    case 'already_verified': return 'Bu müraciətin ödənişi artıq təsdiqlənib.';
    case 'invalid_status': return 'Bu müraciət üçün ödəniş təsdiqi mümkün deyil.';
    default: return 'Ödənişi təsdiq etmək mümkün olmadı. Yenidən cəhd edin.';
  }
}

export function getPaymentConfirmationErrorMessage(error: unknown): string {
  if (error instanceof ApplicationReviewError) {
    if (error.code === 'not_authorized') return getPaymentConfirmationMessage('not_authorized');
    if (error.code === 'invalid_filter') return getPaymentConfirmationMessage('invalid_request');
  }
  return getPaymentConfirmationMessage('unavailable');
}

export type PaymentPanelState = 'confirmable' | 'verified' | 'invalid_transition' | 'unsupported';

// Pure UI state for the payment panel. The RPC is the source of truth; this only decides copy and button visibility.
export function getPaymentPanelState(paymentStatus: PaymentStatus, applicationStatus: ApplicationStatus): PaymentPanelState {
  if (paymentStatus === 'verified') return 'verified';
  if (paymentStatus === 'not_submitted') {
    return applicationStatus === 'pending' ? 'confirmable' : 'invalid_transition';
  }
  return 'unsupported';
}

export function getPaymentPanelText(state: PaymentPanelState): string {
  switch (state) {
    case 'confirmable': return 'Ödəniş qəbz yoxlanıldıqdan sonra təsdiqlənə bilər. Müraciət statusu “Gözləyir” olaraq qalır.';
    case 'verified': return 'Ödəniş artıq təsdiqlənib.';
    case 'invalid_transition': return 'Bu müraciət üçün ödəniş təsdiqi mümkün deyil (ödəniş artıq təqdim olunub və ya müraciət gözləyir statusunda deyil).';
    default: return 'Bu ödəniş statusu üçün təsdiq əməliyyatı bu mərhələdə mövcud deyil.';
  }
}

function isPaymentConfirmationPayload(value: unknown): value is PaymentConfirmationResult {
  if (!value || typeof value !== 'object') return false;
  const payload = value as { success?: unknown; code?: unknown };
  return typeof payload.success === 'boolean'
    && typeof payload.code === 'string'
    && (PAYMENT_CONFIRMATION_CODES as readonly string[]).includes(payload.code);
}

// Calls only the guarded RPC. There is no direct table update anywhere in this path.
export async function confirmApplicationPaymentWithClient(
  client: PaymentConfirmationClient | null,
  role: AppRole | null,
  applicationId: string,
): Promise<PaymentConfirmationResult> {
  assertReviewRole(role);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(applicationId)) {
    throw new ApplicationReviewError('invalid_filter');
  }
  if (!client) throw new ApplicationReviewError('unavailable');

  let response: { data: unknown; error: unknown | null };
  try {
    response = await client.rpc('confirm_application_payment', { p_application_id: applicationId });
  } catch {
    throw new ApplicationReviewError('unavailable');
  }
  if (response.error || !isPaymentConfirmationPayload(response.data)) {
    throw new ApplicationReviewError('unavailable');
  }
  return { success: response.data.success, code: response.data.code };
}

export function confirmApplicationPayment(role: AppRole | null, applicationId: string): Promise<PaymentConfirmationResult> {
  return confirmApplicationPaymentWithClient(getSupabaseClient() as unknown as PaymentConfirmationClient | null, role, applicationId);
}

// Separate admin-only place allocation. It is never called from payment confirmation.
export type PlaceAllocationCode =
  | 'allocated'
  | 'unauthenticated'
  | 'not_authorized'
  | 'invalid_request'
  | 'not_found'
  | 'payment_not_verified'
  | 'invalid_status'
  | 'already_assigned'
  | 'no_available_place'
  | 'allocation_conflict'
  | 'allocation_failed';

export interface PlaceAllocationResult {
  success: boolean;
  code: PlaceAllocationCode;
}

export interface PlaceAllocationClient {
  rpc(fn: 'allocate_application_place', args: { p_application_id: string }): PromiseLike<{ data: unknown; error: unknown | null }>;
}

const PLACE_ALLOCATION_CODES: readonly PlaceAllocationCode[] = [
  'allocated', 'unauthenticated', 'not_authorized', 'invalid_request', 'not_found', 'payment_not_verified',
  'invalid_status', 'already_assigned', 'no_available_place', 'allocation_conflict', 'allocation_failed',
];

// Messages are chosen by code on the client; raw server message text is never displayed.
export function getPlaceAllocationMessage(code: PlaceAllocationCode | 'unavailable'): string {
  switch (code) {
    case 'allocated': return 'Yer təyin edildi.';
    case 'unauthenticated': return 'Sessiya tapılmadı. Yenidən daxil olun.';
    case 'not_authorized': return 'Bu əməliyyat üçün icazə yoxdur.';
    case 'invalid_request': return 'Müraciət identifikatoru düzgün deyil.';
    case 'not_found': return 'Müraciət tapılmadı.';
    case 'payment_not_verified': return 'Ödəniş təsdiqlənməyib.';
    case 'invalid_status': return 'Bu müraciət üçün yer təyini mümkün deyil.';
    case 'already_assigned': return 'Bu müraciətə artıq yer təyin edilib.';
    case 'no_available_place': return 'Bu imtahan üçün boş yer yoxdur.';
    case 'allocation_conflict': return 'Yer təyini başa çatmadı. Yenidən cəhd edin.';
    default: return 'Yer təyini həyata keçirilmədi.';
  }
}

function isPlaceAllocationPayload(value: unknown): value is PlaceAllocationResult {
  if (!value || typeof value !== 'object') return false;
  const payload = value as { success?: unknown; code?: unknown };
  return typeof payload.success === 'boolean'
    && typeof payload.code === 'string'
    && (PLACE_ALLOCATION_CODES as readonly string[]).includes(payload.code);
}

// Calls only the guarded RPC. Client-side role check is a UX guard; the RPC re-checks the role.
export async function allocateApplicationPlaceWithClient(
  client: PlaceAllocationClient | null,
  role: AppRole | null,
  applicationId: string,
): Promise<PlaceAllocationResult> {
  assertReviewRole(role);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(applicationId)) {
    throw new ApplicationReviewError('invalid_filter');
  }
  if (!client) throw new ApplicationReviewError('unavailable');

  let response: { data: unknown; error: unknown | null };
  try {
    response = await client.rpc('allocate_application_place', { p_application_id: applicationId });
  } catch {
    throw new ApplicationReviewError('unavailable');
  }
  if (response.error || !isPlaceAllocationPayload(response.data)) {
    throw new ApplicationReviewError('unavailable');
  }
  return { success: response.data.success, code: response.data.code };
}

export function allocateApplicationPlace(role: AppRole | null, applicationId: string): Promise<PlaceAllocationResult> {
  return allocateApplicationPlaceWithClient(getSupabaseClient() as unknown as PlaceAllocationClient | null, role, applicationId);
}
