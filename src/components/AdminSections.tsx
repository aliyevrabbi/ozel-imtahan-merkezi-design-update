import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { AppRole } from '../types';
import {
  getAdminDataErrorMessage,
  getDashboardCounts,
  listAdminExams,
  listAuditJournal,
  type AdminExamSummary,
  type AuditEntry,
  type DashboardCounts,
  type ExamStatus,
} from '../services/adminDataService';

export const EXAM_STATUS_LABELS: Readonly<Record<ExamStatus, string>> = {
  draft: 'Qaralama',
  published: 'Dərc olunub',
  closed: 'Qeydiyyat bağlıdır',
  finished: 'Başa çatıb',
  archived: 'Arxivdədir',
};

export const INACTIVE_OPERATION_MESSAGE = 'Bu əməliyyat hələ aktiv deyil. Təhlükəsiz server əməliyyatı (RPC) hazırlanana qədər yalnız oxuma rejimi var.';

interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

// Runs a loader keyed by `key`. The loader is kept in a ref so inline arrows do not retrigger loads.
export function useAdminQuery<T>(key: string, load: () => Promise<T>): AsyncState<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null, error: null, loading: true,
  });
  const [version, setVersion] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    loadRef.current()
      .then((data) => { if (active) setState({ data, error: null, loading: false }); })
      .catch((error: unknown) => {
        if (active) setState({ data: null, error: getAdminDataErrorMessage(error), loading: false });
      });
    return () => { active = false; };
  }, [key, version]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  return { ...state, reload };
}

function StateMessage({ loading, error, empty, onRetry }: { loading: boolean; error: string | null; empty: boolean; onRetry: () => void }) {
  if (loading) return <p role="status" className="py-8 text-center text-sm text-[#64748B]">Məlumat yüklənir...</p>;
  if (error) {
    return (
      <div role="alert" className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        <p>{error}</p>
        <button type="button" onClick={onRetry} className="min-h-11 rounded-xl border border-rose-300 px-4 text-sm font-bold text-rose-900">Yenidən cəhd et</button>
      </div>
    );
  }
  if (empty) return <p role="status" className="rounded-xl border border-dashed border-[#E5E5E0] p-6 text-center text-sm text-[#64748B]">Hələlik məlumat yoxdur.</p>;
  return null;
}

function DisabledAction({ label }: { label: string }) {
  return (
    <button type="button" disabled aria-describedby="admin-inactive-operation" className="min-h-11 rounded-xl border border-[#E5E5E0] bg-[#F1F5F9] px-4 text-sm font-semibold text-[#94A3B8]">
      {label}
    </button>
  );
}

function InactiveNotice() {
  return <p id="admin-inactive-operation" role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{INACTIVE_OPERATION_MESSAGE}</p>;
}

export function DashboardSection({ role }: { role: AppRole }) {
  const { data, error, loading, reload } = useAdminQuery<DashboardCounts>(`dashboard:${role}`, () => getDashboardCounts(role));
  const cards: Array<{ label: string; value: number | undefined }> = [
    { label: 'Aktiv imtahanlar', value: data?.activeExams },
    { label: 'Gözləyən müraciətlər', value: data?.pendingApplications },
    { label: 'Təsdiqlənmiş ödənişlər', value: data?.verifiedPayments },
    { label: 'Yer təyin olunmuş müraciətlər', value: data?.placedApplications },
    { label: 'Yaradılmış biletlər', value: data?.createdTickets },
    { label: 'Aktiv binalar', value: data?.activeBuildings },
    { label: 'Aktiv otaqlar', value: data?.activeRooms },
    { label: 'Ümumi boş yerlər', value: data?.availablePlaces },
  ];
  return (
    <div className="space-y-4">
      <StateMessage loading={loading} error={error} empty={false} onRetry={reload} />
      {data && (
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map((card) => (
            <li key={card.label} className="rounded-2xl border border-[#E5E5E0] bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-[#64748B]">{card.label}</p>
              <p className="mt-2 text-2xl font-bold text-[#0F172A]">{card.value ?? 0}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Yer bölgüsü: read-only exam overview. Exam create/edit/status/archive lives in ExamManagementPanel.
export function ExamsSection({ role }: { role: AppRole }) {
  const { data, error, loading, reload } = useAdminQuery<AdminExamSummary[]>(`exams:${role}`, () => listAdminExams(role));
  const [statusFilter, setStatusFilter] = useState<ExamStatus | ''>('');
  const exams = (data ?? []).filter((exam) => !statusFilter || exam.status === statusFilter);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#475569]">Yer təyinatı hər müraciət üzrə, təsdiqlənmiş ödənişdən sonra <strong>Müraciətlər</strong> bölməsində aparılır.</p>
      <label className="block max-w-xs text-sm font-semibold text-[#334155]">
        Status filtri
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ExamStatus | '')} className="mt-1 min-h-11 w-full rounded-xl border border-[#E5E5E0] bg-white px-3">
          <option value="">Hamısı</option>
          {(Object.keys(EXAM_STATUS_LABELS) as ExamStatus[]).map((status) => (
            <option key={status} value={status}>{EXAM_STATUS_LABELS[status]}</option>
          ))}
        </select>
      </label>
      <StateMessage loading={loading} error={error} empty={!loading && !error && exams.length === 0} onRetry={reload} />
      {exams.length > 0 && (
        <ul className="space-y-3">
          {exams.map((exam) => (
            <li key={exam.id} className="rounded-2xl border border-[#E5E5E0] bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-[#0F172A]">{exam.title}</h3>
                  <p className="text-xs text-[#64748B]">{exam.organizer} · {exam.city} · {exam.examDate} · {exam.startTime.slice(0, 5)}–{exam.endTime.slice(0, 5)}</p>
                </div>
                <span className="rounded-full bg-[#F1F5F9] px-3 py-1 text-xs font-semibold text-[#334155]">{EXAM_STATUS_LABELS[exam.status]}</span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div><dt className="text-[#64748B]">Müraciət</dt><dd className="font-bold">{exam.applicationCount}</dd></div>
                <div><dt className="text-[#64748B]">Ödənişli</dt><dd className="font-bold">{exam.verifiedPaymentCount}</dd></div>
                <div><dt className="text-[#64748B]">Yer təyin olunub</dt><dd className="font-bold">{exam.placedCount}</dd></div>
                <div><dt className="text-[#64748B]">Aktiv bilet</dt><dd className="font-bold">{exam.activeTicketCount}</dd></div>
                <div><dt className="text-[#64748B]">Ümumi tutum</dt><dd className="font-bold">{exam.capacity}</dd></div>
                <div><dt className="text-[#64748B]">Dolu yerlər</dt><dd className="font-bold">{exam.occupied}</dd></div>
                <div><dt className="text-[#64748B]">Boş yerlər</dt><dd className="font-bold">{exam.available}</dd></div>
                <div><dt className="text-[#64748B]">Otaq sayı</dt><dd className="font-bold">{exam.roomCount}</dd></div>
              </dl>
              {exam.roomPriorities.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2 text-xs text-[#334155]">
                  {exam.roomPriorities.map((room) => (
                    <li key={`${room.priority}-${room.roomName}`} className="rounded-lg border border-[#E5E5E0] px-2 py-1">
                      {room.priority}. {room.roomName} · Otağın yer sayı: {room.capacity}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TicketsSection() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#E5E5E0] bg-white p-4 text-sm text-[#334155]">
        <p className="font-semibold">Bilet statusu</p>
        <p className="mt-1">Yer təyin olunmamış və ya bilet yaradılmamış müraciətlər <strong>not_created</strong> statusunda göstərilir.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <DisabledAction label="PDF bilet yarat" />
        <DisabledAction label="QR kod yarat" />
        <DisabledAction label="WhatsApp ilə göndər" />
      </div>
      <InactiveNotice />
    </div>
  );
}

export function AuditSection({ role }: { role: AppRole }) {
  const [page, setPage] = useState(0);
  const { data, error, loading, reload } = useAdminQuery<{ entries: AuditEntry[]; hasNextPage: boolean }>(
    `audit:${role}:${page}`,
    () => listAuditJournal(role, page),
  );
  const entries = data?.entries ?? [];
  return (
    <div className="space-y-4">
      <p className="text-sm text-[#475569]">Yalnız oxuma rejimi. Jurnal dəyişdirilmir və silinmir.</p>
      <StateMessage loading={loading} error={error} empty={!loading && !error && entries.length === 0} onRetry={reload} />
      {entries.length > 0 && (
        <ul className="divide-y divide-[#E5E5E0] rounded-2xl border border-[#E5E5E0] bg-white">
          {entries.map((entry) => (
            <li key={entry.id} className="space-y-1 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-[#0F172A]">{entry.actionLabel}</span>
                <time className="text-xs text-[#64748B]" dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString('az-AZ')}</time>
              </div>
              <p className="text-xs text-[#475569]">{entry.entityLabel}{entry.transition ? ` · ${entry.transition}` : ''} · {entry.actorLabel}</p>
              <p className="font-mono text-[10px] text-[#94A3B8]">{entry.action}</p>
            </li>
          ))}
        </ul>
      )}
      {(page > 0 || data?.hasNextPage) && (
        <div className="flex justify-between gap-3">
          <button type="button" disabled={loading || page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} className="min-h-11 rounded-xl border border-[#E5E5E0] px-4 text-sm font-bold disabled:opacity-50">Əvvəlki</button>
          <button type="button" disabled={loading || !data?.hasNextPage} onClick={() => setPage((value) => value + 1)} className="min-h-11 rounded-xl border border-[#E5E5E0] px-4 text-sm font-bold disabled:opacity-50">Növbəti</button>
        </div>
      )}
    </div>
  );
}

export function SettingsSection() {
  return (
    <div className="space-y-4">
      <p className="rounded-2xl border border-[#E5E5E0] bg-white p-4 text-sm text-[#334155]">Sistem parametrləri hələ bu panelə qoşulmayıb.</p>
      <InactiveNotice />
    </div>
  );
}
