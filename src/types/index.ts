export type AppRole = 'super_admin' | 'admin' | 'operator' | 'scanner';
export type ApplicationStatus = 'pending' | 'under_review' | 'confirmed' | 'rejected' | 'cancelled' | 'attended';
export type PaymentStatus = 'not_submitted' | 'receipt_received' | 'verified' | 'rejected';
export type TicketStatus = 'not_created' | 'active' | 'revoked';

export type ExamCategory =
  | 'buraxilis'
  | 'sinaq'
  | 'monitorinq'
  | 'fenn'
  | 'hediyyeli'
  | 'yaris'
  | 'musabiqe'
  | 'xususi';

export interface Room {
  id: string;
  name: string;
  capacity: number;
  currentOccupancy: number;
}

export interface Building {
  id: string;
  name: string;
  address: string;
  rooms: Room[];
}

// Schema-aligned facility types for the admin panel (public.buildings, public.rooms, public.exam_rooms).
// rooms.capacity is the place count (“Otağın yer sayı”); there is no separate desk/parta field.
export interface FacilityBuilding {
  id: string;
  name: string;
  address: string;
  city: string;
  isActive: boolean;
  archivedAt: string | null;
}

export interface FacilityRoom {
  id: string;
  buildingId: string;
  name: string;
  capacity: number;
  isActive: boolean;
  archivedAt: string | null;
}

export interface ExamRoomAssignment {
  roomId: string;
  priority: number;
  isEnabled: boolean;
}

export interface Exam {
  id: string;
  title: string;
  category: ExamCategory;
  categoryLabel: string;
  organizer: string;
  grades: string[];
  subjects: string[];
  date: string;
  startTime: string;
  endTime: string;
  city: string;
  buildingIds: string[];
  applicationDeadline: string;
  applicationOpenDate: string;
  maxSeats: number;
  registeredCount: number;
  status: 'open' | 'closed' | 'finished' | 'upcoming';
  priceText: string;
  rules: string[];
  requiredDocs: string[];
  description: string;
  badges: string[];
}

export interface Application {
  id: string;
  regNumber: string;
  examId: string;
  examTitle: string;
  examDate: string;
  examTime: string;
  studentName: string;
  studentSurname: string;
  studentFatherName: string;
  grade: string;
  school: string;
  courseOrTutor: string;
  studentPhone: string;
  parentName: string;
  parentPhone: string;
  city: string;
  notes?: string;
  applicationStatus: ApplicationStatus;
  paymentStatus: PaymentStatus;
  ticketStatus: TicketStatus;
  assignedBuildingId?: string;
  assignedBuildingName?: string;
  assignedBuildingAddress?: string;
  assignedRoomId?: string;
  assignedRoomName?: string;
  assignedSeatNumber?: number | string;
  createdAt: string;
  attendedAt?: string;
}

export interface SubjectResult {
  name: string;
  correct: number;
  wrong: number;
  empty: number;
  score: number;
  maxScore: number;
}

export interface ExamResult {
  id: string;
  regNumber: string;
  examId: string;
  examTitle: string;
  studentFullName: string;
  studentPhone: string;
  grade: string;
  totalScore: number;
  maxScore: number;
  percentage: number;
  rank?: number;
  totalParticipants?: number;
  subjects: SubjectResult[];
  publishedDate: string;
}

export interface WebsiteSettings {
  brandName: string;
  shortBrandName: string;
  domain: string;
  instagramHandle: string;
  instagramUrl: string;
  city: string;
  address: string;
  phone: string;
  whatsappPhone: string;
  workingHours: string;
  email: string;
  googleMapsUrl: string;
  heroKicker: string;
  heroTitle: string;
  heroSubtext: string;
  aboutText: string;
  partnershipText: string;
}

export interface AuditLog {
  id: string;
  action: string;
  details: string;
  timestamp: string;
  user: string;
}
