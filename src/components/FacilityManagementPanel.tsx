import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import type { AppRole, ExamRoomAssignment, FacilityBuilding, FacilityRoom } from '../types';
import { listReviewExamOptions } from '../services/applicationReviewService';
import {
  FACILITY_ADDRESS_MAX_LENGTH,
  FACILITY_CAPACITY_MAX,
  FACILITY_CAPACITY_MIN,
  FACILITY_CITY_MAX_LENGTH,
  FACILITY_NAME_MAX_LENGTH,
  FACILITY_PRIORITY_MAX,
  FACILITY_PRIORITY_MIN,
  archiveFacility,
  getFacilityErrorMessage,
  getFacilityMessage,
  isFacilityManager,
  listActiveSeatCounts,
  listExamRoomAssignments,
  listFacilityBuildings,
  listFacilityRooms,
  replaceExamRoomAssignments,
  saveFacilityBuilding,
  saveFacilityRoom,
  setFacilityActive,
  syncRoomPlaces,
} from '../services/facilityService';
import type { ExamRoomAssignmentInput, FacilityResult } from '../services/facilityService';

interface FacilityManagementPanelProps {
  role: AppRole;
}

interface Notice {
  type: 'success' | 'error';
  text: string;
}

interface BuildingDraft {
  id: string | null;
  name: string;
  address: string;
  city: string;
}

interface RoomDraft {
  id: string | null;
  buildingId: string;
  name: string;
  capacity: string;
}

interface AssignmentDraft {
  selected: boolean;
  priority: string;
}

const INPUT_CLASS = 'mt-1 min-h-11 w-full rounded-xl border border-[#E5E5E0] bg-[#FAFAF7] px-3 text-sm text-[#0F172A]';
const BUTTON_PRIMARY = 'min-h-11 rounded-xl bg-[#0F172A] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40';
const BUTTON_SECONDARY = 'min-h-11 rounded-xl border border-[#E5E5E0] px-3 text-sm font-semibold text-[#334155] disabled:cursor-not-allowed disabled:opacity-40';

export function FacilityManagementPanel({ role }: FacilityManagementPanelProps) {
  const canMutate = isFacilityManager(role);
  const [exams, setExams] = useState<Array<{ id: string; title: string }>>([]);
  const [buildings, setBuildings] = useState<FacilityBuilding[]>([]);
  const [rooms, setRooms] = useState<FacilityRoom[]>([]);
  const [seatCounts, setSeatCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [buildingDraft, setBuildingDraft] = useState<BuildingDraft | null>(null);
  const [roomDraft, setRoomDraft] = useState<RoomDraft | null>(null);
  const [roomBuildingFilter, setRoomBuildingFilter] = useState('');
  const [examId, setExamId] = useState('');
  const [assignmentDraft, setAssignmentDraft] = useState<Record<string, AssignmentDraft>>({});
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);

  useEffect(() => {
    if (!canMutate) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setLoadError(null);
    void Promise.all([
      listFacilityBuildings(role),
      listFacilityRooms(role),
      listActiveSeatCounts(role),
      listReviewExamOptions(role),
    ]).then(([loadedBuildings, loadedRooms, loadedCounts, loadedExams]) => {
      if (!active) return;
      setBuildings(loadedBuildings);
      setRooms(loadedRooms);
      setSeatCounts(loadedCounts);
      setExams(loadedExams);
    }).catch((error: unknown) => {
      if (active) setLoadError(getFacilityErrorMessage(error));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [canMutate, refreshKey, role]);

  useEffect(() => {
    if (!examId || !canMutate) {
      setAssignmentDraft({});
      return;
    }
    let active = true;
    setAssignmentsLoading(true);
    void listExamRoomAssignments(role, examId).then((items: ExamRoomAssignment[]) => {
      if (!active) return;
      const draft: Record<string, AssignmentDraft> = {};
      for (const item of items) draft[item.roomId] = { selected: item.isEnabled, priority: String(item.priority) };
      setAssignmentDraft(draft);
    }).catch((error: unknown) => {
      if (!active) return;
      setAssignmentDraft({});
      setNotice({ type: 'error', text: getFacilityErrorMessage(error) });
    }).finally(() => {
      if (active) setAssignmentsLoading(false);
    });
    return () => { active = false; };
  }, [canMutate, examId, refreshKey, role]);

  const buildingById = useMemo(() => new Map(buildings.map((building) => [building.id, building])), [buildings]);

  // Only active, non-archived rooms in active, non-archived buildings can receive exam assignments.
  const assignableRooms = useMemo(() => rooms.filter((room) => {
    const building = buildingById.get(room.buildingId);
    return room.isActive && room.archivedAt === null && building !== undefined && building.isActive && building.archivedAt === null;
  }), [buildingById, rooms]);

  const visibleRooms = useMemo(
    () => (roomBuildingFilter ? rooms.filter((room) => room.buildingId === roomBuildingFilter) : rooms),
    [roomBuildingFilter, rooms],
  );

  const refresh = () => setRefreshKey((current) => current + 1);

  async function withBusy<T>(task: () => Promise<T>): Promise<T> {
    setBusy(true);
    setNotice(null);
    try {
      return await task();
    } finally {
      setBusy(false);
    }
  }

  function finish(result: FacilityResult, text: string) {
    setNotice({ type: result.success ? 'success' : 'error', text });
    if (result.success) refresh();
  }

  const submitBuilding = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!buildingDraft || busy) return;
    const draft = buildingDraft;
    const result = await withBusy(() => saveFacilityBuilding(role, draft));
    if (result.success) setBuildingDraft(null);
    finish(result, getFacilityMessage(result.code));
  };

  const toggleBuilding = async (building: FacilityBuilding) => {
    if (busy) return;
    const result = await withBusy(() => setFacilityActive(role, 'building', building.id, !building.isActive));
    finish(result, getFacilityMessage(result.code));
  };

  const archiveBuilding = async (building: FacilityBuilding) => {
    if (busy || !window.confirm('Bu bina arxivləşdirilsin? Məlumat silinmir, yalnız arxivə keçir.')) return;
    const result = await withBusy(() => archiveFacility(role, 'building', building.id));
    finish(result, getFacilityMessage(result.code));
  };

  const submitRoom = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!roomDraft || busy) return;
    const draft = roomDraft;
    const result = await withBusy(() => saveFacilityRoom(role, {
      id: draft.id,
      buildingId: draft.buildingId,
      name: draft.name,
      capacity: Number(draft.capacity),
    }));
    if (result.success) setRoomDraft(null);
    finish(result, getFacilityMessage(result.code));
  };

  const toggleRoom = async (room: FacilityRoom) => {
    if (busy) return;
    const result = await withBusy(() => setFacilityActive(role, 'room', room.id, !room.isActive));
    finish(result, getFacilityMessage(result.code));
  };

  const archiveRoom = async (room: FacilityRoom) => {
    if (busy || !window.confirm('Bu otaq arxivləşdirilsin? Məlumat silinmir, yalnız arxivə keçir.')) return;
    const result = await withBusy(() => archiveFacility(role, 'room', room.id));
    finish(result, getFacilityMessage(result.code));
  };

  const syncPlaces = async (room: FacilityRoom) => {
    if (busy) return;
    const result = await withBusy(() => syncRoomPlaces(role, room.id));
    const text = result.success
      ? `${getFacilityMessage(result.code)} Aktiv yer: ${result.activeCount}.`
      : getFacilityMessage(result.code);
    finish(result, text);
  };

  const saveAssignments = async () => {
    if (busy || !examId) return;
    const assignableIds = new Set(assignableRooms.map((room) => room.id));
    const items: ExamRoomAssignmentInput[] = Object.entries(assignmentDraft)
      .filter(([roomId, item]) => item.selected && assignableIds.has(roomId))
      .map(([roomId, item]) => ({ roomId, priority: Number(item.priority) }));
    const result = await withBusy(() => replaceExamRoomAssignments(role, examId, items));
    finish(result, getFacilityMessage(result.code));
  };

  const updateAssignment = (roomId: string, patch: Partial<AssignmentDraft>) => {
    setAssignmentDraft((current) => {
      const base: AssignmentDraft = current[roomId] ?? { selected: false, priority: '' };
      return { ...current, [roomId]: { ...base, ...patch } };
    });
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#EAEAEA] bg-white p-4 shadow-sm sm:p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#D97706]">Özəl İmtahan Mərkəzi · Admin</p>
          <h1 className="mt-1 font-serif text-xl font-bold text-[#0F172A] sm:text-2xl">Obyekt idarəetməsi</h1>
          <p className="mt-1 text-xs text-[#64748B]">Binalar, otaqlar və imtahan otaqları · {role}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={refresh} disabled={loading || busy} className={`${BUTTON_SECONDARY} inline-flex items-center gap-2`}>
            <RefreshCw className="h-4 w-4" /> Yenilə
          </button>
        </div>
      </header>

      {!canMutate ? (
        <section role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
          <div className="flex items-start gap-3"><ShieldAlert className="h-5 w-5 shrink-0" /><p>{getFacilityMessage('not_authorized')}</p></div>
        </section>
      ) : loading ? (
        <p role="status" className="animate-pulse rounded-2xl bg-white p-6 text-center text-sm text-neutral-500">Obyekt məlumatları yüklənir...</p>
      ) : loadError ? (
        <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">{loadError}</p>
      ) : (
        <>
          {notice ? (
            <p role={notice.type === 'error' ? 'alert' : 'status'} className={notice.type === 'error'
              ? 'rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800'
              : 'rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900'}>
              {notice.text}
            </p>
          ) : null}

          {/* Buildings */}
          <section aria-labelledby="facility-buildings" className="space-y-3 rounded-2xl border border-[#EAEAEA] bg-white p-4 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 id="facility-buildings" className="font-serif text-lg font-bold text-[#0F172A]">Binalar</h2>
              <button type="button" disabled={busy} onClick={() => setBuildingDraft({ id: null, name: '', address: '', city: '' })} className={BUTTON_PRIMARY}>Bina əlavə et</button>
            </div>

            {buildingDraft ? (
              <form onSubmit={submitBuilding} className="space-y-3 rounded-xl bg-[#FAFAF7] p-4">
                <label className="block text-sm font-semibold text-[#334155]">Bina adı
                  <input required maxLength={FACILITY_NAME_MAX_LENGTH} value={buildingDraft.name} onChange={(event) => setBuildingDraft({ ...buildingDraft, name: event.target.value })} className={INPUT_CLASS} />
                </label>
                <label className="block text-sm font-semibold text-[#334155]">Ünvan
                  <input required maxLength={FACILITY_ADDRESS_MAX_LENGTH} value={buildingDraft.address} onChange={(event) => setBuildingDraft({ ...buildingDraft, address: event.target.value })} className={INPUT_CLASS} />
                </label>
                <label className="block text-sm font-semibold text-[#334155]">Şəhər
                  <input required maxLength={FACILITY_CITY_MAX_LENGTH} value={buildingDraft.city} onChange={(event) => setBuildingDraft({ ...buildingDraft, city: event.target.value })} className={INPUT_CLASS} />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="submit" disabled={busy} className={BUTTON_PRIMARY}>{busy ? 'Saxlanılır...' : 'Yadda saxla'}</button>
                  <button type="button" disabled={busy} onClick={() => setBuildingDraft(null)} className={BUTTON_SECONDARY}>Ləğv et</button>
                </div>
              </form>
            ) : null}

            {buildings.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[#D6D3D1] p-6 text-center text-sm text-[#64748B]">Hələ bina əlavə edilməyib.</p>
            ) : (
              <ul className="space-y-3">
                {buildings.map((building) => {
                  const archived = building.archivedAt !== null;
                  return (
                    <li key={building.id} className="rounded-xl border border-[#EAEAEA] p-4">
                      <p className="font-semibold text-[#0F172A]">{building.name}</p>
                      <p className="mt-1 text-xs text-[#64748B]">{building.address} · {building.city}</p>
                      <p className="mt-2 text-xs font-semibold text-[#475569]">{archived ? 'Arxivləşdirilib' : building.isActive ? 'Aktiv' : 'Deaktiv'}</p>
                      {canMutate && !archived ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="button" disabled={busy} onClick={() => setBuildingDraft({ id: building.id, name: building.name, address: building.address, city: building.city })} className={BUTTON_SECONDARY}>Redaktə et</button>
                          <button type="button" disabled={busy} onClick={() => void toggleBuilding(building)} className={BUTTON_SECONDARY}>{building.isActive ? 'Deaktiv et' : 'Aktiv et'}</button>
                          <button type="button" disabled={busy} onClick={() => void archiveBuilding(building)} className={BUTTON_SECONDARY}>Arxivləşdir</button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Rooms */}
          <section aria-labelledby="facility-rooms" className="space-y-3 rounded-2xl border border-[#EAEAEA] bg-white p-4 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="facility-rooms" className="font-serif text-lg font-bold text-[#0F172A]">Otaqlar</h2>
              <button type="button" disabled={busy || buildings.length === 0} onClick={() => setRoomDraft({ id: null, buildingId: buildings[0]?.id ?? '', name: '', capacity: '' })} className={BUTTON_PRIMARY}>Otaq əlavə et</button>
            </div>
            <label className="block text-xs font-semibold text-[#475569]">Bina üzrə filtr
              <select value={roomBuildingFilter} onChange={(event) => setRoomBuildingFilter(event.target.value)} className={INPUT_CLASS}>
                <option value="">Bütün binalar</option>
                {buildings.map((building) => <option key={building.id} value={building.id}>{building.name}</option>)}
              </select>
            </label>

            {roomDraft ? (
              <form onSubmit={submitRoom} className="space-y-3 rounded-xl bg-[#FAFAF7] p-4">
                <label className="block text-sm font-semibold text-[#334155]">Bina
                  <select required value={roomDraft.buildingId} onChange={(event) => setRoomDraft({ ...roomDraft, buildingId: event.target.value })} className={INPUT_CLASS}>
                    {buildings.filter((building) => building.isActive && building.archivedAt === null || building.id === roomDraft.buildingId).map((building) => <option key={building.id} value={building.id}>{building.name}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-semibold text-[#334155]">Otaq adı
                  <input required maxLength={FACILITY_NAME_MAX_LENGTH} value={roomDraft.name} onChange={(event) => setRoomDraft({ ...roomDraft, name: event.target.value })} className={INPUT_CLASS} />
                </label>
                <label className="block text-sm font-semibold text-[#334155]">Otağın yer sayı
                  <input required type="number" inputMode="numeric" min={FACILITY_CAPACITY_MIN} max={FACILITY_CAPACITY_MAX} step={1} value={roomDraft.capacity} onChange={(event) => setRoomDraft({ ...roomDraft, capacity: event.target.value })} className={INPUT_CLASS} />
                  <span className="mt-1 block text-xs font-normal text-[#64748B]">Maksimum şagird sayı: bu otağa yerləşdirilə bilən maksimum şagird sayı.</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="submit" disabled={busy} className={BUTTON_PRIMARY}>{busy ? 'Saxlanılır...' : 'Yadda saxla'}</button>
                  <button type="button" disabled={busy} onClick={() => setRoomDraft(null)} className={BUTTON_SECONDARY}>Ləğv et</button>
                </div>
              </form>
            ) : null}

            {visibleRooms.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[#D6D3D1] p-6 text-center text-sm text-[#64748B]">Otaq yoxdur.</p>
            ) : (
              <ul className="space-y-3">
                {visibleRooms.map((room) => {
                  const archived = room.archivedAt !== null;
                  const active = seatCounts[room.id] ?? 0;
                  const outOfSync = room.isActive && !archived && active !== room.capacity;
                  return (
                    <li key={room.id} className="rounded-xl border border-[#EAEAEA] p-4">
                      <p className="font-semibold text-[#0F172A]">{room.name}</p>
                      <p className="mt-1 text-xs text-[#64748B]">{buildingById.get(room.buildingId)?.name ?? 'Bina məlum deyil'}</p>
                      <p className="mt-2 text-sm text-[#334155]">Otaq tutumu: <strong>{room.capacity}</strong> yer · Aktiv yer: <strong>{active}</strong></p>
                      <p className="mt-1 text-xs font-semibold text-[#475569]">{archived ? 'Arxivləşdirilib' : room.isActive ? 'Aktiv' : 'Deaktiv'}{outOfSync ? ' · Yer inventarı sinxronlaşdırılmalıdır' : ''}</p>
                      {canMutate && !archived ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="button" disabled={busy} onClick={() => setRoomDraft({ id: room.id, buildingId: room.buildingId, name: room.name, capacity: String(room.capacity) })} className={BUTTON_SECONDARY}>Redaktə et</button>
                          <button type="button" disabled={busy || !room.isActive} onClick={() => void syncPlaces(room)} className={BUTTON_SECONDARY}>Yerləri sinxronlaşdır</button>
                          <button type="button" disabled={busy} onClick={() => void toggleRoom(room)} className={BUTTON_SECONDARY}>{room.isActive ? 'Deaktiv et' : 'Aktiv et'}</button>
                          <button type="button" disabled={busy} onClick={() => void archiveRoom(room)} className={BUTTON_SECONDARY}>Arxivləşdir</button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Exam room assignment */}
          <section aria-labelledby="facility-assignments" className="space-y-3 rounded-2xl border border-[#EAEAEA] bg-white p-4 shadow-sm sm:p-6">
            <h2 id="facility-assignments" className="font-serif text-lg font-bold text-[#0F172A]">İmtahan otaqları</h2>
            <label className="block text-xs font-semibold text-[#475569]">İmtahan
              <select value={examId} onChange={(event) => setExamId(event.target.value)} className={INPUT_CLASS}>
                <option value="">İmtahan seçin</option>
                {exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.title}</option>)}
              </select>
            </label>

            {!examId ? (
              <p className="text-sm text-[#64748B]">Otaqları təyin etmək üçün imtahan seçin.</p>
            ) : assignmentsLoading ? (
              <p role="status" className="text-sm text-neutral-500">Təyinatlar yüklənir...</p>
            ) : assignableRooms.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[#D6D3D1] p-6 text-center text-sm text-[#64748B]">Təyin üçün aktiv otaq yoxdur.</p>
            ) : (
              <>
                <ul className="space-y-3">
                  {assignableRooms.map((room) => {
                    const draft = assignmentDraft[room.id] ?? { selected: false, priority: '' };
                    return (
                      <li key={room.id} className="flex flex-wrap items-end gap-3 rounded-xl border border-[#EAEAEA] p-4">
                        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-[#334155]">
                          <input type="checkbox" checked={draft.selected} disabled={busy} onChange={(event) => updateAssignment(room.id, { selected: event.target.checked })} className="h-5 w-5" />
                          {room.name} <span className="font-normal text-[#64748B]">({room.capacity} yer)</span>
                        </label>
                        <label className="text-xs font-semibold text-[#475569]">Prioritet
                          <input type="number" inputMode="numeric" min={FACILITY_PRIORITY_MIN} max={FACILITY_PRIORITY_MAX} step={1} disabled={busy || !draft.selected} value={draft.priority} onChange={(event) => updateAssignment(room.id, { priority: event.target.value })} className="mt-1 block min-h-11 w-28 rounded-xl border border-[#E5E5E0] bg-[#FAFAF7] px-3 text-sm" />
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <button type="button" disabled={busy} onClick={() => void saveAssignments()} className={BUTTON_PRIMARY}>{busy ? 'Saxlanılır...' : 'Təyinatı yadda saxla'}</button>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
