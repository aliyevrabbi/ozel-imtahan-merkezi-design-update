import { getSupabaseClient } from './supabaseClient';
import { mapPublishedExam } from './examMapper';
import type { PublicExamRow } from './examMapper';
import type { Exam } from '../types';

export async function loadPublishedExams(): Promise<Exam[]> {
  const client = getSupabaseClient();
  if (!client) throw new Error('public_exam_load_failed');

  const { data, error } = await client
    .from('exams')
    .select('id,title,category,organizer,grades,subjects,exam_date,start_time,end_time,city,application_open_at,application_deadline,status,price_description,rules,required_documents,description')
    .eq('status', 'published')
    .order('exam_date', { ascending: true });

  if (error || !data) throw new Error('public_exam_load_failed');
  return (data as unknown as PublicExamRow[]).map((row) => mapPublishedExam(row));
}
