import type { AppRole } from '../types';
import { getSupabaseClient } from './supabaseClient';
import type { ExamStatus } from './adminDataService';

// Exam mutations go only through the Phase 6 SECURITY DEFINER RPCs. No direct table writes.

export const EXAM_MANAGER_ROLES: readonly AppRole[] = ['admin', 'super_admin'];

export const EXAM_CATEGORIES = ['buraxilis', 'sinaq', 'monitorinq', 'hediyyeli', 'fenn'] as const;
export type ExamCategory = typeof EXAM_CATEGORIES[number];

export const EXAM_CATEGORY_LABELS: Readonly<Record<ExamCategory, string>> = {
  buraxilis: 'Buraxılış',
  sinaq: 'Sınaq',
  monitorinq: 'Monitorinq',
  hediyyeli: 'Hədiyyəli',
  fenn: 'Fənn',
};

export const EXAM_TITLE_MAX_LENGTH = 200;
export const EXAM_ORGANIZER_MAX_LENGTH = 200;
export const EXAM_CITY_MAX_LENGTH = 120;
export const EXAM_GRADE_MAX_LENGTH = 40;
export const EXAM_SUBJECT_MAX_LENGTH = 120;
export const EXAM_LIST_MAX_ITEMS = 20;
export const EXAM_PRICE_MAX_LENGTH = 500;
export const EXAM_DESCRIPTION_MAX_LENGTH = 4000;

// Allowed forward transitions. Mirrors change_exam_status in the database.
export const EXAM_STATUS_TRANSITIONS: Readonly<Record<ExamStatus, readonly ExamStatus[]>> = {
  draft: ['published'],
  published: ['closed', 'archived'],
  closed: ['finished', 'archived'],
  finished: ['archived'],
  archived: [],
};

export function getAllowedExamTransitions(status: ExamStatus): readonly ExamStatus[] {
  return EXAM_STATUS_TRANSITIONS[status] ?? [];
}

export function canTransitionExamStatus(from: ExamStatus, to: ExamStatus): boolean {
  return getAllowedExamTransitions(from).includes(to);
}

export function canArchiveExam(status: ExamStatus): boolean {
  return getAllowedExamTransitions(status).includes('archived');
}

export function isExamManager(role: AppRole | null): boolean {
  return role !== null && EXAM_MANAGER_ROLES.includes(role);
}

export interface ExamFormInput {
  title: string;
  category: string;
  organizer: string;
  grades: string[];
  subjects: string[];
  examDate: string;
  startTime: string;
  endTime: string;
  city: string;
  applicationOpenAt: string | null;
  applicationDeadline: string | null;
  priceDescription: string | null;
  description: string | null;
}

export type ExamValidationCode =
  | 'invalid_title'
  | 'invalid_category'
  | 'invalid_organizer'
  | 'invalid_grades'
  | 'invalid_subjects'
  | 'invalid_city'
  | 'invalid_exam_date'
  | 'invalid_time_range'
  | 'invalid_application_window'
  | 'invalid_request';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}(:\d{2})?$/;

function lengthBetween(value: string, min: number, max: number): boolean {
  const length = Array.from(value).length;
  return length >= min && length <= max;
}

function parseTimestamp(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? Number.NaN : time;
}

// Client-side pre-checks mirror the database rules so obvious mistakes never reach the RPC.
// `todayIso` is the local calendar date (YYYY-MM-DD) used only for the past-date check on create.
export function validateExamForm(input: ExamFormInput, todayIso: string, checkDate: boolean): ExamValidationCode | null {
  const title = input.title.trim();
  if (!lengthBetween(title, 1, EXAM_TITLE_MAX_LENGTH)) return 'invalid_title';
  if (!(EXAM_CATEGORIES as readonly string[]).includes(input.category)) return 'invalid_category';
  const organizer = input.organizer.trim();
  if (!lengthBetween(organizer, 1, EXAM_ORGANIZER_MAX_LENGTH)) return 'invalid_organizer';
  const grades = input.grades.map((item) => item.trim()).filter((item) => item !== '');
  if (grades.length < 1 || grades.length > EXAM_LIST_MAX_ITEMS || grades.some((item) => !lengthBetween(item, 1, EXAM_GRADE_MAX_LENGTH))) {
    return 'invalid_grades';
  }
  const subjects = input.subjects.map((item) => item.trim()).filter((item) => item !== '');
  if (subjects.length < 1 || subjects.length > EXAM_LIST_MAX_ITEMS || subjects.some((item) => !lengthBetween(item, 1, EXAM_SUBJECT_MAX_LENGTH))) {
    return 'invalid_subjects';
  }
  if (!lengthBetween(input.city.trim(), 1, EXAM_CITY_MAX_LENGTH)) return 'invalid_city';
  if (!DATE_PATTERN.test(input.examDate)) return 'invalid_exam_date';
  if (checkDate && input.examDate < todayIso) return 'invalid_exam_date';
  if (!TIME_PATTERN.test(input.startTime) || !TIME_PATTERN.test(input.endTime)) return 'invalid_time_range';
  if (input.startTime >= input.endTime) return 'invalid_time_range';
  const open = parseTimestamp(input.applicationOpenAt);
  const deadline = parseTimestamp(input.applicationDeadline);
  if (Number.isNaN(open) || Number.isNaN(deadline)) return 'invalid_request';
  if (open !== null && deadline !== null && open >= deadline) return 'invalid_application_window';
  if (input.priceDescription !== null && input.priceDescription.length > EXAM_PRICE_MAX_LENGTH) return 'invalid_request';
  if (input.description !== null && input.description.length > EXAM_DESCRIPTION_MAX_LENGTH) return 'invalid_request';
  return null;
}

export type ExamResultCode =
  | 'created'
  | 'updated'
  | 'status_changed'
  | 'archived'
  | 'unauthenticated'
  | 'not_authorized'
  | 'invalid_request'
  | 'not_found'
  | 'exam_locked'
  | 'invalid_status_transition'
  | 'unavailable'
  | ExamValidationCode;

export interface ExamResult {
  success: boolean;
  code: ExamResultCode;
  message: string;
}

const RESULT_CODES: readonly ExamResultCode[] = [
  'created', 'updated', 'status_changed', 'archived', 'unauthenticated', 'not_authorized',
  'invalid_request', 'not_found', 'exam_locked', 'invalid_status_transition', 'invalid_title',
  'invalid_category', 'invalid_organizer', 'invalid_grades', 'invalid_subjects', 'invalid_city',
  'invalid_exam_date', 'invalid_time_range', 'invalid_application_window', 'unavailable',
];

export const EXAM_MESSAGE_FALLBACK = 'Əməliyyat tamamlanmadı. Yenidən cəhd edin.';

export function getExamResultMessage(code: ExamResultCode): string {
  switch (code) {
    case 'created': return 'İmtahan yaradıldı.';
    case 'updated': return 'İmtahan yeniləndi.';
    case 'status_changed': return 'İmtahanın statusu dəyişdirildi.';
    case 'archived': return 'İmtahan arxivləşdirildi.';
    case 'not_authorized': return 'Bu əməliyyat üçün icazə yoxdur.';
    case 'unauthenticated': return 'Sessiya tapılmadı. Yenidən daxil olun.';
    case 'not_found': return 'İmtahan tapılmadı.';
    case 'exam_locked': return 'Bu imtahan artıq redaktə oluna bilməz.';
    case 'invalid_status_transition': return 'Bu status dəyişikliyi icazəli deyil.';
    default: return EXAM_MESSAGE_FALLBACK;
  }
}

// Only a validated payload with a known code is accepted. Anything else is an unavailable result.
export function parseExamResult(value: unknown): ExamResult {
  if (!value || typeof value !== 'object') return { success: false, code: 'unavailable', message: EXAM_MESSAGE_FALLBACK };
  const payload = value as { success?: unknown; code?: unknown };
  if (typeof payload.success !== 'boolean' || typeof payload.code !== 'string') {
    return { success: false, code: 'unavailable', message: EXAM_MESSAGE_FALLBACK };
  }
  if (!(RESULT_CODES as readonly string[]).includes(payload.code)) {
    return { success: false, code: 'unavailable', message: EXAM_MESSAGE_FALLBACK };
  }
  const code = payload.code as ExamResultCode;
  return { success: payload.success, code, message: getExamResultMessage(code) };
}

export interface ExamRpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown | null }>;
}

function getClient(): ExamRpcClient | null {
  return getSupabaseClient() as unknown as ExamRpcClient | null;
}

async function callExamRpc(client: ExamRpcClient | null, role: AppRole | null, fn: string, args: Record<string, unknown>): Promise<ExamResult> {
  if (!isExamManager(role)) return { success: false, code: 'not_authorized', message: getExamResultMessage('not_authorized') };
  if (!client) return { success: false, code: 'unavailable', message: EXAM_MESSAGE_FALLBACK };
  try {
    const response = await client.rpc(fn, args);
    if (response.error) return { success: false, code: 'unavailable', message: EXAM_MESSAGE_FALLBACK };
    return parseExamResult(response.data);
  } catch {
    return { success: false, code: 'unavailable', message: EXAM_MESSAGE_FALLBACK };
  }
}

function toRpcArgs(input: ExamFormInput): Record<string, unknown> {
  return {
    p_title: input.title.trim(),
    p_category: input.category,
    p_organizer: input.organizer.trim(),
    p_grades: input.grades.map((item) => item.trim()).filter((item) => item !== ''),
    p_subjects: input.subjects.map((item) => item.trim()).filter((item) => item !== ''),
    p_exam_date: input.examDate,
    p_start_time: input.startTime,
    p_end_time: input.endTime,
    p_city: input.city.trim(),
    p_application_open_at: input.applicationOpenAt || null,
    p_application_deadline: input.applicationDeadline || null,
    p_price_description: input.priceDescription?.trim() ? input.priceDescription.trim() : null,
    p_description: input.description?.trim() ? input.description.trim() : null,
  };
}

function todayIsoLocal(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export async function createExam(role: AppRole | null, input: ExamFormInput, client: ExamRpcClient | null = getClient()): Promise<ExamResult> {
  if (!isExamManager(role)) return { success: false, code: 'not_authorized', message: getExamResultMessage('not_authorized') };
  const invalid = validateExamForm(input, todayIsoLocal(), true);
  if (invalid) return { success: false, code: invalid, message: getExamResultMessage(invalid) };
  return callExamRpc(client, role, 'create_exam', toRpcArgs(input));
}

export async function updateExam(
  role: AppRole | null,
  examId: string,
  input: ExamFormInput,
  checkDate: boolean,
  client: ExamRpcClient | null = getClient(),
): Promise<ExamResult> {
  if (!isExamManager(role)) return { success: false, code: 'not_authorized', message: getExamResultMessage('not_authorized') };
  const invalid = validateExamForm(input, todayIsoLocal(), checkDate);
  if (invalid) return { success: false, code: invalid, message: getExamResultMessage(invalid) };
  return callExamRpc(client, role, 'update_exam', { p_exam_id: examId, ...toRpcArgs(input) });
}

export async function changeExamStatus(
  role: AppRole | null,
  examId: string,
  from: ExamStatus,
  to: ExamStatus,
  client: ExamRpcClient | null = getClient(),
): Promise<ExamResult> {
  if (!isExamManager(role)) return { success: false, code: 'not_authorized', message: getExamResultMessage('not_authorized') };
  if (to === 'archived' || !canTransitionExamStatus(from, to)) {
    return { success: false, code: 'invalid_status_transition', message: getExamResultMessage('invalid_status_transition') };
  }
  return callExamRpc(client, role, 'change_exam_status', { p_exam_id: examId, p_status: to });
}

export async function archiveExam(role: AppRole | null, examId: string, client: ExamRpcClient | null = getClient()): Promise<ExamResult> {
  return callExamRpc(client, role, 'archive_exam', { p_exam_id: examId });
}

export interface ExamEditRecord {
  id: string;
  title: string;
  category: string;
  organizer: string;
  grades: string[];
  subjects: string[];
  examDate: string;
  startTime: string;
  endTime: string;
  city: string;
  status: ExamStatus;
  applicationOpenAt: string | null;
  applicationDeadline: string | null;
  priceDescription: string | null;
  description: string | null;
}

interface ExamEditRow {
  id: string;
  title: string;
  category: string;
  organizer: string;
  grades: string[];
  subjects: string[];
  exam_date: string;
  start_time: string;
  end_time: string;
  city: string;
  status: ExamStatus;
  application_open_at: string | null;
  application_deadline: string | null;
  price_description: string | null;
  description: string | null;
}

export function mapExamEditRecord(row: ExamEditRow): ExamEditRecord {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    organizer: row.organizer,
    grades: row.grades,
    subjects: row.subjects,
    examDate: row.exam_date,
    startTime: row.start_time.slice(0, 5),
    endTime: row.end_time.slice(0, 5),
    city: row.city,
    status: row.status,
    applicationOpenAt: row.application_open_at,
    applicationDeadline: row.application_deadline,
    priceDescription: row.price_description,
    description: row.description,
  };
}

// Loads one exam's editable fields for the edit form. Read-only, RLS-scoped, no private data.
export async function getExamForEdit(role: AppRole | null, examId: string): Promise<ExamEditRecord> {
  if (!isExamManager(role)) throw new Error('not_authorized');
  const client = getSupabaseClient();
  if (!client) throw new Error('unavailable');
  const { data, error } = await client
    .from('exams')
    .select('id,title,category,organizer,grades,subjects,exam_date,start_time,end_time,city,status,application_open_at,application_deadline,price_description,description')
    .eq('id', examId)
    .maybeSingle();
  if (error || !data) throw new Error('unavailable');
  return mapExamEditRecord(data as unknown as ExamEditRow);
}

export function toFormInput(record: ExamEditRecord): ExamFormInput {
  return {
    title: record.title,
    category: record.category,
    organizer: record.organizer,
    grades: record.grades,
    subjects: record.subjects,
    examDate: record.examDate,
    startTime: record.startTime,
    endTime: record.endTime,
    city: record.city,
    applicationOpenAt: record.applicationOpenAt,
    applicationDeadline: record.applicationDeadline,
    priceDescription: record.priceDescription,
    description: record.description,
  };
}
