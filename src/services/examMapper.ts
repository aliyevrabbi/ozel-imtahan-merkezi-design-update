import type { Exam, ExamCategory } from '../types';

export interface PublicExamRow {
  id: string;
  title: string;
  category: string;
  organizer: string;
  grades: string[];
  subjects: string[];
  exam_date: string;
  start_time: string;
  end_time: string;
  city: string;
  application_open_at: string | null;
  application_deadline: string | null;
  status: 'published';
  price_description: string | null;
  rules: unknown;
  required_documents: unknown;
  description: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  buraxilis: 'Buraxılış',
  sinaq: 'Sınaq',
  monitorinq: 'Monitorinq',
  hediyyeli: 'Hədiyyəli Sınaqlar',
  'hədiyyəli': 'Hədiyyəli Sınaqlar',
  fenn: 'Fənn Sınağı',
  yaris: 'Yarış',
  musabiqe: 'Müsabiqə',
  xususi: 'Xüsusi',
};

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

export const APPLICATION_TIME_ZONE = 'Asia/Baku';

/** Formats an ISO application timestamp for display in the Azerbaijan time zone. */
export function formatApplicationOpenDate(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  return new Intl.DateTimeFormat('az-AZ', {
    timeZone: APPLICATION_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(time));
}

/** The upcoming exam whose application opens first, used for the "not open yet" notice. */
export function nextUpcomingApplicationExam(exams: Exam[]): Exam | undefined {
  return exams
    .filter((exam) => exam.status === 'upcoming' && exam.applicationOpenDate)
    .sort((a, b) => Date.parse(a.applicationOpenDate) - Date.parse(b.applicationOpenDate))[0];
}

export function mapPublishedExam(row: PublicExamRow, now = Date.now()): Exam {
  const opensAt = row.application_open_at ? Date.parse(row.application_open_at) : null;
  const deadline = row.application_deadline ? Date.parse(row.application_deadline) : null;
  const examDay = row.exam_date.slice(0, 10);
  const today = new Date(now).toISOString().slice(0, 10);
  const status: Exam['status'] = deadline !== null && deadline <= now
    ? 'closed'
    : examDay < today
      ? 'finished'
      : opensAt !== null && opensAt > now
        ? 'upcoming'
        : 'open';
  const category = row.category === 'hədiyyəli'
    ? 'hediyyeli'
    : Object.hasOwn(CATEGORY_LABELS, row.category)
      ? row.category as ExamCategory
      : 'xususi';

  return {
    id: row.id,
    title: row.title,
    category,
    categoryLabel: CATEGORY_LABELS[category] ?? CATEGORY_LABELS.xususi,
    organizer: row.organizer,
    grades: row.grades ?? [],
    subjects: row.subjects ?? [],
    date: examDay,
    startTime: row.start_time.slice(0, 5),
    endTime: row.end_time.slice(0, 5),
    city: row.city,
    buildingIds: [],
    applicationDeadline: row.application_deadline ?? '',
    applicationOpenDate: row.application_open_at ?? '',
    maxSeats: 0,
    registeredCount: 0,
    status,
    priceText: row.price_description ?? 'Qiymət mərkəzdən dəqiqləşdiriləcək',
    rules: stringList(row.rules),
    requiredDocs: stringList(row.required_documents),
    description: row.description ?? '',
    badges: [],
  };
}
