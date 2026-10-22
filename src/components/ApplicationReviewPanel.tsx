import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Search, ShieldAlert } from 'lucide-react';
import type { ApplicationStatus, AppRole, PaymentStatus, TicketStatus } from '../types';
import { canAllocatePlace, canIssueTicket } from '../admin/adminNavigation';
import {
  buildTicketQrPayload,
  getConfiguredTicketOrigin,
  getTicketIssueMessage,
  getTicketServiceErrorMessage,
  issueApplicationTicket,
  TICKET_ORIGIN_NOT_CONFIGURED_MESSAGE,
} from '../services/ticketService';
import type { TicketIssueCode } from '../services/ticketService';
import { buildTicketQrDataUrl, downloadIssuedTicketPdf } from '../services/ticketPdf';
import { prepareTicketWhatsAppLink, WHATSAPP_MANUAL_SEND_NOTICE } from '../services/ticketWhatsApp';
import { getAdminDataErrorMessage, getAssignedPlaceDisplay, type AssignedPlaceDisplay } from '../services/adminDataService';
import {
  allocateApplicationPlace,
  confirmApplicationPayment,
  getApplicationReviewErrorMessage,
  getPlaceAllocationMessage,
  getApplicationReviewDetail,
  getPaymentConfirmationErrorMessage,
  getPaymentConfirmationMessage,
  getPaymentPanelState,
  getPaymentPanelText,
  listApplicationReviewPage,
  listReviewExamOptions,
} from '../services/applicationReviewService';
import type {
  ApplicationReviewDetail,
  ApplicationReviewFilters,
  ApplicationReviewItem,
} from '../services/applicationReviewService';

interface ApplicationReviewPanelProps {
  area: 'admin' | 'operator';
  role: AppRole;
}

const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: 'Gözləyir',
  under_review: 'Baxışdadır',
  confirmed: 'Təsdiqlənib',
  rejected: 'Rədd edilib',
  cancelled: 'Ləğv edilib',
  attended: 'İştirak edib',
};

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  not_submitted: 'Təqdim edilməyib',
  receipt_received: 'Qəbz alınıb',
  verified: 'Yoxlanılıb',
  rejected: 'Rədd edilib',
};

const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  not_created: 'Yaradılmayıb',
  active: 'Aktiv',
  revoked: 'Ləğv edilib',
};

const APPLICATION_STATUSES = Object.keys(APPLICATION_STATUS_LABELS) as ApplicationStatus[];
const PAYMENT_STATUSES = Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[];
const TICKET_STATUSES = Object.keys(TICKET_STATUS_LABELS) as TicketStatus[];

function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Tarix məlum deyil' : new Intl.DateTimeFormat('az-AZ', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}

export function ApplicationReviewPanel({ area, role }: ApplicationReviewPanelProps) {
  const isAdmin = role === 'admin' || role === 'super_admin';
  const [exams, setExams] = useState<Array<{ id: string; title: string }>>([]);
  const [examsLoading, setExamsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<ApplicationReviewFilters>({ sortDirection: 'desc' });
  const [items, setItems] = useState<ApplicationReviewItem[]>([]);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRegistration, setSelectedRegistration] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApplicationReviewDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const paymentInFlight = useRef(false);
  const [allocateConfirmOpen, setAllocateConfirmOpen] = useState(false);
  const [allocating, setAllocating] = useState(false);
  const [allocationMessage, setAllocationMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [placeDisplay, setPlaceDisplay] = useState<AssignedPlaceDisplay | null>(null);
  const [placeLoading, setPlaceLoading] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const allocationInFlight = useRef(false);
  const [ticketConfirmOpen, setTicketConfirmOpen] = useState(false);
  const [ticketIssuing, setTicketIssuing] = useState(false);
  const [ticketMessage, setTicketMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // Shown only in this session after a successful issuance. Never stored in browser storage or logged.
  const [issuedTicketUrl, setIssuedTicketUrl] = useState<string | null>(null);
  const ticketInFlight = useRef(false);

  useEffect(() => {
    let active = true;
    void listReviewExamOptions(role).then((loaded) => {
      if (active) setExams(loaded);
    }).catch(() => {
      if (active) setExams([]);
    }).finally(() => {
      if (active) setExamsLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      setItems([]);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    void listApplicationReviewPage(role, page, filters).then((result) => {
      if (!active) return;
      setItems(result.items);
      setHasNextPage(result.hasNextPage);
    }).catch((loadError: unknown) => {
      if (!active) return;
      setItems([]);
      setHasNextPage(false);
      setError(getApplicationReviewErrorMessage(loadError));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [filters, isAdmin, page, refreshKey, role]);

  useEffect(() => {
    if (!selectedRegistration || !isAdmin) {
      setDetail(null);
      return;
    }
    let active = true;
    setDetailLoading(true);
    setDetailError(null);
    setIssuedTicketUrl(null);
    void getApplicationReviewDetail(role, selectedRegistration).then((loaded) => {
      if (active) setDetail(loaded);
    }).catch((loadError: unknown) => {
      if (!active) return;
      setDetail(null);
      setDetailError(getApplicationReviewErrorMessage(loadError));
    }).finally(() => {
      if (active) setDetailLoading(false);
    });
    return () => { active = false; };
  }, [isAdmin, refreshKey, role, selectedRegistration]);

  useEffect(() => {
    if (!selectedRegistration || !isAdmin || !detail || !detail.assignedSeatId) {
      setPlaceDisplay(null);
      setPlaceError(null);
      return;
    }
    let active = true;
    setPlaceLoading(true);
    setPlaceError(null);
    void getAssignedPlaceDisplay(role, detail.applicationId).then((loaded) => {
      if (active) setPlaceDisplay(loaded);
    }).catch((loadError: unknown) => {
      if (!active) return;
      setPlaceDisplay(null);
      setPlaceError(getAdminDataErrorMessage(loadError));
    }).finally(() => {
      if (active) setPlaceLoading(false);
    });
    return () => { active = false; };
  }, [detail?.applicationId, detail?.assignedSeatId, isAdmin, refreshKey, role, selectedRegistration]);

  const closeDetail = () => {
    setSelectedRegistration(null);
    setConfirmOpen(false);
    setPaymentMessage(null);
    setAllocateConfirmOpen(false);
    setAllocationMessage(null);
    setPlaceDisplay(null);
    setTicketConfirmOpen(false);
    setTicketMessage(null);
    setIssuedTicketUrl(null);
  };

  // Admin-only. Server RPC re-checks role, payment, place, exam status and active-ticket idempotency.
  const handleIssueTicket = async () => {
    if (ticketInFlight.current || !detail) return;
    // Checked before the RPC: an opaque token must never be created when its production link cannot be shown.
    const ticketOrigin = getConfiguredTicketOrigin();
    if (!ticketOrigin) {
      setTicketConfirmOpen(false);
      setTicketMessage({ type: 'error', text: TICKET_ORIGIN_NOT_CONFIGURED_MESSAGE });
      return;
    }
    ticketInFlight.current = true;
    setTicketIssuing(true);
    setTicketMessage(null);
    try {
      const result = await issueApplicationTicket(role, detail.applicationId);
      if (result.code === 'issued') {
        setIssuedTicketUrl(buildTicketQrPayload(ticketOrigin, result.ticketLink));
      }
      setTicketMessage({
        type: result.success ? 'success' : 'error',
        text: getTicketIssueMessage(result.code as TicketIssueCode),
      });
      setRefreshKey((current) => current + 1);
    } catch (issueError: unknown) {
      setTicketMessage({ type: 'error', text: getTicketServiceErrorMessage(issueError) });
    } finally {
      ticketInFlight.current = false;
      setTicketIssuing(false);
      setTicketConfirmOpen(false);
    }
  };

  // Admin-only. Server RPC re-checks role, payment, status, ticket and exam rules.
  const handleAllocate = async () => {
    if (allocationInFlight.current || !detail) return;
    allocationInFlight.current = true;
    setAllocating(true);
    setAllocationMessage(null);
    try {
      const result = await allocateApplicationPlace(role, detail.applicationId);
      setAllocationMessage({
        type: result.success ? 'success' : 'error',
        text: getPlaceAllocationMessage(result.code),
      });
      setRefreshKey((current) => current + 1);
    } catch (allocError: unknown) {
      setAllocationMessage({ type: 'error', text: getApplicationReviewErrorMessage(allocError) });
    } finally {
      allocationInFlight.current = false;
      setAllocating(false);
      setAllocateConfirmOpen(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (paymentInFlight.current || !detail) return;
    paymentInFlight.current = true;
    setPaymentSaving(true);
    setPaymentMessage(null);
    try {
      const result = await confirmApplicationPayment(role, detail.applicationId);
      setPaymentMessage({
        type: result.success ? 'success' : 'error',
        text: getPaymentConfirmationMessage(result.code),
      });
      setRefreshKey((current) => current + 1);
    } catch (confirmError: unknown) {
      setPaymentMessage({ type: 'error', text: getPaymentConfirmationErrorMessage(confirmError) });
    } finally {
      paymentInFlight.current = false;
      setPaymentSaving(false);
      setConfirmOpen(false);
    }
  };

  const updateFilter = <K extends keyof ApplicationReviewFilters>(key: K, value: ApplicationReviewFilters[K]) => {
    setPage(0);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="font-manrope">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="rounded-2xl border border-[#EAEAEA] bg-white p-4 shadow-sm sm:p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-[#D97706]">Özəl İmtahan Mərkəzi · {area === 'admin' ? 'Admin' : 'Operator'}</p>
          <h1 className="mt-1 font-serif text-xl font-bold text-[#0F172A] sm:text-2xl">Müraciətlər</h1>
          <p className="mt-1 text-xs text-[#64748B]">Qeydiyyat, ödəniş və yer təyinatı · {role}</p>
        </header>

        {!isAdmin ? (
          <section role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
            <div className="flex items-start gap-3"><ShieldAlert className="h-5 w-5 shrink-0" /><p><strong>Oxuma icazəsi yoxdur.</strong> Hazırkı verilənlər bazası RLS qaydası müraciətləri yalnız admin və super_admin rollarına göstərir. Operator/scanner oxuma icazəsi üçün RLS dəyişikliyi tələb olunur; bu mərhələdə heç bir keçid edilmir.</p></div>
          </section>
        ) : selectedRegistration ? (
          <section className="space-y-4 rounded-2xl border border-[#EAEAEA] bg-white p-4 shadow-sm sm:p-6">
            <button type="button" onClick={closeDetail} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-[#334155] hover:bg-neutral-50"><ArrowLeft className="h-4 w-4" /> Siyahıya qayıt</button>
            {detailLoading ? <p role="status" className="animate-pulse rounded-xl bg-neutral-100 p-6 text-sm text-neutral-500">Müraciət məlumatları yüklənir...</p>
              : detailError ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{detailError}</p>
                : detail ? (
                  <>
                    {paymentMessage ? <p role={paymentMessage.type === 'error' ? 'alert' : 'status'} className={paymentMessage.type === 'error' ? 'rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800' : 'rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900'}>{paymentMessage.text}</p> : null}
                    <ApplicationDetail
                      detail={detail}
                      confirmOpen={confirmOpen}
                      saving={paymentSaving}
                      onRequestConfirm={() => { setPaymentMessage(null); setConfirmOpen(true); }}
                      onCancelConfirm={() => setConfirmOpen(false)}
                      onConfirm={() => { void handleConfirmPayment(); }}
                    />
                    <PlaceAllocationPanel
                      detail={detail}
                      role={role}
                      placeDisplay={placeDisplay}
                      placeLoading={placeLoading}
                      placeError={placeError}
                      allocating={allocating}
                      confirmOpen={allocateConfirmOpen}
                      message={allocationMessage}
                      onRequestConfirm={() => { setAllocationMessage(null); setAllocateConfirmOpen(true); }}
                      onCancelConfirm={() => setAllocateConfirmOpen(false)}
                      onConfirm={() => { void handleAllocate(); }}
                    />
                    <TicketIssuancePanel
                      detail={detail}
                      role={role}
                      issuing={ticketIssuing}
                      confirmOpen={ticketConfirmOpen}
                      message={ticketMessage}
                      issuedUrl={issuedTicketUrl}
                      onRequestConfirm={() => { setTicketMessage(null); setTicketConfirmOpen(true); }}
                      onCancelConfirm={() => setTicketConfirmOpen(false)}
                      onConfirm={() => { void handleIssueTicket(); }}
                    />
                  </>
                ) : <p className="text-sm text-neutral-600">Müraciət seçilməyib.</p>}
          </section>
        ) : (
          <>
            <section aria-label="Müraciət filtrləri" className="grid grid-cols-1 gap-3 rounded-2xl border border-[#EAEAEA] bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
              <label className="text-xs font-semibold text-[#475569]">Qeydiyyat nömrəsi
                <span className="mt-1 flex items-center rounded-xl border border-[#E5E5E0] bg-[#FAFAF7] px-3"><Search className="h-4 w-4 text-neutral-400" /><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') updateFilter('registrationSearch', searchDraft); }} placeholder="Axtar..." className="min-h-11 w-full bg-transparent px-2 text-sm text-[#0F172A] outline-none" /></span>
              </label>
              <button type="button" onClick={() => updateFilter('registrationSearch', searchDraft)} className="min-h-11 self-end rounded-xl bg-[#0F172A] px-4 text-sm font-bold text-white hover:bg-[#1E293B]">Axtar</button>
              <label className="text-xs font-semibold text-[#475569]">İmtahan
                <select disabled={examsLoading} value={filters.examId ?? ''} onChange={(event) => updateFilter('examId', event.target.value || undefined)} className="mt-1 min-h-11 w-full rounded-xl border border-[#E5E5E0] bg-[#FAFAF7] px-3 text-sm">
                  <option value="">Bütün imtahanlar</option>{exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.title}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-[#475569]">Müraciət statusu
                <select value={filters.applicationStatus ?? ''} onChange={(event) => updateFilter('applicationStatus', (event.target.value || '') as ApplicationStatus | '')} className="mt-1 min-h-11 w-full rounded-xl border border-[#E5E5E0] bg-[#FAFAF7] px-3 text-sm">
                  <option value="">Bütün statuslar</option>{APPLICATION_STATUSES.map((status) => <option key={status} value={status}>{APPLICATION_STATUS_LABELS[status]}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-[#475569]">Ödəniş statusu
                <select value={filters.paymentStatus ?? ''} onChange={(event) => updateFilter('paymentStatus', (event.target.value || '') as PaymentStatus | '')} className="mt-1 min-h-11 w-full rounded-xl border border-[#E5E5E0] bg-[#FAFAF7] px-3 text-sm">
                  <option value="">Bütün ödəniş statusları</option>{PAYMENT_STATUSES.map((status) => <option key={status} value={status}>{PAYMENT_STATUS_LABELS[status]}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-[#475569]">Bilet statusu
                <select value={filters.ticketStatus ?? ''} onChange={(event) => updateFilter('ticketStatus', (event.target.value || '') as TicketStatus | '')} className="mt-1 min-h-11 w-full rounded-xl border border-[#E5E5E0] bg-[#FAFAF7] px-3 text-sm">
                  <option value="">Bütün bilet statusları</option>{TICKET_STATUSES.map((status) => <option key={status} value={status}>{TICKET_STATUS_LABELS[status]}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-[#475569]">Tarix sırası
                <select value={filters.sortDirection ?? 'desc'} onChange={(event) => updateFilter('sortDirection', event.target.value as 'asc' | 'desc')} className="mt-1 min-h-11 w-full rounded-xl border border-[#E5E5E0] bg-[#FAFAF7] px-3 text-sm">
                  <option value="desc">Ən yenilər əvvəl</option><option value="asc">Ən köhnələr əvvəl</option>
                </select>
              </label>
            </section>

            {loading ? <ReviewListSkeleton /> : error ? (
              <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">{error}</div>
            ) : items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#D6D3D1] bg-white p-8 text-center text-sm text-[#64748B]">Bu meyarlara uyğun müraciət yoxdur.</div>
            ) : (
              <section aria-label="Müraciət siyahısı" className="space-y-3">
                {items.map((item) => <ApplicationCard key={item.registrationNumber} item={item} onOpen={() => { setPaymentMessage(null); setConfirmOpen(false); setSelectedRegistration(item.registrationNumber); }} />)}
              </section>
            )}
            <nav aria-label="Səhifələmə" className="flex items-center justify-between rounded-2xl border border-[#EAEAEA] bg-white p-3">
              <button type="button" disabled={page === 0 || loading} onClick={() => setPage((current) => Math.max(0, current - 1))} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#E5E5E0] px-3 text-sm font-semibold disabled:opacity-40"><ArrowLeft className="h-4 w-4" /> Əvvəlki</button>
              <span className="text-sm text-[#64748B]">Səhifə {page + 1}</span>
              <button type="button" disabled={!hasNextPage || loading} onClick={() => setPage((current) => current + 1)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#E5E5E0] px-3 text-sm font-semibold disabled:opacity-40">Növbəti <ArrowRight className="h-4 w-4" /></button>
            </nav>
          </>
        )}
      </div>
    </div>
  );
}

function ApplicationCard({ item, onOpen }: { item: ApplicationReviewItem; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} className="w-full rounded-2xl border border-[#EAEAEA] bg-white p-4 text-left shadow-sm transition hover:border-[#CBD5E1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] sm:p-5">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-sm font-bold text-[#0F172A]">{item.registrationNumber}</p><p className="mt-1 truncate text-sm font-semibold text-[#334155]">{item.studentName} {item.studentSurname}</p><p className="mt-1 truncate text-xs text-[#64748B]">{item.examTitle} · {item.grade}-ci sinif</p></div><ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[#64748B]" /></div>
    <div className="mt-3 flex flex-wrap gap-2 text-[11px]"><StatusBadge>{APPLICATION_STATUS_LABELS[item.applicationStatus]}</StatusBadge><StatusBadge>{PAYMENT_STATUS_LABELS[item.paymentStatus]}</StatusBadge><StatusBadge>{TICKET_STATUS_LABELS[item.ticketStatus]}</StatusBadge></div>
    <p className="mt-3 text-xs text-[#64748B]">{formatDate(item.createdAt)}</p>
  </button>;
}

function StatusBadge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-[#EAEAEA] bg-[#FAFAF7] px-2.5 py-1 font-semibold text-[#475569]">{children}</span>;
}

interface ApplicationDetailProps {
  detail: ApplicationReviewDetail;
  confirmOpen: boolean;
  saving: boolean;
  onRequestConfirm: () => void;
  onCancelConfirm: () => void;
  onConfirm: () => void;
}

function ApplicationDetail({ detail, confirmOpen, saving, onRequestConfirm, onCancelConfirm, onConfirm }: ApplicationDetailProps) {
  const paymentState = getPaymentPanelState(detail.paymentStatus, detail.applicationStatus);
  const canConfirmPayment = paymentState === 'confirmable';
  const rows: Array<[string, string]> = [
    ['Qeydiyyat nömrəsi', detail.registrationNumber],
    ['İmtahan', detail.examTitle],
    ['Ad', detail.studentName],
    ['Soyad', detail.studentSurname],
    ['Ata adı', detail.studentFatherName || '—'],
    ['Sinif', `${detail.grade}-ci sinif`],
    ['Məktəb', detail.school || '—'],
    ['Mobil əlaqə', detail.studentPhone],
    ['Müraciət statusu', APPLICATION_STATUS_LABELS[detail.applicationStatus]],
    ['Ödəniş statusu', PAYMENT_STATUS_LABELS[detail.paymentStatus]],
    ['Bilet statusu', TICKET_STATUS_LABELS[detail.ticketStatus]],
    ['Yaradılma tarixi', formatDate(detail.createdAt)],
  ];
  return <div className="space-y-5"><header><h2 className="font-serif text-xl font-bold text-[#0F172A]">Müraciət məlumatları</h2><p className="mt-1 text-xs text-[#64748B]">Ödəniş təsdiqi yalnız admin və super admin üçündür</p></header><dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">{rows.map(([label, value]) => <div key={label} className="rounded-xl bg-[#FAFAF7] p-3"><dt className="text-xs font-semibold text-[#64748B]">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-[#0F172A]">{value}</dd></div>)}</dl><section aria-label="Ödəniş təsdiqi" className={paymentState === 'verified' ? 'space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900' : 'space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950'}><p>{getPaymentPanelText(paymentState)}</p>{paymentState === 'verified' ? null : <button type="button" disabled={!canConfirmPayment || saving || confirmOpen} onClick={onRequestConfirm} className="min-h-11 rounded-xl bg-[#0F172A] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Ödənişi təsdiqlə</button>}{confirmOpen ? <div role="alertdialog" aria-modal="true" aria-labelledby="payment-confirm-title" className="space-y-3 rounded-xl border border-[#0F172A]/20 bg-white p-4 text-[#0F172A]"><h3 id="payment-confirm-title" className="font-bold">Ödənişi təsdiqləmək istəyirsiniz?</h3><p className="text-xs text-[#64748B]">Ödəniş “Təsdiqlənib” statusuna keçəcək. Bu əməliyyat geri alına bilməz.</p><div className="flex flex-wrap gap-2"><button type="button" onClick={onCancelConfirm} disabled={saving} className="min-h-11 rounded-xl border border-[#0F172A]/20 px-4 text-sm font-semibold disabled:opacity-40">Ləğv et</button><button type="button" onClick={onConfirm} disabled={saving} className="min-h-11 rounded-xl bg-[#0F172A] px-4 text-sm font-bold text-white disabled:opacity-40">{saving ? 'Təsdiq edilir...' : 'Bəli, təsdiqlə'}</button></div></div> : null}{saving ? <p role="status" className="text-xs text-[#64748B]">Ödəniş təsdiqlənir...</p> : null}</section></div>;
}

interface PlaceAllocationPanelProps {
  detail: ApplicationReviewDetail;
  role: AppRole;
  placeDisplay: AssignedPlaceDisplay | null;
  placeLoading: boolean;
  placeError: string | null;
  allocating: boolean;
  confirmOpen: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
  onRequestConfirm: () => void;
  onCancelConfirm: () => void;
  onConfirm: () => void;
}

function PlaceAllocationPanel({ detail, role, placeDisplay, placeLoading, placeError, allocating, confirmOpen, message, onRequestConfirm, onCancelConfirm, onConfirm }: PlaceAllocationPanelProps) {
  const assigned = detail.assignedSeatId !== null;
  const allocatable = canAllocatePlace(role, {
    paymentStatus: detail.paymentStatus,
    applicationStatus: detail.applicationStatus,
    ticketStatus: detail.ticketStatus,
    assignedSeatId: detail.assignedSeatId,
  });
  const placeRows: Array<[string, string]> = placeDisplay ? [
    ['Bina', placeDisplay.buildingName || '—'],
    ['Otaq', placeDisplay.roomName],
    ['Yer nömrəsi', placeDisplay.seatNumber],
    ['Otağın yer sayı', String(placeDisplay.roomCapacity)],
    ['Boş yerlər', String(placeDisplay.available)],
    ['Dolu yerlər', String(placeDisplay.occupied)],
  ] : [];
  return (
    <section aria-label="Yer təyinatı" className="space-y-3 rounded-xl border border-[#EAEAEA] bg-white p-4 text-[#0F172A]">
      <h3 className="text-sm font-bold">Yer təyinatı</h3>
      {message ? <p role={message.type === 'error' ? 'alert' : 'status'} className={message.type === 'error' ? 'rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800' : 'rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900'}>{message.text}</p> : null}
      {assigned ? (
        placeLoading ? <p role="status" className="text-sm text-[#64748B]">Yer məlumatı yüklənir...</p>
          : placeError ? <p role="alert" className="text-sm text-rose-800">{placeError}</p>
            : placeDisplay ? <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">{placeRows.map(([label, value]) => <div key={label} className="rounded-xl bg-[#FAFAF7] p-3"><dt className="text-xs font-semibold text-[#64748B]">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-[#0F172A]">{value}</dd></div>)}</dl>
              : null
      ) : detail.paymentStatus !== 'verified' ? (
        <p className="text-sm text-[#64748B]">Yer təyin etmək üçün əvvəlcə ödəniş təsdiqlənməlidir.</p>
      ) : !allocatable ? (
        <p className="text-sm text-[#64748B]">Bu müraciət üçün yer təyini mümkün deyil.</p>
      ) : (
        <button type="button" disabled={allocating || confirmOpen} onClick={onRequestConfirm} className="min-h-11 rounded-xl bg-[#0F172A] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Yer təyin et</button>
      )}
      {confirmOpen ? (
        <div role="alertdialog" aria-modal="true" aria-labelledby="place-allocate-title" className="space-y-3 rounded-xl border border-[#0F172A]/20 bg-white p-4">
          <h4 id="place-allocate-title" className="font-bold">Yer təyin etmək istəyirsiniz?</h4>
          <p className="text-xs text-[#64748B]">Sistem uyğun boş yeri avtomatik seçib müraciətə təyin edəcək. Bu əməliyyat yalnız bir dəfə icra olunur.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onCancelConfirm} disabled={allocating} className="min-h-11 rounded-xl border border-[#0F172A]/20 px-4 text-sm font-semibold disabled:opacity-40">Ləğv et</button>
            <button type="button" onClick={onConfirm} disabled={allocating} className="min-h-11 rounded-xl bg-[#0F172A] px-4 text-sm font-bold text-white disabled:opacity-40">{allocating ? 'Yer təyin edilir...' : 'Bəli, təyin et'}</button>
          </div>
        </div>
      ) : null}
      {allocating ? <p role="status" className="text-xs text-[#64748B]">Yer təyin edilir...</p> : null}
    </section>
  );
}

interface TicketIssuancePanelProps {
  detail: ApplicationReviewDetail;
  role: AppRole | null;
  issuing: boolean;
  confirmOpen: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
  issuedUrl: string | null;
  onRequestConfirm: () => void;
  onCancelConfirm: () => void;
  onConfirm: () => void;
}

function TicketIssuancePanel({ detail, role, issuing, confirmOpen, message, issuedUrl, onRequestConfirm, onCancelConfirm, onConfirm }: TicketIssuancePanelProps) {
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfMessage, setPdfMessage] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [whatsappBusy, setWhatsappBusy] = useState(false);
  const [whatsappMessage, setWhatsappMessage] = useState<string | null>(null);
  const pdfInFlight = useRef(false);
  const whatsappInFlight = useRef(false);
  useEffect(() => {
    let active = true;
    setQrDataUrl(null);
    setWhatsappMessage(null);
    if (!issuedUrl) return undefined;
    void buildTicketQrDataUrl(issuedUrl).then((url) => {
      if (active) setQrDataUrl(url);
    }).catch(() => {
      if (active) setQrDataUrl(null);
    });
    return () => { active = false; };
  }, [issuedUrl]);
  const downloadPdf = async () => {
    if (!issuedUrl || pdfInFlight.current) return;
    pdfInFlight.current = true;
    setPdfBusy(true);
    setPdfMessage(null);
    try {
      await downloadIssuedTicketPdf(issuedUrl);
    } catch {
      setPdfMessage('PDF-i hazırlamaq mümkün olmadı. Yenidən cəhd edin.');
    } finally {
      pdfInFlight.current = false;
      setPdfBusy(false);
    }
  };
  const issuable = canIssueTicket(role, {
    paymentStatus: detail.paymentStatus,
    applicationStatus: detail.applicationStatus,
    ticketStatus: detail.ticketStatus,
    assignedBuildingId: detail.assignedBuildingId,
    assignedRoomId: detail.assignedRoomId,
    assignedSeatId: detail.assignedSeatId,
  });
  // Manual flow: prepares the message and opens WhatsApp. The admin presses WhatsApp's own Send button.
  // The popup is opened synchronously to keep the click gesture, then navigated once the message is ready.
  const openWhatsApp = async () => {
    if (!issuedUrl || whatsappInFlight.current) return;
    whatsappInFlight.current = true;
    setWhatsappBusy(true);
    setWhatsappMessage(null);
    const popup = window.open('about:blank', '_blank');
    try {
      const shareUrl = await prepareTicketWhatsAppLink(issuedUrl);
      if (!popup) throw new Error('popup-blocked');
      popup.opener = null;
      popup.location.href = shareUrl;
      setWhatsappMessage(WHATSAPP_MANUAL_SEND_NOTICE);
    } catch {
      popup?.close();
      setWhatsappMessage('WhatsApp mesajını hazırlamaq mümkün olmadı. Açılan pəncərəyə icazə verin və yenidən cəhd edin.');
    } finally {
      whatsappInFlight.current = false;
      setWhatsappBusy(false);
    }
  };
  const copyLink = async () => {
    if (!issuedUrl) return;
    try {
      await navigator.clipboard.writeText(issuedUrl);
      setCopyMessage('Link kopyalandı.');
    } catch {
      setCopyMessage('Linki kopyalamaq mümkün olmadı. Linki əl ilə seçin.');
    }
  };
  return (
    <section aria-label="Bilet" className="space-y-3 rounded-xl border border-[#EAEAEA] bg-white p-4 text-[#0F172A]">
      <h3 className="text-sm font-bold">Bilet</h3>
      {message ? <p role={message.type === 'error' ? 'alert' : 'status'} className={message.type === 'error' ? 'rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800' : 'rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900'}>{message.text}</p> : null}
      {detail.ticketStatus === 'active' ? (
        <p className="text-sm text-[#64748B]">Bu müraciət üçün aktiv bilet mövcuddur.</p>
      ) : !issuable ? (
        <p className="text-sm text-[#64748B]">Bilet yaratmaq üçün ödəniş təsdiqlənməli və yer təyin edilməlidir.</p>
      ) : (
        <button type="button" disabled={issuing || confirmOpen} onClick={onRequestConfirm} className="min-h-11 rounded-xl bg-[#0F172A] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Bilet yarat</button>
      )}
      {confirmOpen ? (
        <div role="alertdialog" aria-modal="true" aria-labelledby="ticket-issue-title" className="space-y-3 rounded-xl border border-[#0F172A]/20 bg-white p-4">
          <h4 id="ticket-issue-title" className="font-bold">Bilet yaratmaq istəyirsiniz?</h4>
          <p className="text-xs text-[#64748B]">Bu müraciət üçün yalnız bir aktiv bilet yaradılacaq. Mövcud bilet varsa, yenisi yaradılmayacaq.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onCancelConfirm} disabled={issuing} className="min-h-11 rounded-xl border border-[#0F172A]/20 px-4 text-sm font-semibold disabled:opacity-40">Ləğv et</button>
            <button type="button" onClick={onConfirm} disabled={issuing} className="min-h-11 rounded-xl bg-[#0F172A] px-4 text-sm font-bold text-white disabled:opacity-40">{issuing ? 'Bilet yaradılır...' : 'Bəli, yarat'}</button>
          </div>
        </div>
      ) : null}
      {issuing ? <p role="status" className="text-xs text-[#64748B]">Bilet yaradılır...</p> : null}
      {issuedUrl ? (
        <div className="space-y-2 rounded-xl bg-[#FAFAF7] p-3">
          <p className="text-xs font-semibold text-[#64748B]">Bilet linki (yalnız bu sessiyada göstərilir)</p>
          <p className="break-all text-sm text-[#0F172A]">{issuedUrl}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { void copyLink(); }} className="min-h-11 rounded-xl border border-[#0F172A]/20 px-4 text-sm font-semibold">Linki kopyala</button>
            <button type="button" onClick={() => { void openWhatsApp(); }} disabled={whatsappBusy} className="min-h-11 rounded-xl border border-[#0F172A]/20 px-4 text-sm font-semibold disabled:opacity-40">{whatsappBusy ? 'Mesaj hazırlanır...' : 'WhatsApp mesajını hazırla'}</button>
            <button type="button" onClick={() => { void downloadPdf(); }} disabled={pdfBusy} className="min-h-11 rounded-xl bg-[#0F172A] px-4 text-sm font-bold text-white disabled:opacity-40">{pdfBusy ? 'PDF hazırlanır...' : 'PDF-i endir'}</button>
          </div>
          {qrDataUrl ? <img src={qrDataUrl} alt="Bilet QR kodu" width={160} height={160} className="rounded-lg bg-white p-2" /> : null}
          {copyMessage ? <p role="status" className="text-xs text-[#64748B]">{copyMessage}</p> : null}
          {pdfMessage ? <p role="alert" className="text-xs text-rose-800">{pdfMessage}</p> : null}
          {whatsappMessage ? <p role="status" className="text-xs text-[#64748B]">{whatsappMessage}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function ReviewListSkeleton() {
  return <div role="status" aria-label="Müraciətlər yüklənir" className="space-y-3">{[0, 1, 2].map((row) => <div key={row} className="animate-pulse rounded-2xl border border-[#EAEAEA] bg-white p-5"><div className="h-4 w-1/3 rounded bg-neutral-200" /><div className="mt-3 h-3 w-1/2 rounded bg-neutral-100" /><div className="mt-4 h-6 w-2/3 rounded bg-neutral-100" /></div>)}</div>;
}
