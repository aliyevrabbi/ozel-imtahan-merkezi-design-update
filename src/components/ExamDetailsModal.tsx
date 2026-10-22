import React from 'react';
import { Exam, Building } from '../types';
import { X, Calendar, Clock, MapPin, CheckCircle, FileText, AlertTriangle, ArrowRight } from 'lucide-react';

interface ExamDetailsModalProps {
  exam: Exam | null;
  buildings: Building[];
  onClose: () => void;
  onApply: (exam: Exam) => void;
}

export const ExamDetailsModal: React.FC<ExamDetailsModalProps> = ({
  exam,
  buildings,
  onClose,
  onApply
}) => {
  if (!exam) return null;

  const isClosed = exam.status === 'closed';
  const assignedBuildings = buildings.filter(b => exam.buildingIds?.includes(b.id));

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div
        className="relative bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-[#EAEAEA] overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Header */}
        <div className="bg-[#171717] p-6 sm:p-7 text-white flex items-start justify-between border-b-2 border-[#F4D500]">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold font-manrope text-[#F4D500] uppercase tracking-wider">
                {exam.categoryLabel}
              </span>
              <span className="text-neutral-500">·</span>
              <span className="text-xs text-neutral-300 font-manrope">{exam.city}</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold font-serif text-white leading-snug">
              {exam.title}
            </h3>
            <p className="text-xs text-neutral-400 font-manrope">
              Təşkilatçı: {exam.organizer}
            </p>
          </div>

          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1.5 rounded-xl hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 sm:p-8 overflow-y-auto space-y-6 font-manrope">
          {/* Official Badges */}
          <div className="flex flex-wrap gap-2">
            {exam.badges.map((b, idx) => (
              <span
                key={idx}
                className="text-[11px] font-bold px-3 py-1 bg-[#FCFAF5] text-neutral-800 border border-[#EAEAEA] rounded-md font-manrope"
              >
                {b}
              </span>
            ))}
          </div>

          {/* Quick Info Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#FCFAF5] p-4 rounded-2xl border border-[#EAEAEA]">
            <div>
              <span className="text-[11px] text-neutral-400 block uppercase font-medium">Tarix</span>
              <span className="text-sm font-bold text-neutral-900">{exam.date}</span>
            </div>
            <div>
              <span className="text-[11px] text-neutral-400 block uppercase font-medium">Saat</span>
              <span className="text-sm font-bold text-neutral-900">{exam.startTime} – {exam.endTime}</span>
            </div>
            <div>
              <span className="text-[11px] text-neutral-400 block uppercase font-medium">Siniflər</span>
              <span className="text-sm font-bold text-neutral-900">{exam.grades.join(', ')}-ci sinif</span>
            </div>
            <div>
              <span className="text-[11px] text-neutral-400 block uppercase font-medium">Qiymət</span>
              <span className="text-sm font-bold text-neutral-900">{exam.priceText}</span>
            </div>
          </div>

          {/* Subjects */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-800 mb-2 font-manrope">
              İmtahan Fənləri
            </h4>
            <div className="flex flex-wrap gap-2">
              {exam.subjects.map((sub, i) => (
                <div key={i} className="px-3.5 py-1.5 bg-neutral-100 text-neutral-900 rounded-lg text-xs font-semibold">
                  {sub}
                </div>
              ))}
            </div>
          </div>

          {/* Location & Buildings */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-800 mb-2 font-manrope">
              İmtahan Məkanı (Gəncə)
            </h4>
            <div className="space-y-2">
              {assignedBuildings.length > 0 ? (
                assignedBuildings.map(b => (
                  <div key={b.id} className="p-3.5 bg-[#FCFAF5] rounded-xl border border-[#EAEAEA] text-xs">
                    <div className="font-bold text-neutral-900">{b.name}</div>
                    <div className="text-neutral-500 mt-0.5">{b.address}</div>
                    <div className="text-[11px] text-neutral-600 mt-1">
                      Otaqlar: {b.rooms.map(r => r.name).join(', ')}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-neutral-500">Gəncə şəhəri üzrə mərkəzi korpus.</p>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-800 mb-2 font-manrope">
              Təsvir
            </h4>
            <p className="text-sm text-neutral-600 leading-relaxed font-manrope">
              {exam.description}
            </p>
          </div>

          {/* Rules */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-800 mb-2 font-manrope flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>İmtahan Qaydaları</span>
            </h4>
            <ul className="space-y-1.5 text-xs text-neutral-600">
              {exam.rules.map((rule, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#F4D500] shrink-0 mt-1.5"></span>
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Required Docs */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-800 mb-2 font-manrope flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-neutral-700" />
              <span>Gətirilməli Sənədlər</span>
            </h4>
            <ul className="space-y-1 text-xs text-neutral-600">
              {exam.requiredDocs.map((doc, idx) => (
                <li key={idx} className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{doc}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Modal Bottom CTA */}
        <div className="p-5 bg-[#FCFAF5] border-t border-[#EAEAEA] flex items-center justify-between gap-3 font-manrope">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-bold text-neutral-700 hover:bg-neutral-200 rounded-xl transition-colors cursor-pointer"
          >
            Bağla
          </button>

          <button
            onClick={() => {
              onClose();
              onApply(exam);
            }}
            disabled={isClosed}
            className={`px-6 py-2.5 text-sm font-bold rounded-xl flex items-center gap-2 transition-all cursor-pointer ${
              isClosed
                ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                : 'bg-[#F4D500] hover:bg-[#FFD900] text-black shadow-xs'
            }`}
          >
            <span>{isClosed ? 'Müraciət bağlanıb' : 'İmtahana müraciət et'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
