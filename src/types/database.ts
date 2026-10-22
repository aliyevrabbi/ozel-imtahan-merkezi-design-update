import type { AppRole, ApplicationStatus, PaymentStatus, TicketStatus } from './index';

export interface ProfileRow {
  id: string;
  email: string;
  display_name: string | null;
  role: AppRole;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApplicationRow {
  id: string;
  registration_number: string;
  exam_id: string;
  student_name: string;
  student_surname: string;
  student_father_name: string | null;
  grade: string;
  school: string | null;
  course_or_tutor: string | null;
  student_phone: string;
  student_phone_normalized: string;
  parent_name: string | null;
  parent_phone: string;
  parent_phone_normalized: string;
  city: string;
  public_note: string | null;
  internal_note: string | null;
  application_status: ApplicationStatus;
  payment_status: PaymentStatus;
  ticket_status: TicketStatus;
  assigned_building_id: string | null;
  assigned_room_id: string | null;
  assigned_seat_id: string | null;
  created_at: string;
  updated_at: string;
  attended_at: string | null;
}

export interface TicketRow {
  id: string;
  application_id: string;
  version: number;
  status: Exclude<TicketStatus, 'not_created'>;
  token_hash: string;
  pdf_storage_path: string | null;
  issued_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  created_by: string | null;
}
