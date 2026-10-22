import type { AppRole, FacilityRoom } from '../types';
import { getSupabaseClient } from './supabaseClient';
import { listFacilityRooms } from './facilityService';

// Read-only admin data. Every query runs through RLS as the signed-in user; no writes here.
// Results are aggregates or minimal field sets: no phone numbers, tokens, ledger rows or raw UUIDs are selected.

export const ADMIN_DATA_ROLES: readonly AppRole[] = ['admin', 'super_admin'];
export const AUDIT_PAGE_SIZE = 20;

export type AdminDataErrorCode = 'not_authorized' | 'unavailable';

export class AdminDataError extends Error {
  readonly code: AdminDataErrorCode;

  constructor(code: AdminDataErrorCode) {
    super(code);
    this.name = 'AdminDataError';
    this.code = code;
  }
}

export const ADMIN_DATA_MESSAGES: Record<AdminDataErrorCode, string> = {
  not_authorized: 'Bu məlumat üçün icazəniz yoxdur.',
  unavailable: 'Məlumat hazırda yüklənə bilmir. Bir az sonra yenidən cəhd edin.',
};

export function getAdminDataErrorMessage(error: unknown): string {
  return error instanceof AdminDataError ? ADMIN_DATA_MESSAGES[error.code] : ADMIN_DATA_MESSAGES.unavailable;
}

export type ExamStatus = 'draft' | 'published' | 'closed' | 'finished' | 'archived';

// Applications that still hold a place. Rejected and cancelled applications release their seat.
const RELEASED_APPLICATION_STATUSES = '(rejected,cancelled)';

export interface ExamCapacityRoom {
  roomId: string;
  capacity: number;
  priority: number;
  isEnabled: boolean;
}

export interface ExamCapacitySummary {
  roomCount: number;
  capacity: number;
  occupied: number;
  available: number;
}

// Capacity uses rooms.capacity only (the single place-count field). Inactive, archived or disabled
// assignments contribute nothing. Occupancy is clamped so the available count never goes negative.
export function summarizeExamCapacity(
  rooms: readonly ExamCapacityRoom[],
  occupied: number,
): ExamCapacitySummary {
  const usable = rooms.filter((room) => room.isEnabled && room.priority > 0);
  const capacity = usable.reduce((total, room) => total + Math.max(0, room.capacity), 0);
  const safeOccupied = Math.max(0, occupied);
  return {
    roomCount: usable.length,
    capacity,
    occupied: safeOccupied,
    available: Math.max(0, capacity - safeOccupied),
  };
}

export interface AdminExamSummary {
  id: string;
  title: string;
  category: string;
  organizer: string;
  examDate: string;
  startTime: string;
  endTime: string;
  city: string;
  status: ExamStatus;
  applicationOpenAt: string | null;
  applicationDeadline: string | null;
  applicationCount: number;
  verifiedPaymentCount: number;
  placedCount: number;
  activeTicketCount: number;
  roomCount: number;
  capacity: number;
  occupied: number;
  available: number;
  roomPriorities: Array<{ roomName: string; priority: number; capacity: number }>;
}

export interface DashboardCounts {
  activeExams: number;
  pendingApplications: number;
  verifiedPayments: number;
  placedApplications: number;
  createdTickets: number;
  activeBuildings: number;
  activeRooms: number;
  availablePlaces: number;
}

export interface AuditEntry {
  id: number;
  action: string;
  actionLabel: string;
  entityType: string;
  entityLabel: string;
  createdAt: string;
  transition: string | null;
  actorLabel: string;
}

const AUDIT_ACTION_LABELS: Readonly<Record<string, string>> = {
  'application.place_allocated': 'Yer təyin edildi',
  'application.payment_confirmed': 'Ödəniş təsdiqləndi',
};

const AUDIT_ENTITY_LABELS: Readonly<Record<string, string>> = {
  application: 'Müraciət',
  exam: 'İmtahan',
  building: 'Bina',
  room: 'Otaq',
  exam_room: 'İmtahan otağı',
  ticket: 'Bilet',
};

const SAFE_STATUS_PATTERN = /^[a-z_]{1,40}$/;

// Only a plain from/to status pair is shown; every other audit detail is dropped.
export function extractSafeTransition(details: unknown): string | null {
  if (!details || typeof details !== 'object') return null;
  const record = details as Record<string, unknown>;
  const from = record.from_status;
  const to = record.to_status;
  if (typeof from !== 'string' || typeof to !== 'string') return null;
  if (!SAFE_STATUS_PATTERN.test(from) || !SAFE_STATUS_PATTERN.test(to)) return null;
  return `${from} → ${to}`;
}

export interface AuditRow {
  id: number;
  action: string;
  entity_type: string;
  details: unknown;
  created_at: string;
}

export function mapAuditEntry(row: AuditRow): AuditEntry {
  const action = SAFE_STATUS_PATTERN.test(row.action.replace(/\./g, '_')) ? row.action : 'unknown';
  return {
    id: row.id,
    action,
    actionLabel: AUDIT_ACTION_LABELS[action] ?? 'Sistem əməliyyatı',
    entityType: row.entity_type,
    entityLabel: AUDIT_ENTITY_LABELS[row.entity_type] ?? 'Qeyd',
    createdAt: row.created_at,
    transition: extractSafeTransition(row.details),
    actorLabel: 'Səlahiyyətli istifadəçi',
  };
}

export function buildDashboardCounts(input: {
  activeExams: number;
  pendingApplications: number;
  verifiedPayments: number;
  placedApplications: number;
  createdTickets: number;
  activeBuildings: number;
  activeRooms: number;
  exams: readonly Pick<AdminExamSummary, 'status' | 'available'>[];
}): DashboardCounts {
  const availablePlaces = input.exams
    .filter((exam) => exam.status === 'published' || exam.status === 'closed')
    .reduce((total, exam) => total + exam.available, 0);
  return {
    activeExams: input.activeExams,
    pendingApplications: input.pendingApplications,
    verifiedPayments: input.verifiedPayments,
    placedApplications: input.placedApplications,
    createdTickets: input.createdTickets,
    activeBuildings: input.activeBuildings,
    activeRooms: input.activeRooms,
    availablePlaces,
  };
}

function requireAdminClient(role: AppRole | null) {
  if (!role || !ADMIN_DATA_ROLES.includes(role)) throw new AdminDataError('not_authorized');
  const client = getSupabaseClient();
  if (!client) throw new AdminDataError('unavailable');
  return client;
}

interface ExamRow {
  id: string;
  title: string;
  category: string;
  organizer: string;
  exam_date: string;
  start_time: string;
  end_time: string;
  city: string;
  status: ExamStatus;
  application_open_at: string | null;
  application_deadline: string | null;
}

interface ExamRoomRow {
  exam_id: string;
  room_id: string;
  priority: number;
  is_enabled: boolean;
}

export async function listAdminExams(role: AppRole | null): Promise<AdminExamSummary[]> {
  const client = requireAdminClient(role);
  const [examsResult, examRoomsResult, rooms] = await Promise.all([
    client.from('exams')
      .select('id,title,category,organizer,exam_date,start_time,end_time,city,status,application_open_at,application_deadline')
      .order('exam_date', { ascending: false }),
    client.from('exam_rooms').select('exam_id,room_id,priority,is_enabled'),
    listFacilityRooms(role),
  ]);
  if (examsResult.error || !examsResult.data) throw new AdminDataError('unavailable');
  if (examRoomsResult.error || !examRoomsResult.data) throw new AdminDataError('unavailable');

  const exams = examsResult.data as unknown as ExamRow[];
  const assignments = examRoomsResult.data as unknown as ExamRoomRow[];
  const roomById = new Map<string, FacilityRoom>(rooms.map((room) => [room.id, room]));

  return Promise.all(exams.map(async (exam) => {
    const examAssignments = assignments.filter((row) => row.exam_id === exam.id);
    const capacityRooms: ExamCapacityRoom[] = examAssignments.flatMap((row) => {
      const room = roomById.get(row.room_id);
      if (!room || !room.isActive || room.archivedAt !== null) return [];
      return [{ roomId: room.id, capacity: room.capacity, priority: row.priority, isEnabled: row.is_enabled }];
    });
    const [applicationCount, verifiedPaymentCount, placedCount, activeTicketCount] = await Promise.all([
      countRows(client.from('applications').select('id', { count: 'exact', head: true }).eq('exam_id', exam.id)),
      countRows(client.from('applications').select('id', { count: 'exact', head: true }).eq('exam_id', exam.id).eq('payment_status', 'verified')),
      countRows(client.from('applications').select('id', { count: 'exact', head: true }).eq('exam_id', exam.id).not('assigned_seat_id', 'is', null).not('application_status', 'in', RELEASED_APPLICATION_STATUSES)),
      countRows(client.from('applications').select('id', { count: 'exact', head: true }).eq('exam_id', exam.id).eq('ticket_status', 'active')),
    ]);
    const capacity = summarizeExamCapacity(capacityRooms, placedCount);
    return {
      id: exam.id,
      title: exam.title,
      category: exam.category,
      organizer: exam.organizer,
      examDate: exam.exam_date,
      startTime: exam.start_time,
      endTime: exam.end_time,
      city: exam.city,
      status: exam.status,
      applicationOpenAt: exam.application_open_at,
      applicationDeadline: exam.application_deadline,
      applicationCount,
      verifiedPaymentCount,
      placedCount,
      activeTicketCount,
      roomCount: capacity.roomCount,
      capacity: capacity.capacity,
      occupied: capacity.occupied,
      available: capacity.available,
      roomPriorities: examAssignments
        .filter((row) => roomById.has(row.room_id))
        .map((row) => ({
          roomName: roomById.get(row.room_id)?.name ?? '',
          priority: row.priority,
          capacity: roomById.get(row.room_id)?.capacity ?? 0,
        }))
        .sort((a, b) => a.priority - b.priority),
    };
  }));
}

async function countRows(query: PromiseLike<{ count: number | null; error: unknown | null }>): Promise<number> {
  const { count, error } = await query;
  if (error) throw new AdminDataError('unavailable');
  return count ?? 0;
}

export async function getDashboardCounts(role: AppRole | null): Promise<DashboardCounts> {
  const client = requireAdminClient(role);
  const [exams, pending, verified, placed, tickets, buildings, rooms] = await Promise.all([
    listAdminExams(role),
    countRows(client.from('applications').select('id', { count: 'exact', head: true }).eq('application_status', 'pending')),
    countRows(client.from('applications').select('id', { count: 'exact', head: true }).eq('payment_status', 'verified')),
    countRows(client.from('applications').select('id', { count: 'exact', head: true }).not('assigned_seat_id', 'is', null)),
    countRows(client.from('tickets').select('id', { count: 'exact', head: true })),
    countRows(client.from('buildings').select('id', { count: 'exact', head: true }).eq('is_active', true).is('archived_at', null)),
    countRows(client.from('rooms').select('id', { count: 'exact', head: true }).eq('is_active', true).is('archived_at', null)),
  ]);
  return buildDashboardCounts({
    activeExams: exams.filter((exam) => exam.status === 'published').length,
    pendingApplications: pending,
    verifiedPayments: verified,
    placedApplications: placed,
    createdTickets: tickets,
    activeBuildings: buildings,
    activeRooms: rooms,
    exams,
  });
}

export async function listAuditJournal(role: AppRole | null, page: number): Promise<{ entries: AuditEntry[]; hasNextPage: boolean }> {
  const client = requireAdminClient(role);
  const safePage = Math.max(0, Math.floor(page));
  const from = safePage * AUDIT_PAGE_SIZE;
  const { data, error } = await client
    .from('audit_logs')
    .select('id,action,entity_type,details,created_at')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + AUDIT_PAGE_SIZE);
  if (error || !data) throw new AdminDataError('unavailable');
  const rows = (data as unknown as AuditRow[]).slice(0, AUDIT_PAGE_SIZE);
  return {
    entries: rows.map(mapAuditEntry),
    hasNextPage: (data as unknown[]).length > AUDIT_PAGE_SIZE,
  };
}

export interface AssignedPlaceDisplay {
  buildingName: string;
  roomName: string;
  seatNumber: string;
  roomCapacity: number;
  occupied: number;
  available: number;
}

// Shows where an allocated application sits. Returns null when nothing is assigned.
export async function getAssignedPlaceDisplay(role: AppRole | null, applicationId: string): Promise<AssignedPlaceDisplay | null> {
  const client = requireAdminClient(role);
  const { data: application, error: applicationError } = await client
    .from('applications')
    .select('exam_id,assigned_building_id,assigned_room_id,assigned_seat_id')
    .eq('id', applicationId)
    .maybeSingle();
  if (applicationError) throw new AdminDataError('unavailable');
  const row = application as unknown as {
    exam_id: string;
    assigned_building_id: string | null;
    assigned_room_id: string | null;
    assigned_seat_id: string | null;
  } | null;
  if (!row || !row.assigned_room_id || !row.assigned_seat_id || !row.assigned_building_id) return null;

  const [buildings, rooms, seatResult, occupied] = await Promise.all([
    listBuildingNames(role),
    listFacilityRooms(role),
    client.from('seats').select('seat_number').eq('id', row.assigned_seat_id).maybeSingle(),
    countRows(client.from('applications').select('id', { count: 'exact', head: true })
      .eq('exam_id', row.exam_id)
      .eq('assigned_room_id', row.assigned_room_id)
      .not('application_status', 'in', RELEASED_APPLICATION_STATUSES)),
  ]);
  if (seatResult.error || !seatResult.data) throw new AdminDataError('unavailable');
  const room = rooms.find((item) => item.id === row.assigned_room_id);
  if (!room) throw new AdminDataError('unavailable');
  const seat = seatResult.data as unknown as { seat_number: string };
  return {
    buildingName: buildings.get(row.assigned_building_id) ?? '',
    roomName: room.name,
    seatNumber: seat.seat_number,
    roomCapacity: room.capacity,
    occupied,
    available: Math.max(0, room.capacity - occupied),
  };
}

async function listBuildingNames(role: AppRole | null): Promise<Map<string, string>> {
  const client = requireAdminClient(role);
  const { data, error } = await client.from('buildings').select('id,name');
  if (error || !data) throw new AdminDataError('unavailable');
  return new Map((data as unknown as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]));
}
