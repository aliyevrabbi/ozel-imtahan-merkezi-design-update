import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { formatApplicationOpenDate, mapPublishedExam, nextUpcomingApplicationExam } from '../src/services/examMapper';

const base = {
  id: 'a4ed77a9-24df-4ee8-9ad0-8ca7bc6ef237',
  title: 'Synthetic test only',
  category: 'sinaq',
  organizer: 'Test organizer',
  grades: ['9'],
  subjects: ['Riyaziyyat'],
  exam_date: '2035-06-10',
  start_time: '10:00:00',
  end_time: '12:00:00',
  city: 'Gəncə',
  application_open_at: null,
  application_deadline: null,
  status: 'published' as const,
  price_description: null,
  rules: [],
  required_documents: [],
  description: null,
};

test('maps a published exam with open application window', () => {
  assert.deepEqual(mapPublishedExam(base, Date.parse('2035-01-01T00:00:00Z')), {
    id: base.id, title: base.title, category: 'sinaq', categoryLabel: 'Sınaq', organizer: base.organizer,
    grades: ['9'], subjects: ['Riyaziyyat'], date: '2035-06-10', startTime: '10:00', endTime: '12:00',
    city: 'Gəncə', buildingIds: [], applicationDeadline: '', applicationOpenDate: '', maxSeats: 0,
    registeredCount: 0, status: 'open', priceText: 'Qiymət mərkəzdən dəqiqləşdiriləcək', rules: [],
    requiredDocs: [], description: '', badges: [],
  });
});

test('maps the configured hediyyeli category to its supported category and label', () => {
  const configuredCategory = mapPublishedExam({ ...base, category: 'hediyyeli' }, Date.parse('2035-01-01T00:00:00Z'));
  assert.equal(configuredCategory.category, 'hediyyeli');
  assert.equal(configuredCategory.categoryLabel, 'Hədiyyəli Sınaqlar');

  const accentedCategory = mapPublishedExam({ ...base, category: 'hədiyyəli' }, Date.parse('2035-01-01T00:00:00Z'));
  assert.equal(accentedCategory.category, 'hediyyeli');
  assert.equal(accentedCategory.categoryLabel, 'Hədiyyəli Sınaqlar');
});

test('marks an exam outside the application window as closed', () => {
  assert.equal(mapPublishedExam({ ...base, application_deadline: '2034-12-31T23:59:59Z' }, Date.parse('2035-01-01T00:00:00Z')).status, 'closed');
});

test('marks an exam whose application has not opened as upcoming', () => {
  assert.equal(mapPublishedExam({ ...base, application_open_at: '2035-02-01T00:00:00Z' }, Date.parse('2035-01-01T00:00:00Z')).status, 'upcoming');
});

test('marks past exam dates as finished', () => {
  assert.equal(mapPublishedExam({ ...base, exam_date: '2034-12-31' }, Date.parse('2035-01-01T00:00:00Z')).status, 'finished');
});

const NOW = Date.parse('2035-01-01T00:00:00Z');

test('published exam with a valid open window is open for application and keeps its grades', () => {
  const exam = mapPublishedExam({
    ...base,
    grades: ['9'],
    application_open_at: '2034-12-01T06:00:00+00:00',
    application_deadline: '2035-12-25T23:00:00+00:00',
  }, NOW);
  assert.equal(exam.status, 'open');
  assert.deepEqual(exam.grades, ['9']);
});

test('exam whose window has not opened is not open, and is reported as the next upcoming exam', () => {
  const later = mapPublishedExam({ ...base, id: 'later', application_open_at: '2035-02-01T06:00:00+00:00' }, NOW);
  const sooner = mapPublishedExam({ ...base, id: 'sooner', application_open_at: '2035-01-20T06:00:00+00:00' }, NOW);
  assert.equal(later.status, 'upcoming');
  assert.equal(nextUpcomingApplicationExam([later, sooner])?.id, 'sooner');
  assert.equal(nextUpcomingApplicationExam([later, { ...later, status: 'open' }])?.id, 'later');
});

test('grade 9 is kept and selectable when the exam grades are ["9"]', () => {
  const exam = mapPublishedExam({ ...base, grades: ['9'], application_open_at: null }, NOW);
  assert.deepEqual(exam.grades, ['9']);
  assert.equal(exam.grades.includes('9'), true);
});

test('empty grades are preserved as an empty list, not replaced by a global grade list', () => {
  const exam = mapPublishedExam({ ...base, grades: [] }, NOW);
  assert.deepEqual(exam.grades, []);
});

test('synthetic-test category is not excluded from the open list', () => {
  const exam = mapPublishedExam({ ...base, category: 'buraxilis', title: 'SYNTHETIC - FULL TICKET E2E TEST' }, NOW);
  assert.equal(exam.status, 'open');
  assert.equal(exam.title, 'SYNTHETIC - FULL TICKET E2E TEST');
});

test('timezone: application opening instant is shown in Baku time', () => {
  const shown = formatApplicationOpenDate('2026-10-26T06:00:00+00:00');
  assert.match(shown, /26\.10\.2026/);
  assert.match(shown, /10:00/);
  assert.equal(formatApplicationOpenDate('not-a-date'), '');
});

test('timezone: deadline comparison uses the absolute instant, not the local date', () => {
  const closingInstant = '2035-01-01T00:00:00Z';
  assert.equal(mapPublishedExam({ ...base, application_deadline: closingInstant }, NOW).status, 'closed');
  assert.equal(mapPublishedExam({ ...base, application_deadline: '2035-01-01T00:00:01Z' }, NOW).status, 'open');
});

test('application form lists only open exams and renders grades from the selected exam', () => {
  const source = readFileSync('src/components/ApplicationForm.tsx', 'utf8');
  assert.match(source, /exams\.filter\(e => e\.status === 'open'\)/);
  assert.match(source, /\(currentExam\?\.grades \?\? \[\]\)\.map/);
  assert.match(source, /selectedExam\?\.grades \?\? \[\]/);
  assert.doesNotMatch(source, /const\s+GRADES\s*=|grades:\s*\[\s*['"]\d/);
  assert.match(source, /activeExams\.length === 0 && nextUpcomingExam/);
  assert.match(source, /\{ex\.title\} \(\{ex\.date\}/);
  assert.match(source, /\{currentExam\.title\}/);
  assert.match(source, /currentExam && currentExam\.grades\.length === 0 && \(/);
  assert.match(source, /Bu imtahan üçün siniflər hələ təyin edilməyib\./);
});
