export const EXAM_CATEGORIES = [
  { id: 'all', label: 'Bütün İmtahanlar' },
  { id: 'buraxilis', label: 'Buraxılış' },
  { id: 'sinaq', label: 'Sınaq' },
  { id: 'monitorinq', label: 'Monitorinq' },
  { id: 'hediyyeli', label: 'Hədiyyəli Sınaqlar' },
  { id: 'fenn', label: 'Fənn Sınağı' },
] as const;

export const EXAM_GRADES = ['8', '9', '10', '11'] as const;

// There are no client-bundled demo exams; the public catalogue loads from Supabase.
export const DEFAULT_EXAMS = [];
