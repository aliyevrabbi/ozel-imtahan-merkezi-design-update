import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  archiveFacility,
  countActiveSeatsByRoom,
  getFacilityErrorMessage,
  getFacilityMessage,
  FacilityError,
  FACILITY_RESULT_CODES,
  isFacilityManager,
  mapExamRoomAssignment,
  mapFacilityBuilding,
  mapFacilityRoom,
  replaceExamRoomAssignments,
  saveFacilityBuilding,
  saveFacilityRoom,
  setFacilityActive,
  syncRoomPlaces,
  validateBuildingInput,
  validateExamRoomAssignments,
  validateRoomInput,
  type FacilityRpcClient,
} from '../src/services/facilityService';

const BUILDING_ID = '11111111-1111-4111-8111-111111111111';
const ROOM_ID = '22222222-2222-4222-8222-222222222222';
const ROOM_ID_2 = '33333333-3333-4333-8333-333333333333';
const EXAM_ID = '44444444-4444-4444-8444-444444444444';

interface RpcCall { fn: string; args: Record<string, unknown> }

function fakeClient(response: { data: unknown; error?: unknown | null } = { data: { success: true, code: 'room_saved' } }) {
  const calls: RpcCall[] = [];
  const client: FacilityRpcClient = {
    async rpc(fn, args) {
      calls.push({ fn, args });
      return { data: response.data, error: response.error ?? null };
    },
  };
  return { client, calls };
}

test('only admin and super_admin are facility managers', () => {
  assert.equal(isFacilityManager('admin'), true);
  assert.equal(isFacilityManager('super_admin'), true);
  assert.equal(isFacilityManager('operator'), false);
  assert.equal(isFacilityManager('scanner'), false);
  assert.equal(isFacilityManager(null), false);
});

test('non-manager roles never reach the RPC layer', async () => {
  const { client, calls } = fakeClient();
  const room = { buildingId: BUILDING_ID, name: 'A-1', capacity: 20 };
  const results = await Promise.all([
    saveFacilityBuilding('operator', { name: 'Bina', address: 'Ünvan', city: 'Bakı' }, client),
    saveFacilityRoom('scanner', room, client),
    syncRoomPlaces('operator', ROOM_ID, client),
    setFacilityActive('operator', 'room', ROOM_ID, false, client),
    archiveFacility(null, 'building', BUILDING_ID, client),
    replaceExamRoomAssignments('scanner', EXAM_ID, [{ roomId: ROOM_ID, priority: 1 }], client),
  ]);
  for (const result of results) {
    assert.equal(result.success, false);
    assert.equal(result.code, 'not_authorized');
  }
  assert.equal(calls.length, 0);
});

test('a missing client reports unavailable without throwing', async () => {
  const result = await saveFacilityRoom('admin', { buildingId: BUILDING_ID, name: 'A-1', capacity: 20 }, null);
  assert.deepEqual(result, { success: false, code: 'unavailable' });
});

test('room place count is validated as a positive integer capped at 1000', () => {
  const base = { buildingId: BUILDING_ID, name: 'A-1' };
  assert.equal(validateRoomInput({ ...base, capacity: 1 }), null);
  assert.equal(validateRoomInput({ ...base, capacity: 1000 }), null);
  assert.equal(validateRoomInput({ ...base, capacity: 0 }), 'invalid_capacity');
  assert.equal(validateRoomInput({ ...base, capacity: -3 }), 'invalid_capacity');
  assert.equal(validateRoomInput({ ...base, capacity: 1001 }), 'invalid_capacity');
  assert.equal(validateRoomInput({ ...base, capacity: 2.5 }), 'invalid_capacity');
  assert.equal(validateRoomInput({ ...base, capacity: Number.NaN }), 'invalid_capacity');
});

test('room and building names are required and length-limited', () => {
  assert.equal(validateRoomInput({ buildingId: BUILDING_ID, name: '   ', capacity: 5 }), 'invalid_name');
  assert.equal(validateRoomInput({ buildingId: BUILDING_ID, name: 'x'.repeat(121), capacity: 5 }), 'invalid_name');
  assert.equal(validateRoomInput({ buildingId: 'not-a-uuid', name: 'A', capacity: 5 }), 'invalid_request');
  assert.equal(validateBuildingInput({ name: '', address: 'a', city: 'b' }), 'invalid_name');
  assert.equal(validateBuildingInput({ name: 'a', address: '', city: 'b' }), 'invalid_address');
  assert.equal(validateBuildingInput({ name: 'a', address: 'a', city: ' ' }), 'invalid_city');
});

test('exam room assignments reject duplicate rooms, duplicate priorities and bad priorities', () => {
  assert.equal(validateExamRoomAssignments([
    { roomId: ROOM_ID, priority: 1 },
    { roomId: ROOM_ID_2, priority: 2 },
  ]), null);
  assert.equal(validateExamRoomAssignments([
    { roomId: ROOM_ID, priority: 1 },
    { roomId: ROOM_ID, priority: 2 },
  ]), 'duplicate_room');
  assert.equal(validateExamRoomAssignments([
    { roomId: ROOM_ID, priority: 1 },
    { roomId: ROOM_ID_2, priority: 1 },
  ]), 'duplicate_priority');
  assert.equal(validateExamRoomAssignments([{ roomId: ROOM_ID, priority: 0 }]), 'invalid_priority');
});

test('invalid assignments never call the RPC', async () => {
  const { client, calls } = fakeClient();
  const result = await replaceExamRoomAssignments('admin', EXAM_ID, [
    { roomId: ROOM_ID, priority: 1 },
    { roomId: ROOM_ID_2, priority: 1 },
  ], client);
  assert.deepEqual(result, { success: false, code: 'duplicate_priority' });
  assert.equal(calls.length, 0);
});

test('valid mutations send trimmed, camelCase-to-snake_case RPC arguments', async () => {
  const building = fakeClient({ data: { success: true, code: 'building_saved' } });
  assert.deepEqual(
    await saveFacilityBuilding('admin', { name: '  Əsas bina ', address: ' Küçə 1 ', city: ' Bakı ' }, building.client),
    { success: true, code: 'building_saved' },
  );
  assert.equal(building.calls[0].fn, 'upsert_building');
  assert.deepEqual(building.calls[0].args, { p_building_id: null, p_name: 'Əsas bina', p_address: 'Küçə 1', p_city: 'Bakı' });

  const room = fakeClient();
  await saveFacilityRoom('super_admin', { buildingId: BUILDING_ID, name: 'A-1', capacity: 30 }, room.client);
  assert.equal(room.calls[0].fn, 'upsert_room');
  assert.deepEqual(room.calls[0].args, { p_room_id: null, p_building_id: BUILDING_ID, p_name: 'A-1', p_capacity: 30 });

  const assign = fakeClient({ data: { success: true, code: 'exam_rooms_saved' } });
  await replaceExamRoomAssignments('admin', EXAM_ID, [
    { roomId: ROOM_ID, priority: 2 },
    { roomId: ROOM_ID_2, priority: 1 },
  ], assign.client);
  assert.equal(assign.calls[0].fn, 'replace_exam_rooms');
  assert.deepEqual(assign.calls[0].args, {
    p_exam_id: EXAM_ID,
    p_room_ids: [ROOM_ID, ROOM_ID_2],
    p_priorities: [2, 1],
  });
});

test('place sync returns counts only and maps them to camelCase', async () => {
  const { client, calls } = fakeClient({
    data: { success: true, code: 'places_synced', active_count: 20, created_count: 5, activated_count: 2, deactivated_count: 1 },
  });
  const result = await syncRoomPlaces('admin', ROOM_ID, client);
  assert.equal(calls[0].fn, 'sync_room_places');
  assert.deepEqual(result, {
    success: true,
    code: 'places_synced',
    activeCount: 20,
    createdCount: 5,
    activatedCount: 2,
    deactivatedCount: 1,
  });
});

test('RPC errors and malformed payloads are mapped to unavailable, never raw text', async () => {
  const rawError = { message: 'relation "rooms" violated check constraint 42501 user 0123456789' };
  const errored = fakeClient({ data: null, error: rawError });
  const failed = await saveFacilityRoom('admin', { buildingId: BUILDING_ID, name: 'A', capacity: 5 }, errored.client);
  assert.deepEqual(failed, { success: false, code: 'unavailable' });

  const unknownCode = fakeClient({ data: { success: false, code: 'SQLSTATE 42501' } });
  assert.deepEqual(
    await setFacilityActive('admin', 'building', BUILDING_ID, false, unknownCode.client),
    { success: false, code: 'unavailable' },
  );

  const thrown: FacilityRpcClient = { rpc: async () => { throw new Error('socket hang up at 10.0.0.1'); } };
  assert.deepEqual(await archiveFacility('admin', 'room', ROOM_ID, thrown), { success: false, code: 'unavailable' });
});

test('business rule codes from the server are passed through to fixed copy', async () => {
  const { client } = fakeClient({ data: { success: false, code: 'capacity_below_inventory' } });
  const result = await saveFacilityRoom('admin', { buildingId: BUILDING_ID, name: 'A', capacity: 3 }, client);
  assert.deepEqual(result, { success: false, code: 'capacity_below_inventory' });
  assert.equal(getFacilityMessage(result.code), 'Otağın yer sayı aktiv yer sayından az ola bilməz.');
});

test('every result code has fixed Azerbaijani copy that is not the raw code', () => {
  for (const code of FACILITY_RESULT_CODES) {
    const message = getFacilityMessage(code);
    assert.ok(message.length > 0, code);
    assert.doesNotMatch(message, /SQLSTATE|42501|[0-9a-f]{8}-[0-9a-f]{4}/i, code);
  }
});

test('error messages hide internal failure details', () => {
  assert.equal(getFacilityErrorMessage(new FacilityError('not_authorized')), 'Bu əməliyyat üçün icazə yoxdur.');
  assert.equal(getFacilityErrorMessage(new FacilityError('unavailable')), 'Əməliyyat tamamlanmadı. Yenidən cəhd edin.');
  assert.equal(getFacilityErrorMessage(new Error('password=secret')), 'Əməliyyat tamamlanmadı. Yenidən cəhd edin.');
});

test('row mappers convert the live schema to view models', () => {
  assert.deepEqual(mapFacilityBuilding({
    id: BUILDING_ID, name: 'Bina', address: 'Ünvan', city: 'Bakı', is_active: true, archived_at: null,
  }), { id: BUILDING_ID, name: 'Bina', address: 'Ünvan', city: 'Bakı', isActive: true, archivedAt: null });

  assert.deepEqual(mapFacilityRoom({
    id: ROOM_ID, building_id: BUILDING_ID, name: 'A-1', capacity: 24, is_active: false, archived_at: '2026-10-15T10:00:00Z',
  }), {
    id: ROOM_ID, buildingId: BUILDING_ID, name: 'A-1', capacity: 24, isActive: false, archivedAt: '2026-10-15T10:00:00Z',
  });

  assert.deepEqual(mapExamRoomAssignment({ room_id: ROOM_ID, priority: 3, is_enabled: true }), {
    roomId: ROOM_ID, priority: 3, isEnabled: true,
  });
});

test('active seat counts are grouped per room', () => {
  assert.deepEqual(countActiveSeatsByRoom([
    { room_id: ROOM_ID }, { room_id: ROOM_ID }, { room_id: ROOM_ID_2 },
  ]), { [ROOM_ID]: 2, [ROOM_ID_2]: 1 });
  assert.deepEqual(countActiveSeatsByRoom([]), {});
});

test('the facility service never writes tables directly', () => {
  const source = readFileSync('src/services/facilityService.ts', 'utf8');
  assert.doesNotMatch(source, /\.(insert|update|upsert|delete)\(/);
  assert.match(source, /'upsert_room'/);
  assert.match(source, /'replace_exam_rooms'/);
  assert.doesNotMatch(source, /parta|desk/i);
});

test('the facility panel uses only the service layer and no direct table writes', () => {
  const source = readFileSync('src/components/FacilityManagementPanel.tsx', 'utf8');
  assert.doesNotMatch(source, /\.(from|insert|update|upsert|delete)\(/);
  assert.doesNotMatch(source, /parta|desk/i);
});

test('the facility panel labels room capacity as the place count', () => {
  const source = readFileSync('src/components/FacilityManagementPanel.tsx', 'utf8');
  assert.match(source, /Otağın yer sayı/);
});

test('admin-only mutation controls are gated in the facility panel', () => {
  const source = readFileSync('src/components/FacilityManagementPanel.tsx', 'utf8');
  assert.match(source, /const canMutate = isFacilityManager\(role\);/);
  // Every mutation handler must check canMutate before calling the service.
  assert.match(source, /if \(!canMutate\) \{/);
  assert.match(source, /\{!canMutate \?/);
  assert.doesNotMatch(source, /hard.?delete|DELETE FROM/i);
});

test('the admin layout mounts the facility panel only through role-gated navigation', () => {
  const source = readFileSync('src/components/AdminLayout.tsx', 'utf8');
  assert.match(source, /getVisibleAdminSections\(role\)/);
  assert.match(source, /case 'facilities': return <FacilityManagementPanel role=\{role\} \/>;/);
  const navigation = readFileSync('src/admin/adminNavigation.ts', 'utf8');
  assert.match(navigation, /isFacilityManager|facilities/);
});
