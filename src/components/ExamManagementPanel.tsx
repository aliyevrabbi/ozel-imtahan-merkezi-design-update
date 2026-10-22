import React, { useMemo, useRef, useState } from 'react';
import type { AppRole } from '../types';
import { listAdminExams, type AdminExamSummary, type ExamStatus } from '../services/adminDataService';
import {
  archiveExam,
  canArchiveExam,
  changeExamStatus,
  createExam,
  EXAM_CATEGORIES,
  EXAM_CATEGORY_LABELS,
  getAllowedExamTransitions,
  getExamForEdit,
  toFormInput,
  updateExam,
  type ExamFormInput,
  type ExamResult,
} from '../services/examManagementService';
import { EXAM_STATUS_LABELS, useAdminQuery } from './AdminSections';

export const EXAM_TRANSITION_LABELS: Readonly<Partial<Record<ExamStatus, string>>> = {
  published: 'Dərc et',
  closed: 'Qeydiyyatı bağla',
  finished: 'Başa çatdır',
};

export interface ExamListFilter {
  status: ExamStatus | '';
  query: string;
}

// Pure filter used by the list. Matches title, organizer or city, case-insensitively.
export function filterExamSummaries<T extends Pick<AdminExamSummary, 'status' | 'title' | 'organizer' | 'city'>>(
  exams: readonly T[],
  filter: ExamListFilter,
): T[] {
  const query = filter.query.trim().toLocaleLowerCase('az-AZ');
  return exams.filter((exam) => {
    if (filter.status && exam.status !== filter.status) return false;
    if (!query) return true;
    return [exam.title, exam.organizer, exam.city].some((value) => value.toLocaleLowerCase('az-AZ').includes(query));
  });
}

export function emptyExamForm(): ExamFormInput {
  return {
    title: '',
    category: 'buraxilis',
    organizer: '',
    grades: [],
    subjects: [],
    examDate: '',
    startTime: '',
    endTime: '',
    city: '',
    applicationOpenAt: null,
    applicationDeadline: null,
    priceDescription: null,
    description: null,
  };
}

function splitList(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter((item) => item !== '');
}

// Converts an ISO timestamp to the local "YYYY-MM-DDTHH:mm" value used by datetime-local inputs.
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

interface FormState {
  title: string;
  category: string;
  organizer: string;
  grades: string;
  subjects: string;
  examDate: string;
  startTime: string;
  endTime: string;
  city: string;
  applicationOpenAt: string;
  applicationDeadline: string;
  priceDescription: string;
  description: string;
}

function toFormState(input: ExamFormInput): FormState {
  return {
    title: input.title,
    category: input.category,
    organizer: input.organizer,
    grades: input.grades.join(', '),
    subjects: input.subjects.join(', '),
    examDate: input.examDate,
    startTime: input.startTime,
    endTime: input.endTime,
    city: input.city,
    applicationOpenAt: isoToLocalInput(input.applicationOpenAt),
    applicationDeadline: isoToLocalInput(input.applicationDeadline),
    priceDescription: input.priceDescription ?? '',
    description: input.description ?? '',
  };
}

function fromFormState(state: FormState): ExamFormInput {
  return {
    title: state.title,
    category: state.category,
    organizer: state.organizer,
    grades: splitList(state.grades),
    subjects: splitList(state.subjects),
    examDate: state.examDate,
    startTime: state.startTime,
    endTime: state.endTime,
    city: state.city,
    applicationOpenAt: localInputToIso(state.applicationOpenAt),
    applicationDeadline: localInputToIso(state.applicationDeadline),
    priceDescription: state.priceDescription.trim() ? state.priceDescription : null,
    description: state.description.trim() ? state.description : null,
  };
}

type PanelMode =
  | { kind: 'list' }
  | { kind: 'create' }
  | { kind: 'edit'; examId: string; originalDate: string; initial: FormState | null; loadError: string | null };

const INPUT_CLASS = 'mt-1 min-h-11 w-full rounded-xl border border-[#E5E5E0] bg-white px-3 text-sm';

export function ExamManagementPanel({ role }: { role: AppRole }) {
  const { data, error, loading, reload } = useAdminQuery<AdminExamSummary[]>(`exams:${role}`, () => listAdminExams(role));
  const [filter, setFilter] = useState<ExamListFilter>({ status: '', query: '' });
  const [mode, setMode] = useState<PanelMode>({ kind: 'list' });
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<ExamResult | null>(null);
  const inFlight = useRef(false);
  const exams = useMemo(() => filterExamSummaries(data ?? [], filter), [data, filter]);

  // Shared runner for all mutations: the ref blocks duplicate clicks even within one render tick,
  // then the fixed message is shown and the list is refreshed.
  async function runAction(key: string, action: () => Promise<ExamResult>, onSuccess?: () => void) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusyId(key);
    setNotice(null);
    try {
      const result = await action();
      setNotice(result);
      if (result.success) {
        onSuccess?.();
        reload();
      }
    } finally {
      inFlight.current = false;
      setBusyId(null);
    }
  }

  async function openEdit(examId: string) {
    setNotice(null);
    setMode({ kind: 'edit', examId, originalDate: '', initial: null, loadError: null });
    try {
      const record = await getExamForEdit(role, examId);
      setMode({ kind: 'edit', examId, originalDate: record.examDate, initial: toFormState(toFormInput(record)), loadError: null });
    } catch {
      setMode({ kind: 'edit', examId, originalDate: '', initial: null, loadError: 'İmtahan məlumatı yüklənə bilmədi.' });
    }
  }

  return (
    <div className="space-y-4">
      {mode.kind === 'list' && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => { setNotice(null); setMode({ kind: 'create' }); }} className="min-h-11 rounded-xl bg-[#0F172A] px-4 text-sm font-bold text-white">Yeni imtahan</button>
        </div>
      )}

      {notice && (
        <p role="status" className={`rounded-xl border p-3 text-sm ${notice.success ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
          {notice.message}
        </p>
      )}

      {mode.kind === 'create' && (
        <ExamForm
          title="Yeni imtahan"
          submitLabel="Yadda saxla"
          initial={toFormState(emptyExamForm())}
          busy={busyId !== null}
          onCancel={() => setMode({ kind: 'list' })}
          onSubmit={(input) => runAction('create', () => createExam(role, input), () => setMode({ kind: 'list' }))}
        />
      )}

      {mode.kind === 'edit' && (
        mode.loadError ? (
          <div role="alert" className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <p>{mode.loadError}</p>
            <button type="button" onClick={() => setMode({ kind: 'list' })} className="min-h-11 rounded-xl border border-rose-300 px-4 font-bold">Geri</button>
          </div>
        ) : mode.initial === null ? (
          <p role="status" className="py-6 text-center text-sm text-[#64748B]">Form yüklənir...</p>
        ) : (
          <ExamForm
            title="İmtahanı redaktə et"
            submitLabel="Dəyişiklikləri yadda saxla"
            initial={mode.initial}
            busy={busyId !== null}
            onCancel={() => setMode({ kind: 'list' })}
            onSubmit={(input) => runAction(
              'edit',
              () => updateExam(role, mode.examId, input, input.examDate !== mode.originalDate),
              () => setMode({ kind: 'list' }),
            )}
          />
        )
      )}

      {mode.kind === 'list' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-[#334155]">
              Axtarış
              <input
                type="search"
                value={filter.query}
                onChange={(event) => setFilter((current) => ({ ...current, query: event.target.value }))}
                placeholder="Ad, təşkilatçı və ya şəhər"
                className={INPUT_CLASS}
              />
            </label>
            <label className="block text-sm font-semibold text-[#334155]">
              Status filtri
              <select
                value={filter.status}
                onChange={(event) => setFilter((current) => ({ ...current, status: event.target.value as ExamStatus | '' }))}
                className={INPUT_CLASS}
              >
                <option value="">Hamısı</option>
                {(Object.keys(EXAM_STATUS_LABELS) as ExamStatus[]).map((status) => (
                  <option key={status} value={status}>{EXAM_STATUS_LABELS[status]}</option>
                ))}
              </select>
            </label>
          </div>

          {loading && <p role="status" className="py-8 text-center text-sm text-[#64748B]">Məlumat yüklənir...</p>}
          {error && (
            <div role="alert" className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <p>{error}</p>
              <button type="button" onClick={reload} className="min-h-11 rounded-xl border border-rose-300 px-4 font-bold">Yenidən cəhd et</button>
            </div>
          )}
          {!loading && !error && exams.length === 0 && (
            <p role="status" className="rounded-xl border border-dashed border-[#E5E5E0] p-6 text-center text-sm text-[#64748B]">
              {(data?.length ?? 0) === 0 ? 'Hələlik imtahan yoxdur.' : 'Filtrə uyğun imtahan tapılmadı.'}
            </p>
          )}

          <ul className="space-y-3">
            {exams.map((exam) => {
              const allowed = getAllowedExamTransitions(exam.status).filter((status) => status !== 'archived');
              const busy = busyId !== null;
              return (
                <li key={exam.id} className="space-y-3 rounded-2xl border border-[#E5E5E0] bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="break-words font-bold text-[#0F172A]">{exam.title}</h3>
                      <p className="text-xs text-[#64748B]">
                        {EXAM_CATEGORY_LABELS[exam.category as keyof typeof EXAM_CATEGORY_LABELS] ?? exam.category} · {exam.organizer} · {exam.city} · {exam.examDate} · {exam.startTime.slice(0, 5)}–{exam.endTime.slice(0, 5)}
                      </p>
                    </div>
                    <span className="rounded-full bg-[#F1F5F9] px-3 py-1 text-xs font-semibold text-[#334155]">{EXAM_STATUS_LABELS[exam.status]}</span>
                  </div>

                  <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <div><dt className="text-[#64748B]">Müraciət</dt><dd className="font-bold">{exam.applicationCount}</dd></div>
                    <div><dt className="text-[#64748B]">Təsdiqlənmiş ödənişlər</dt><dd className="font-bold">{exam.verifiedPaymentCount}</dd></div>
                    <div><dt className="text-[#64748B]">Təyin olunmuş yerlər</dt><dd className="font-bold">{exam.placedCount}</dd></div>
                    <div><dt className="text-[#64748B]">Aktiv bilet</dt><dd className="font-bold">{exam.activeTicketCount}</dd></div>
                    <div><dt className="text-[#64748B]">Ümumi tutum</dt><dd className="font-bold">{exam.capacity}</dd></div>
                    <div><dt className="text-[#64748B]">Dolu yerlər</dt><dd className="font-bold">{exam.occupied}</dd></div>
                    <div><dt className="text-[#64748B]">Boş yerlər</dt><dd className="font-bold">{exam.available}</dd></div>
                    <div><dt className="text-[#64748B]">Müraciət müddəti</dt><dd className="font-bold">{exam.applicationDeadline ? new Date(exam.applicationDeadline).toLocaleDateString('az-AZ') : '—'}</dd></div>
                  </dl>

                  <div>
                    <p className="text-xs font-semibold text-[#334155]">Otaqlar və yerlər</p>
                    {exam.roomPriorities.length === 0 ? (
                      <p className="text-xs text-[#64748B]">Bu imtahana otaq təyin olunmayıb. Otaqlar “Binalar və otaqlar” bölməsindən təyin olunur.</p>
                    ) : (
                      <ul className="mt-1 flex flex-wrap gap-2 text-xs text-[#334155]">
                        {exam.roomPriorities.map((room) => (
                          <li key={`${room.priority}-${room.roomName}`} className="rounded-lg border border-[#E5E5E0] px-2 py-1">
                            {room.priority}. {room.roomName} · Otağın yer sayı: {room.capacity}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={busy} onClick={() => openEdit(exam.id)} className="min-h-11 rounded-xl border border-[#E5E5E0] px-4 text-sm font-bold text-[#0F172A] disabled:opacity-50">İmtahanı redaktə et</button>
                    {allowed.length > 0 ? <p className="w-full text-xs font-semibold text-[#334155]">Statusu dəyiş</p> : null}
                    {allowed.map((status) => (
                      <button
                        key={status}
                        type="button"
                        disabled={busy}
                        onClick={() => runAction(`status:${exam.id}`, () => changeExamStatus(role, exam.id, exam.status, status))}
                        className="min-h-11 rounded-xl bg-[#F1F5F9] px-4 text-sm font-bold text-[#0F172A] disabled:opacity-50"
                      >
                        {EXAM_TRANSITION_LABELS[status] ?? EXAM_STATUS_LABELS[status]}
                      </button>
                    ))}
                    {canArchiveExam(exam.status) && confirmArchiveId !== exam.id && (
                      <button type="button" disabled={busy} onClick={() => setConfirmArchiveId(exam.id)} className="min-h-11 rounded-xl border border-rose-200 px-4 text-sm font-bold text-rose-800 disabled:opacity-50">Arxivlə</button>
                    )}
                  </div>

                  {confirmArchiveId === exam.id && (
                    <div role="alertdialog" aria-label="Arxivləmə təsdiqi" className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                      <p>Bu imtahan arxivləşdiriləcək. Müraciətlər, ödənişlər və yerlər silinmir, yalnız imtahan arxiv statusuna keçir.</p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => runAction(`archive:${exam.id}`, () => archiveExam(role, exam.id), () => setConfirmArchiveId(null))}
                          className="min-h-11 rounded-xl bg-rose-700 px-4 font-bold text-white disabled:opacity-50"
                        >
                          Bəli, arxivlə
                        </button>
                        <button type="button" disabled={busy} onClick={() => setConfirmArchiveId(null)} className="min-h-11 rounded-xl border border-rose-300 px-4 font-bold disabled:opacity-50">Ləğv et</button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function ExamForm({
  title,
  submitLabel,
  initial,
  busy,
  onCancel,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  initial: FormState;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: ExamFormInput) => void;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [localError, setLocalError] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setLocalError(null);
    const input = fromFormState(form);
    if (!input.title.trim() || !input.examDate || !input.startTime || !input.endTime) {
      setLocalError('Zəruri sahələri doldurun.');
      return;
    }
    onSubmit(input);
  }

  return (
    <form onSubmit={submit} aria-label={title} className="space-y-4 rounded-2xl border border-[#E5E5E0] bg-white p-4 shadow-sm">
      <h3 className="text-base font-bold text-[#0F172A]">{title}</h3>
      {localError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{localError}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-[#334155]">Ad<input required value={form.title} onChange={(e) => update('title', e.target.value)} className={INPUT_CLASS} /></label>
        <label className="block text-sm font-semibold text-[#334155]">Kateqoriya
          <select value={form.category} onChange={(e) => update('category', e.target.value)} className={INPUT_CLASS}>
            {EXAM_CATEGORIES.map((category) => <option key={category} value={category}>{EXAM_CATEGORY_LABELS[category]}</option>)}
          </select>
        </label>
        <label className="block text-sm font-semibold text-[#334155]">Təşkilatçı<input required value={form.organizer} onChange={(e) => update('organizer', e.target.value)} className={INPUT_CLASS} /></label>
        <label className="block text-sm font-semibold text-[#334155]">Şəhər<input required value={form.city} onChange={(e) => update('city', e.target.value)} className={INPUT_CLASS} /></label>
        <label className="block text-sm font-semibold text-[#334155]">Siniflər (vergüllə)<input required value={form.grades} onChange={(e) => update('grades', e.target.value)} className={INPUT_CLASS} /></label>
        <label className="block text-sm font-semibold text-[#334155]">Fənnlər (vergüllə)<input required value={form.subjects} onChange={(e) => update('subjects', e.target.value)} className={INPUT_CLASS} /></label>
        <label className="block text-sm font-semibold text-[#334155]">İmtahan tarixi<input required type="date" value={form.examDate} onChange={(e) => update('examDate', e.target.value)} className={INPUT_CLASS} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold text-[#334155]">Başlama<input required type="time" value={form.startTime} onChange={(e) => update('startTime', e.target.value)} className={INPUT_CLASS} /></label>
          <label className="block text-sm font-semibold text-[#334155]">Bitmə<input required type="time" value={form.endTime} onChange={(e) => update('endTime', e.target.value)} className={INPUT_CLASS} /></label>
        </div>
        <label className="block text-sm font-semibold text-[#334155]">Müraciət açılışı<input type="datetime-local" value={form.applicationOpenAt} onChange={(e) => update('applicationOpenAt', e.target.value)} className={INPUT_CLASS} /></label>
        <label className="block text-sm font-semibold text-[#334155]">Müraciət müddəti (son)<input type="datetime-local" value={form.applicationDeadline} onChange={(e) => update('applicationDeadline', e.target.value)} className={INPUT_CLASS} /></label>
        <label className="block text-sm font-semibold text-[#334155] sm:col-span-2">Qiymət məlumatı<input value={form.priceDescription} onChange={(e) => update('priceDescription', e.target.value)} className={INPUT_CLASS} /></label>
        <label className="block text-sm font-semibold text-[#334155] sm:col-span-2">Təsvir<textarea rows={3} value={form.description} onChange={(e) => update('description', e.target.value)} className="mt-1 w-full rounded-xl border border-[#E5E5E0] bg-white p-3 text-sm" /></label>
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-[#0F172A] px-4 text-sm font-bold text-white disabled:opacity-50">{submitLabel}</button>
        <button type="button" onClick={onCancel} disabled={busy} className="min-h-11 rounded-xl border border-[#E5E5E0] px-4 text-sm font-bold disabled:opacity-50">Ləğv et</button>
      </div>
    </form>
  );
}
