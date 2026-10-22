import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Exam, WebsiteSettings } from '../types';
import { Calendar, Clock, MapPin, ArrowRight, CheckCircle2, MessageCircle } from 'lucide-react';
import { ApplicationErrorToast } from './ApplicationErrorToast';
import { submitPublicApplication } from '../services/applicationService';
import type { SimplifiedPublicApplicationFormInput } from '../services/applicationContract';
import {
  applicationDiagnosticCategory,
  createApplicationSubmissionDiagnostics,
  createClientValidationDiagnostics,
  submitWithAllowedApplicationGrade,
  PublicApplicationSubmitError,
  publicApplicationErrorMessage,
  readPublicApplicationErrorCode,
  normalizeAzerbaijaniMobile,
  sanitizeAzerbaijaniMobileInput,
  simplifiedApplicationFormErrorMessage,
  submitSimplifiedPublicApplicationForm,
} from '../services/applicationContract';
import type { ApplicationSubmissionDiagnostics, ApplicationDiagnosticExamStatus } from '../services/applicationContract';
import { getSupabaseClient } from '../services/supabaseClient';
import { formatApplicationOpenDate, nextUpcomingApplicationExam } from '../services/examMapper';

interface ApplicationFormProps {
  exams: Exam[];
  selectedExam: Exam | null;
  settings: WebsiteSettings;
  onCancel?: () => void;
}

export const ApplicationForm: React.FC<ApplicationFormProps> = ({
  exams,
  selectedExam: initialSelectedExam,
  settings,
  onCancel
}) => {
  const activeExams = exams.filter(e => e.status === 'open');
  const nextUpcomingExam = nextUpcomingApplicationExam(exams);
  const [selectedExamId, setSelectedExamId] = useState<string>(
    initialSelectedExam?.id || activeExams[0]?.id || ''
  );

  const [formData, setFormData] = useState({
    studentName: '',
    studentSurname: '',
    studentFatherName: '',
    grade: activeExams[0]?.grades[0] ?? '',
    school: '',
    mobileDigits: '',
    notes: '',
    agreeTerms: true
  });

  useEffect(() => {
    setSelectedExamId((current) => {
      const preferred = initialSelectedExam && activeExams.find((exam) => exam.id === initialSelectedExam.id);
      if (preferred) return preferred.id;
      if (activeExams.some((exam) => exam.id === current)) return current;
      return activeExams[0]?.id ?? '';
    });
  }, [exams, initialSelectedExam?.id]);

  useEffect(() => {
    const selected = exams.find((exam) => exam.id === selectedExamId && exam.status === 'open');
    if (selected?.grades.length) {
      setFormData((previous) => selected.grades.includes(previous.grade)
        ? previous
        : { ...previous, grade: selected.grades[0] });
    }
  }, [exams, selectedExamId]);

  const [error, setError] = useState<string | null>(null);
  const [errorDiagnostics, setErrorDiagnostics] = useState<ApplicationSubmissionDiagnostics | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submission, setSubmission] = useState<{ registrationNumber: string; whatsappUrl: string } | null>(null);
  const submittingRef = useRef(false);
  const idempotencyKey = useRef<string | null>(null);
  const closeErrorToast = useCallback(() => {
    setError(null);
    setErrorDiagnostics(null);
  }, []);
  const selectedExam = exams.find((exam) => exam.id === selectedExamId);
  const currentExam = selectedExam || activeExams[0];
  const diagnosticExamStatus: ApplicationDiagnosticExamStatus = !selectedExamId
    ? 'unknown'
    : selectedExam?.status === 'open'
      ? 'published_open'
      : 'missing_or_closed';
  const showClientError = (message: string, examStatus = diagnosticExamStatus) => {
    setError(message);
    setErrorDiagnostics(import.meta.env.DEV ? createClientValidationDiagnostics(examStatus) : null);
  };
  const supabase = getSupabaseClient();
  const updateField = <K extends keyof typeof formData,>(field: K, value: typeof formData[K]) => {
    idempotencyKey.current = null;
    setFormData((previous) => ({ ...previous, [field]: value }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setErrorDiagnostics(null);

    if (!selectedExamId || !exams.some(exam => exam.id === selectedExamId && exam.status === 'open')) {
      showClientError('Seçilmiş imtahan üçün müraciət qəbul edilmir. Zəhmət olmasa imtahanı yenidən seçin.', selectedExamId ? 'missing_or_closed' : 'unknown');
      return;
    }
    if (!formData.studentName.trim() || !formData.studentSurname.trim() || !formData.studentFatherName.trim()) {
      showClientError('Şagirdin ad, soyad və ata adını tam daxil edin');
      return;
    }
    if (!formData.school.trim()) {
      showClientError('Məktəb adını qeyd edin');
      return;
    }
    const normalizedMobile = normalizeAzerbaijaniMobile(formData.mobileDigits);
    if (!normalizedMobile) {
      showClientError(simplifiedApplicationFormErrorMessage('invalid_phone'));
      return;
    }
    if (!formData.agreeTerms) {
      showClientError('Məlumatların düzgünlüyünü təsdiq etməlisiniz');
      return;
    }
    const selectedExam = exams.find((exam) => exam.id === selectedExamId && exam.status === 'open');
    const gradeSubmission = submitWithAllowedApplicationGrade(
      selectedExam?.grades ?? [],
      formData.grade,
      (grade) => grade,
    );
    if (!gradeSubmission.allowed) {
      showClientError(publicApplicationErrorMessage('invalid_application'));
      if (import.meta.env.DEV) {
        setErrorDiagnostics({
          ...createClientValidationDiagnostics(diagnosticExamStatus),
          selectedExamGradeCount: gradeSubmission.selectedExamGradeCount,
          submittedGradeAllowed: gradeSubmission.submittedGradeAllowed,
          submittedGradeCategory: gradeSubmission.submittedGradeCategory,
        });
      }
      return;
    }
    if (!selectedExam?.city?.trim()) {
      showClientError(simplifiedApplicationFormErrorMessage('missing_city'));
      return;
    }
    if (!supabase) {
      showClientError('Müraciəti qəbul etmək mümkün olmadı. Zəhmət olmasa bir az sonra yenidən cəhd edin.');
      return;
    }

    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    idempotencyKey.current ??= crypto.randomUUID();
    const request: SimplifiedPublicApplicationFormInput = {
      idempotencyKey: idempotencyKey.current,
      examId: selectedExamId,
      studentName: formData.studentName.trim(),
      studentSurname: formData.studentSurname.trim(),
      studentFatherName: formData.studentFatherName.trim(),
      grade: gradeSubmission.grade,
      school: formData.school.trim(),
      mobileDigits: formData.mobileDigits,
      selectedExamCity: selectedExam.city,
    };
    try {
      const result = await submitSimplifiedPublicApplicationForm(request, (payload) =>
        submitPublicApplication(payload, diagnosticExamStatus),
      );
      if (!result.submitted) {
        showClientError(simplifiedApplicationFormErrorMessage(result.reason));
        return;
      }
      const accepted = result.result;
      const summary = [
        `Qeydiyyat nömrəsi: ${accepted.registrationNumber}`,
        `İmtahan: ${currentExam?.title ?? 'İmtahan'}`,
      ].join(String.fromCharCode(10));
      const phone = settings.whatsappPhone.replace(/\D/g, '');
      const whatsappText = [
        'Salam. Müraciətim qeydə alınıb. Zəhmət olmasa ödəniş qaydaları barədə məlumat verin.',
        summary,
      ].join(String.fromCharCode(10));
      const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(whatsappText)}`;
      window.scrollTo({ top: 0, behavior: 'instant' });
      setSubmission({ registrationNumber: accepted.registrationNumber, whatsappUrl });
    } catch (submitError: unknown) {
      const safeErrorCode = readPublicApplicationErrorCode(submitError);
      setError(publicApplicationErrorMessage(safeErrorCode));
      if (import.meta.env.DEV) {
        const diagnostics = submitError instanceof PublicApplicationSubmitError
          ? submitError.diagnostics
          : createApplicationSubmissionDiagnostics(submitError, 'rpc_request', {
            parameterContract: 'pass',
            exam: diagnosticExamStatus,
          });
        setErrorDiagnostics(diagnostics ? {
          ...diagnostics,
          safeCategory: applicationDiagnosticCategory(safeErrorCode),
          selectedExamGradeCount: gradeSubmission.selectedExamGradeCount,
          submittedGradeAllowed: gradeSubmission.submittedGradeAllowed,
          submittedGradeCategory: gradeSubmission.submittedGradeCategory,
        } : null);
      } else {
        setErrorDiagnostics(null);
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleWhatsApp = () => {
    if (!submission) return;
    window.open(submission.whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  if (submission) {
    return (
      <div className="py-14 sm:py-20 bg-[#FCFAF5] min-h-screen">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <section className="rounded-3xl border border-emerald-200 bg-white p-7 sm:p-10 text-center shadow-sm">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <h2 className="mt-4 text-2xl sm:text-3xl font-bold font-serif text-[#171717]">Müraciət qəbul edildi</h2>
            <p className="mt-3 text-sm leading-relaxed text-[#475569]">Müraciətiniz qeydə alınıb. Ödəniş məlumatı hələ təqdim edilməyib və təsdiqlənməyib; bilet və yer təyin edilməyib.</p>
            <p className="mt-5 text-xs font-bold uppercase tracking-wide text-neutral-500">Qeydiyyat nömrəsi</p>              <p className="mt-1 font-mono text-xl font-bold text-[#0F172A]">{submission.registrationNumber}</p>
            <button onClick={handleWhatsApp} className="mt-6 inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-[#25D366] px-6 py-3.5 text-sm font-bold text-white">
              <MessageCircle className="h-4 w-4" /> WhatsApp mesajını aç
            </button>
            <p className="mt-3 text-xs text-neutral-500">WhatsApp-da mesaj əvvəlcədən hazırlanacaq. Göndərmək üçün WhatsApp daxilində özünüz “Send” düyməsini basın.</p>
            <button onClick={() => {
              setSubmission(null);
              idempotencyKey.current = null;
              setFormData({ studentName: '', studentSurname: '', studentFatherName: '', grade: activeExams[0]?.grades[0] ?? '', school: '', mobileDigits: '', notes: '', agreeTerms: true });
              setSelectedExamId(activeExams[0]?.id || '');
            }} className="mt-4 block w-full text-sm font-semibold text-neutral-600 underline">Yeni müraciət</button>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="py-12 sm:py-20 bg-[#FCFAF5] min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">

        {/* Form Container */}
        <div className="bg-white rounded-3xl border border-[#EAEAEA] shadow-sm overflow-hidden">

          {/* Top Title Bar */}
          <div className="bg-[#171717] p-7 sm:p-8 text-white border-b-2 border-[#F4D500]">
            <div className="flex items-center gap-2 text-xs font-bold font-manrope text-[#F4D500] uppercase tracking-wider mb-2">
              <span>Özəl İmtahan Mərkəzi</span>
              <span>·</span>
              <span>Gəncə</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold font-serif text-white">
              İmtahana Müraciət Forması
            </h2>
            <p className="text-xs sm:text-sm text-neutral-300 mt-2 font-manrope">
              Müraciətiniz qeydə alınacaq və qeydiyyat nömrəsi veriləcək. Bu forma ödəniş qəbul etmir və bilet və ya yer təyin etmir.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 sm:p-10 space-y-8 font-manrope">

            {/* 1. Exam Selection */}
            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700">
                1. İmtahanı Seçin *
              </label>

              <select
                value={selectedExamId}
                onChange={(e) => { idempotencyKey.current = null; setSelectedExamId(e.target.value); }}
                className="w-full text-sm font-semibold p-3.5 bg-[#FCFAF5] border border-[#EAEAEA] rounded-xl focus:outline-none focus:border-[#171717] transition-colors"
                required
              >
                {activeExams.length === 0 ? (
                  <option value="">Hazırda açıq müraciətli imtahan yoxdur</option>
                ) : activeExams.map(ex => (
                  <option key={ex.id} value={ex.id}>
                    {ex.title} ({ex.date} · {ex.grades.join(',')}-ci sinif) - {ex.priceText}
                  </option>
                ))}
              </select>
              {activeExams.length === 0 && nextUpcomingExam && (
                <p role="status" className="text-xs text-neutral-600 font-manrope">
                  Növbəti imtahan: <span className="font-bold">{nextUpcomingExam.title}</span> — müraciət {formatApplicationOpenDate(nextUpcomingExam.applicationOpenDate)} tarixindən (Bakı vaxtı) açılacaq.
                </p>
              )}

              {/* Selected Exam Snapshot */}
              {currentExam && (
                <div className="p-4 bg-[#FCFAF5] rounded-2xl border border-[#EAEAEA] text-xs space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-neutral-900 font-serif text-base">
                      {currentExam.title}
                    </span>
                    <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 font-manrope">
                      Müraciət aktivdir
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-neutral-600 pt-1 font-manrope">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-[#F4D500]" />
                      <span>{currentExam.date}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#F4D500]" />
                      <span>{currentExam.startTime} - {currentExam.endTime}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#F4D500]" />
                      <span>{currentExam.city} şəhəri</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Student Info */}
            <div className="space-y-4">
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 border-b border-neutral-100 pb-2">
                2. Şagird Məlumatları
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">
                    Ad *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Adınızı daxil edin"
                    maxLength={100}
                    value={formData.studentName}
                    onChange={(e) => updateField('studentName', e.target.value)}
                    className="w-full text-sm p-3.5 bg-[#FCFAF5] border border-[#EAEAEA] rounded-xl focus:outline-none focus:border-[#171717]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">
                    Soyad *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Soyadınızı daxil edin"
                    maxLength={100}
                    value={formData.studentSurname}
                    onChange={(e) => updateField('studentSurname', e.target.value)}
                    className="w-full text-sm p-3.5 bg-[#FCFAF5] border border-[#EAEAEA] rounded-xl focus:outline-none focus:border-[#171717]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">
                    Ata adı *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ata adını daxil edin"
                    maxLength={100}
                    value={formData.studentFatherName}
                    onChange={(e) => updateField('studentFatherName', e.target.value)}
                    className="w-full text-sm p-3.5 bg-[#FCFAF5] border border-[#EAEAEA] rounded-xl focus:outline-none focus:border-[#171717]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">
                    Sinif *
                  </label>
                  <select
                    value={formData.grade}
                    onChange={(e) => updateField('grade', e.target.value)}
                    className="w-full text-sm p-3.5 bg-[#FCFAF5] border border-[#EAEAEA] rounded-xl focus:outline-none focus:border-[#171717]"
                  >
                    {(currentExam?.grades ?? []).map(g => (
                      <option key={g} value={g}>{g}-ci sinif</option>
                    ))}
                  </select>
                  {currentExam && currentExam.grades.length === 0 && (
                    <p role="status" className="mt-1 text-xs text-neutral-500">Bu imtahan üçün siniflər hələ təyin edilməyib.</p>
                  )}
                </div>

                <div>
                  <label htmlFor="application-mobile" className="block text-xs font-medium text-neutral-600 mb-1">
                    Mobil nömrə
                  </label>
                  <div className="flex overflow-hidden rounded-xl border border-[#EAEAEA] bg-[#FCFAF5] focus-within:border-[#171717]">
                    <span aria-hidden="true" className="flex items-center border-r border-[#EAEAEA] px-3.5 text-sm font-semibold text-neutral-700">+994</span>
                    <input
                      id="application-mobile"
                      name="mobile"
                      type="tel"
                      inputMode="tel"
                      aria-required="true"
                      autoComplete="tel-national"
                      maxLength={30}
                      aria-describedby="application-mobile-hint"
                      placeholder="XX XXX XX XX"
                      value={formData.mobileDigits}
                      onChange={(e) => updateField('mobileDigits', sanitizeAzerbaijaniMobileInput(e.target.value))}
                      className="min-w-0 flex-1 bg-transparent p-3.5 text-sm focus:outline-none"
                    />
                  </div>
                  <p id="application-mobile-hint" className="mt-1 text-xs text-neutral-500">+994 prefiksindən sonra 9 rəqəm daxil edin.</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">
                  Təhsil Aldığı Məktəb *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Məktəbin adını daxil edin"
                  maxLength={160}
                  value={formData.school}
                  onChange={(e) => updateField('school', e.target.value)}
                  className="w-full text-sm p-3.5 bg-[#FCFAF5] border border-[#EAEAEA] rounded-xl focus:outline-none focus:border-[#171717]"
                />
              </div>
            </div>

            {/* Terms checkbox */}
            <div className="pt-2">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formData.agreeTerms}
                  onChange={(e) => updateField('agreeTerms', e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-[#171717] focus:ring-[#171717] border-neutral-300"
                />
                <span className="text-xs text-neutral-600 leading-normal">
                  Daxil etdiyim məlumatların düzgünlüyünü təsdiq edirəm. Müraciət göndərildikdən sonra qeydiyyat nömrəsi alacağam; ödəniş və bilet mərhələləri bu forma daxilində həyata keçirilmir.
                </span>
              </label>
            </div>

            {/* Actions */}
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-end gap-3">
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="w-full sm:w-auto px-5 py-3 text-xs font-bold text-neutral-600 hover:bg-neutral-100 rounded-xl transition-colors cursor-pointer"
                >
                  Ləğv et
                </button>
              )}

              <button
                type="submit"
                disabled={submitting || !supabase || activeExams.length === 0}
                className="w-full sm:w-auto px-8 py-3.5 bg-[#F4D500] hover:bg-[#FFD900] active:scale-[0.98] text-black font-bold text-sm rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:bg-neutral-200 disabled:cursor-not-allowed"
              >
                <span>{submitting ? 'Müraciət göndərilir...' : 'Müraciəti göndər'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      </div>
      {error && <ApplicationErrorToast key={error} message={error} diagnostics={errorDiagnostics} onClose={closeErrorToast} />}
    </div>
  );
};
