import type { AppRole, ApplicationStatus, PaymentStatus, TicketStatus } from '../types';

export type AdminSectionKey =
  | 'dashboard'
  | 'exams'
  | 'applications'
  | 'facilities'
  | 'seating'
  | 'tickets'
  | 'audit'
  | 'settings';

export interface AdminSection {
  key: AdminSectionKey;
  label: string;
  roles: readonly AppRole[];
}

const MANAGER_ROLES: readonly AppRole[] = ['admin', 'super_admin'];

// Operator and scanner have no admin sections in this phase; they only see a safe notice.
export const ADMIN_SECTIONS: readonly AdminSection[] = [
  { key: 'dashboard', label: 'Dashboard', roles: MANAGER_ROLES },
  { key: 'exams', label: 'İmtahanlar', roles: MANAGER_ROLES },
  { key: 'applications', label: 'Müraciətlər', roles: MANAGER_ROLES },
  { key: 'facilities', label: 'Binalar və otaqlar', roles: MANAGER_ROLES },
  { key: 'seating', label: 'Yer bölgüsü', roles: MANAGER_ROLES },
  { key: 'tickets', label: 'Biletlər', roles: MANAGER_ROLES },
  { key: 'audit', label: 'Audit jurnalı', roles: MANAGER_ROLES },
  { key: 'settings', label: 'Parametrlər', roles: ['super_admin'] },
];

export function getVisibleAdminSections(role: AppRole | null): readonly AdminSection[] {
  if (!role) return [];
  return ADMIN_SECTIONS.filter((section) => section.roles.includes(role));
}

export function isAdminSectionVisible(role: AppRole | null, key: AdminSectionKey): boolean {
  return getVisibleAdminSections(role).some((section) => section.key === key);
}

// UI gate only. create_exam / update_exam / change_exam_status / archive_exam enforce the same role
// check server-side. The UI never writes exam tables directly.
export function canMutateExams(role: AppRole | null): boolean {
  return role !== null && MANAGER_ROLES.includes(role);
}

export function canConfirmPayment(role: AppRole | null): boolean {
  return role === 'admin' || role === 'super_admin';
}

export interface TicketCandidate {
  paymentStatus: PaymentStatus;
  applicationStatus: ApplicationStatus;
  ticketStatus: TicketStatus;
  assignedBuildingId: string | null;
  assignedRoomId: string | null;
  assignedSeatId: string | null;
}

// UI gate only. issue_application_ticket re-checks every rule, the exam status and the active-ticket
// idempotency server-side.
export function canIssueTicket(role: AppRole | null, candidate: TicketCandidate): boolean {
  if (role !== 'admin' && role !== 'super_admin') return false;
  return candidate.paymentStatus === 'verified'
    && candidate.applicationStatus === 'pending'
    && candidate.ticketStatus === 'not_created'
    && candidate.assignedBuildingId !== null
    && candidate.assignedRoomId !== null
    && candidate.assignedSeatId !== null;
}

export interface AllocationCandidate {
  paymentStatus: PaymentStatus;
  applicationStatus: ApplicationStatus;
  ticketStatus: TicketStatus;
  assignedSeatId: string | null;
}

// UI gate only. The allocate_application_place RPC enforces the same rules and exam-status checks
// (published/closed allowed; draft/archived/finished/past-date rejected) server-side.
export function canAllocatePlace(role: AppRole | null, candidate: AllocationCandidate): boolean {
  if (!role || !MANAGER_ROLES.includes(role)) return false;
  return candidate.paymentStatus === 'verified'
    && candidate.applicationStatus === 'pending'
    && candidate.ticketStatus === 'not_created'
    && candidate.assignedSeatId === null;
}
