import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppRole, ExamRoomAssignment, FacilityBuilding, FacilityRoom } from '../types';
import { getSupabaseClient } from './supabaseClient';

// Facility mutations go only through these RPCs. Direct table writes are revoked in the database.
// rooms.capacity is the single place-count source (“Otağın yer sayı”).

export const FACILITY_MANAGER_ROLES: readonly AppRole[] = ['admin', 'super_admin'];
export const FACILITY_NAME_MAX_LENGTH = 120;
export const FACILITY_ADDRESS_MAX_LENGTH = 240;
export const FACILITY_CITY_MAX_LENGTH = 120;
export const FACILITY_CAPACITY_MIN = 1;
export const FACILITY_CAPACITY_MAX = 1000;
export const FACILITY_PRIORITY_MIN = 1;
export const FACILITY_PRIORITY_MAX = 1000;
export const FACILITY_ASSIGNMENT_MAX = 200;
const SEAT_PAGE_SIZE = 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const FACILITY_RESULT_CODES = [
  'building_saved',
  'room_saved',
  'places_synced',
  'exam_rooms_saved',
  'facility_status_changed',
  'facility_archived',
  'unauthenticated',
  'not_authorized',
  'invalid_request',
  'invalid_name',
  'invalid_address',
  'invalid_city',
  'invalid_capacity',
  'invalid_priority',
  'duplicate_room',
  'duplicate_priority',
  'duplicate_name',
  'not_found',
  'archived',
  'already_archived',
  'already_in_state',
  'building_unavailable',
  'room_unavailable',
  'room_in_use',
  'building_in_use',
  'place_assigned',
  'capacity_below_inventory',
  'capacity_full',
  'unavailable',
] as const;

export type FacilityResultCode = typeof FACILITY_RESULT_CODES[number];

export interface FacilityResult {
  success: boolean;
  code: FacilityResultCode;
}

export interface PlaceSyncResult extends FacilityResult {
  activeCount: number;
  createdCount: number;
  activatedCount: number;
  deactivatedCount: number;
}

export interface FacilityBuildingInput {
  id?: string | null;
  name: string;
  address: string;
  city: string;
}

export interface FacilityRoomInput {
  id?: string | null;
  buildingId: string;
  name: string;
  capacity: number;
}

export interface ExamRoomAssignmentInput {
  roomId: string;
  priority: number;
}

export type FacilityKind = 'building' | 'room' | 'place';

export interface FacilityRpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown | null }>;
}

export class FacilityError extends Error {
  constructor(readonly code: 'not_authorized' | 'unavailable') {
    super(code);
    this.name = 'FacilityError';
  }
}

// Fixed Azerbaijani copy chosen by code. Raw server text, SQLSTATE and identifiers are never shown.
const FACILITY_MESSAGES: Record<FacilityResultCode, string> = {
  building_saved: 'Bina yadda saxlanıldı.',
  room_saved: 'Otaq yadda saxlanıldı.',
  places_synced: 'Yer inventarı sinxronlaşdırıldı.',
  exam_rooms_saved: 'İmtahan otaqları yadda saxlanıldı.',
  facility_status_changed: 'Status yeniləndi.',
  facility_archived: 'Məlumat arxivləşdirildi.',
  unauthenticated: 'Sessiya tapılmadı. Yenidən daxil olun.',
  not_authorized: 'Bu əməliyyat üçün icazə yoxdur.',
  invalid_request: 'Göndərilən məlumat düzgün deyil.',
  invalid_name: 'Ad boş ola bilməz və 120 simvoldan uzun olmamalıdır.',
  invalid_address: 'Ünvan boş ola bilməz və 240 simvoldan uzun olmamalıdır.',
  invalid_city: 'Şəhər boş ola bilməz və 120 simvoldan uzun olmamalıdır.',
  invalid_capacity: 'Otağın yer sayı 1 ilə 1000 arasında tam ədəd olmalıdır.',
  invalid_priority: 'Prioritet 1 ilə 1000 arasında tam ədəd olmalıdır.',
  duplicate_room: 'Eyni otaq bir imtahana bir dəfədən çox təyin oluna bilməz.',
  duplicate_priority: 'Prioritetlər təkrarlana bilməz.',
  duplicate_name: 'Bu binada eyni adlı otaq artıq var.',
  not_found: 'Məlumat tapılmadı.',
  archived: 'Arxivləşdirilmiş məlumatı dəyişmək olmaz.',
  already_archived: 'Bu məlumat artıq arxivləşdirilib.',
  already_in_state: 'Vəziyyət artıq bu cürdür.',
  building_unavailable: 'Bina aktiv deyil və ya arxivləşdirilib.',
  room_unavailable: 'Otaq aktiv deyil və ya arxivləşdirilib.',
  room_in_use: 'Otaq aktiv imtahan təyinatında və ya müraciətdədir. Əvvəlcə təyinatı ləğv edin.',
  building_in_use: 'Binada aktiv otaq təyinatı və ya müraciət var.',
  place_assigned: 'Təyin olunmuş yer deaktiv edilə bilməz.',
  capacity_below_inventory: 'Otağın yer sayı aktiv yer sayından az ola bilməz.',
  capacity_full: 'Otaqda yer sayı limiti dolub.',
  unavailable: 'Əməliyyat tamamlanmadı. Yenidən cəhd edin.',
};

export function getFacilityMessage(code: FacilityResultCode): string {
  return FACILITY_MESSAGES[code] ?? FACILITY_MESSAGES.unavailable;
}

export function getFacilityErrorMessage(error: unknown): string {
  if (error instanceof FacilityError && error.code === 'not_authorized') return FACILITY_MESSAGES.not_authorized;
  return FACILITY_MESSAGES.unavailable;
}

function lengthBetween(value: string, min: number, max: number): boolean {
  const length = Array.from(value).length;
  return length >= min && length <= max;
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function isIntegerInRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

// Client-side pre-checks mirror the RPC rules so obvious mistakes never reach the database.
export function validateBuildingInput(input: FacilityBuildingInput): FacilityResultCode | null {
  if (!lengthBetween(input.name.trim(), 1, FACILITY_NAME_MAX_LENGTH)) return 'invalid_name';
  if (!lengthBetween(input.address.trim(), 1, FACILITY_ADDRESS_MAX_LENGTH)) return 'invalid_address';
  if (!lengthBetween(input.city.trim(), 1, FACILITY_CITY_MAX_LENGTH)) return 'invalid_city';
  return null;
}

export function validateRoomInput(input: FacilityRoomInput): FacilityResultCode | null {
  if (!isUuid(input.buildingId)) return 'invalid_request';
  if (!lengthBetween(input.name.trim(), 1, FACILITY_NAME_MAX_LENGTH)) return 'invalid_name';
  if (!isIntegerInRange(input.capacity, FACILITY_CAPACITY_MIN, FACILITY_CAPACITY_MAX)) return 'invalid_capacity';
  return null;
}

export function validateExamRoomAssignments(assignments: readonly ExamRoomAssignmentInput[]): FacilityResultCode | null {
  if (assignments.length > FACILITY_ASSIGNMENT_MAX) return 'invalid_request';
  const roomIds = new Set<string>();
  const priorities = new Set<number>();
  for (const assignment of assignments) {
    if (!isUuid(assignment.roomId)) return 'invalid_request';
    if (!isIntegerInRange(assignment.priority, FACILITY_PRIORITY_MIN, FACILITY_PRIORITY_MAX)) return 'invalid_priority';
    if (roomIds.has(assignment.roomId)) return 'duplicate_room';
    if (priorities.has(assignment.priority)) return 'duplicate_priority';
    roomIds.add(assignment.roomId);
    priorities.add(assignment.priority);
  }
  return null;
}

export function isFacilityManager(role: AppRole | null): boolean {
  return role !== null && FACILITY_MANAGER_ROLES.includes(role);
}

// Pure row mappers (snake_case database rows to camelCase view models).
interface BuildingRow { id: string; name: string; address: string; city: string; is_active: boolean; archived_at: string | null }
interface RoomRow { id: string; building_id: string; name: string; capacity: number; is_active: boolean; archived_at: string | null }
interface ExamRoomRow { room_id: string; priority: number; is_enabled: boolean }

export function mapFacilityBuilding(row: BuildingRow): FacilityBuilding {
  return { id: row.id, name: row.name, address: row.address, city: row.city, isActive: row.is_active, archivedAt: row.archived_at };
}

export function mapFacilityRoom(row: RoomRow): FacilityRoom {
  return { id: row.id, buildingId: row.building_id, name: row.name, capacity: row.capacity, isActive: row.is_active, archivedAt: row.archived_at };
}

export function mapExamRoomAssignment(row: ExamRoomRow): ExamRoomAssignment {
  return { roomId: row.room_id, priority: row.priority, isEnabled: row.is_enabled };
}

export function countActiveSeatsByRoom(rows: ReadonlyArray<{ room_id: string }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.room_id] = (counts[row.room_id] ?? 0) + 1;
  return counts;
}

function assertFacilityManager(role: AppRole | null): void {
  if (!isFacilityManager(role)) throw new FacilityError('not_authorized');
}

async function runFacilityRead<T>(role: AppRole | null, task: (client: SupabaseClient) => Promise<T>): Promise<T> {
  assertFacilityManager(role);
  const client = getSupabaseClient();
  if (!client) throw new FacilityError('unavailable');
  try {
    return await task(client);
  } catch (error) {
    if (error instanceof FacilityError) throw error;
    throw new FacilityError('unavailable');
  }
}

export function listFacilityBuildings(role: AppRole | null): Promise<FacilityBuilding[]> {
  return runFacilityRead(role, async (client) => {
    const { data, error } = await client
      .from('buildings')
      .select('id,name,address,city,is_active,archived_at')
      .order('name', { ascending: true });
    if (error || !data) throw new FacilityError('unavailable');
    return (data as unknown as BuildingRow[]).map(mapFacilityBuilding);
  });
}

export function listFacilityRooms(role: AppRole | null): Promise<FacilityRoom[]> {
  return runFacilityRead(role, async (client) => {
    const { data, error } = await client
      .from('rooms')
      .select('id,building_id,name,capacity,is_active,archived_at')
      .order('name', { ascending: true });
    if (error || !data) throw new FacilityError('unavailable');
    return (data as unknown as RoomRow[]).map(mapFacilityRoom);
  });
}

// Pages through active seats so inventory counts are not truncated by the default row limit.
export function listActiveSeatCounts(role: AppRole | null): Promise<Record<string, number>> {
  return runFacilityRead(role, async (client) => {
    const rows: Array<{ room_id: string }> = [];
    for (let from = 0; ; from += SEAT_PAGE_SIZE) {
      const { data, error } = await client
        .from('seats')
        .select('id,room_id')
        .eq('is_active', true)
        .order('id', { ascending: true })
        .range(from, from + SEAT_PAGE_SIZE - 1);
      if (error || !data) throw new FacilityError('unavailable');
      const page = data as unknown as Array<{ room_id: string }>;
      rows.push(...page);
      if (page.length < SEAT_PAGE_SIZE) break;
    }
    return countActiveSeatsByRoom(rows);
  });
}

export function listExamRoomAssignments(role: AppRole | null, examId: string): Promise<ExamRoomAssignment[]> {
  return runFacilityRead(role, async (client) => {
    if (!isUuid(examId)) throw new FacilityError('unavailable');
    const { data, error } = await client
      .from('exam_rooms')
      .select('room_id,priority,is_enabled')
      .eq('exam_id', examId)
      .order('priority', { ascending: true });
    if (error || !data) throw new FacilityError('unavailable');
    return (data as unknown as ExamRoomRow[]).map(mapExamRoomAssignment);
  });
}

export function getFacilityRpcClient(): FacilityRpcClient | null {
  return getSupabaseClient() as unknown as FacilityRpcClient | null;
}

function isFacilityPayload(value: unknown): value is Record<string, unknown> & FacilityResult {
  if (!value || typeof value !== 'object') return false;
  const payload = value as { success?: unknown; code?: unknown };
  return typeof payload.success === 'boolean'
    && typeof payload.code === 'string'
    && (FACILITY_RESULT_CODES as readonly string[]).includes(payload.code);
}

// Single funnel for every mutation: role gate, RPC call, and strict payload validation.
async function callFacilityRpc(
  client: FacilityRpcClient | null,
  role: AppRole | null,
  fn: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown> & FacilityResult> {
  if (!isFacilityManager(role)) return { success: false, code: 'not_authorized' };
  if (!client) return { success: false, code: 'unavailable' };
  let response: { data: unknown; error: unknown | null };
  try {
    response = await client.rpc(fn, args);
  } catch {
    return { success: false, code: 'unavailable' };
  }
  if (response.error || !isFacilityPayload(response.data)) return { success: false, code: 'unavailable' };
  return response.data;
}

export async function saveFacilityBuilding(
  role: AppRole | null,
  input: FacilityBuildingInput,
  client: FacilityRpcClient | null = getFacilityRpcClient(),
): Promise<FacilityResult> {
  const invalid = validateBuildingInput(input);
  if (invalid) return { success: false, code: invalid };
  if (input.id != null && !isUuid(input.id)) return { success: false, code: 'invalid_request' };
  const payload = await callFacilityRpc(client, role, 'upsert_building', {
    p_building_id: input.id ?? null,
    p_name: input.name.trim(),
    p_address: input.address.trim(),
    p_city: input.city.trim(),
  });
  return { success: payload.success, code: payload.code };
}

export async function saveFacilityRoom(
  role: AppRole | null,
  input: FacilityRoomInput,
  client: FacilityRpcClient | null = getFacilityRpcClient(),
): Promise<FacilityResult> {
  const invalid = validateRoomInput(input);
  if (invalid) return { success: false, code: invalid };
  if (input.id != null && !isUuid(input.id)) return { success: false, code: 'invalid_request' };
  const payload = await callFacilityRpc(client, role, 'upsert_room', {
    p_room_id: input.id ?? null,
    p_building_id: input.buildingId,
    p_name: input.name.trim(),
    p_capacity: input.capacity,
  });
  return { success: payload.success, code: payload.code };
}

// Makes active place inventory equal rooms.capacity. Returns counts only.
export async function syncRoomPlaces(
  role: AppRole | null,
  roomId: string,
  client: FacilityRpcClient | null = getFacilityRpcClient(),
): Promise<PlaceSyncResult> {
  if (!isUuid(roomId)) return { success: false, code: 'invalid_request', activeCount: 0, createdCount: 0, activatedCount: 0, deactivatedCount: 0 };
  const payload = await callFacilityRpc(client, role, 'sync_room_places', { p_room_id: roomId });
  const count = (key: string) => (typeof payload[key] === 'number' ? payload[key] as number : 0);
  return {
    success: payload.success,
    code: payload.code,
    activeCount: count('active_count'),
    createdCount: count('created_count'),
    activatedCount: count('activated_count'),
    deactivatedCount: count('deactivated_count'),
  };
}

export async function setFacilityActive(
  role: AppRole | null,
  kind: FacilityKind,
  facilityId: string,
  isActive: boolean,
  client: FacilityRpcClient | null = getFacilityRpcClient(),
): Promise<FacilityResult> {
  if (!isUuid(facilityId)) return { success: false, code: 'invalid_request' };
  const payload = await callFacilityRpc(client, role, 'set_facility_active', {
    p_facility_type: kind,
    p_facility_id: facilityId,
    p_is_active: isActive,
  });
  return { success: payload.success, code: payload.code };
}

// Archive is the only retirement path for buildings and rooms. Hard delete is not offered.
export async function archiveFacility(
  role: AppRole | null,
  kind: 'building' | 'room',
  facilityId: string,
  client: FacilityRpcClient | null = getFacilityRpcClient(),
): Promise<FacilityResult> {
  if (!isUuid(facilityId)) return { success: false, code: 'invalid_request' };
  const payload = await callFacilityRpc(client, role, 'archive_facility', {
    p_facility_type: kind,
    p_facility_id: facilityId,
  });
  return { success: payload.success, code: payload.code };
}

export async function replaceExamRoomAssignments(
  role: AppRole | null,
  examId: string,
  assignments: readonly ExamRoomAssignmentInput[],
  client: FacilityRpcClient | null = getFacilityRpcClient(),
): Promise<FacilityResult> {
  if (!isUuid(examId)) return { success: false, code: 'invalid_request' };
  const invalid = validateExamRoomAssignments(assignments);
  if (invalid) return { success: false, code: invalid };
  const payload = await callFacilityRpc(client, role, 'replace_exam_rooms', {
    p_exam_id: examId,
    p_room_ids: assignments.map((item) => item.roomId),
    p_priorities: assignments.map((item) => item.priority),
  });
  return { success: payload.success, code: payload.code };
}
