import type { ApplicationStatus, PaymentStatus, TicketStatus } from '../types';
import { APPLICATION_REVIEW_FIELDS, APPLICATION_REVIEW_PAGE_SIZE, ApplicationReviewError } from './applicationReviewService';
import type { ApplicationReviewFilters } from './applicationReviewService';

export type ApplicationReviewQuery = PromiseLike<{ data: unknown[] | null; error: unknown | null }> & {
  order(column: string, options: { ascending: boolean }): ApplicationReviewQuery;
  range(from: number, to: number): ApplicationReviewQuery;
  eq(column: string, value: string): ApplicationReviewQuery;
  ilike(column: string, value: string): ApplicationReviewQuery;
};

export interface ApplicationReviewFromBuilder {
  select(columns: string): ApplicationReviewQuery;
}

export interface ApplicationReviewQueryClient {
  from(table: 'applications'): ApplicationReviewFromBuilder;
}

const APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  'pending', 'under_review', 'confirmed', 'rejected', 'cancelled', 'attended',
];
const PAYMENT_STATUSES: readonly PaymentStatus[] = [
  'not_submitted', 'receipt_received', 'verified', 'rejected',
];
const TICKET_STATUSES: readonly TicketStatus[] = ['not_created', 'active', 'revoked'];

function validateFilters(filters: ApplicationReviewFilters): void {
  if (filters.applicationStatus && !APPLICATION_STATUSES.includes(filters.applicationStatus)) {
    throw new ApplicationReviewError('invalid_filter');
  }
  if (filters.paymentStatus && !PAYMENT_STATUSES.includes(filters.paymentStatus)) {
    throw new ApplicationReviewError('invalid_filter');
  }
  if (filters.ticketStatus && !TICKET_STATUSES.includes(filters.ticketStatus)) {
    throw new ApplicationReviewError('invalid_filter');
  }
  if (filters.sortDirection && filters.sortDirection !== 'asc' && filters.sortDirection !== 'desc') {
    throw new ApplicationReviewError('invalid_filter');
  }
  if (filters.examId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(filters.examId)) {
    throw new ApplicationReviewError('invalid_filter');
  }
}

export function buildApplicationReviewQuery(client: ApplicationReviewQueryClient | null, page: number, filters: ApplicationReviewFilters) {
  if (!client || !Number.isSafeInteger(page) || page < 0) throw new ApplicationReviewError('invalid_filter');
  validateFilters(filters);
  const offset = page * APPLICATION_REVIEW_PAGE_SIZE;
  if (!Number.isSafeInteger(offset)) throw new ApplicationReviewError('invalid_filter');

  let query = client
    .from('applications')
    .select(APPLICATION_REVIEW_FIELDS.join(','))
    .order('created_at', { ascending: filters.sortDirection === 'asc' })
    .order('registration_number', { ascending: true })
    .range(offset, offset + APPLICATION_REVIEW_PAGE_SIZE);

  if (filters.examId) query = query.eq('exam_id', filters.examId);
  if (filters.applicationStatus) query = query.eq('application_status', filters.applicationStatus);
  if (filters.paymentStatus) query = query.eq('payment_status', filters.paymentStatus);
  if (filters.ticketStatus) query = query.eq('ticket_status', filters.ticketStatus);
  const registrationSearch = filters.registrationSearch?.trim();
  if (registrationSearch) query = query.ilike('registration_number', `%${registrationSearch.replace(/[\\%_]/g, '\\$&')}%`);

  return query;
}
