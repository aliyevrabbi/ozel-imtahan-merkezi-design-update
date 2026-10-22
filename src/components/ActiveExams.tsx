import React, { useState } from 'react';
import { Exam } from '../types';
import {
  Calendar,
  Clock,
  ArrowRight,
  AlertCircle,
  Search,
  LayoutGrid,
  List,
  Layers,
  GraduationCap,
  CheckCircle2,
  BarChart3,
  Gift,
  BookOpen,
} from 'lucide-react';

interface ActiveExamsProps {
  exams: Exam[];
  onSelectExam: (exam: Exam) => void;
  onApplyForExam: (exam: Exam) => void;
}

export const ActiveExams: React.FC<ActiveExamsProps> = ({
  exams,
  onSelectExam,
  onApplyForExam,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const categories = [
    {
      id: 'all',
      label: 'Bütün İmtahanlar',
      desc: 'Bütün aktiv sınaqlar',
      icon: Layers,
    },
    {
      id: 'buraxilis',
      label: 'Buraxılış İmtahanı',
      desc: '9 və 11-ci siniflər',
      icon: GraduationCap,
    },
    {
      id: 'sinaq',
      label: 'Ümumi Sınaq',
      desc: 'Qəbul modeli sınaqları',
      icon: CheckCircle2,
    },
    {
      id: 'monitorinq',
      label: 'Monitorinq',
      desc: 'Dövlət standartı',
      icon: BarChart3,
    },
    {
      id: 'hediyyeli',
      label: 'Hədiyyəli Sınaq',
      desc: 'Mükafatlı yarışlar',
      icon: Gift,
    },
    {
      id: 'fenn',
      label: 'Fənn Sınağı',
      desc: 'Tək fənlər üzrə',
      icon: BookOpen,
    },
  ];

  const filteredExams = exams.filter((exam) => {
    if (selectedCategory !== 'all' && exam.category !== selectedCategory) return false;
    if (gradeFilter !== 'all' && !exam.grades.includes(gradeFilter)) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = exam.title.toLowerCase().includes(q);
      const matchSubjects = exam.subjects.some((s) => s.toLowerCase().includes(q));
      if (!matchTitle && !matchSubjects) return false;
    }
    return true;
  });

  const formatDateAz = (dateStr: string) => {
    try {
      const [year, month, day] = dateStr.split('-');
      const monthsAz = [
        'Yanvar',
        'Fevral',
        'Mart',
        'Aprel',
        'May',
        'İyun',
        'İyul',
        'Avqust',
        'Sentyabr',
        'Oktyabr',
        'Noyabr',
        'Dekabr',
      ];
      const mIdx = parseInt(month, 10) - 1;
      return `${parseInt(day, 10)} ${monthsAz[mIdx] || ''} ${year}`;
    } catch {
      return dateStr;
    }
  };

  return (
    <section id="aktiv-imtahanlar" className="py-12 sm:py-16 bg-[#FAFAF7] min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold font-serif text-[#0F172A] tracking-tight">
            Aktiv İmtahanlar
          </h1>
          <p className="mt-1.5 text-xs sm:text-sm text-[#64748B] font-manrope">
            Aşağıdakı kateqoriyalardan birini seçərək sizə lazım olan imtahanı dərhal tapın və qeydiyyatdan keçin.
          </p>
        </div>

        {/* PROMINENT CATEGORY CARDS (High-Visibility Touch-Friendly Filtering) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mb-8">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isSelected = selectedCategory === cat.id;
            const count =
              cat.id === 'all'
                ? exams.length
                : exams.filter((e) => e.category === cat.id).length;

            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`group relative p-4 rounded-2xl text-left transition-all duration-200 cursor-pointer flex flex-col justify-between border ${
                  isSelected
                    ? 'bg-[#0F172A] text-white border-[#0F172A] shadow-md -translate-y-0.5'
                    : 'bg-white text-[#1E293B] border-[#E5E5E0] hover:border-slate-300 hover:shadow-xs hover:-translate-y-0.5'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-[#F4D500] text-[#0F172A] shadow-xs'
                        : 'bg-[#FAFAF7] text-[#0F172A] group-hover:bg-[#F4D500]/20 group-hover:text-amber-800'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>

                  <span
                    className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${
                      isSelected
                        ? 'bg-white/15 text-[#F4D500]'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {count}
                  </span>
                </div>

                <div>
                  <h3 className="font-bold text-sm sm:text-base leading-snug font-manrope">
                    {cat.label}
                  </h3>
                  <p
                    className={`text-[11px] mt-1 font-manrope truncate ${
                      isSelected ? 'text-slate-300' : 'text-[#64748B]'
                    }`}
                  >
                    {cat.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Secondary Toolbar: Search, Grade Filter & View Toggle */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 mb-8 pb-4 border-b border-[#EAEAEA]">
          {/* Grade Quick Filter */}
          <div className="flex items-center gap-1.5 text-xs font-manrope flex-wrap">
            <span className="text-[#64748B] font-semibold mr-1">Sinif:</span>
            {['all', '8', '9', '10', '11'].map((g) => (
              <button
                key={g}
                onClick={() => setGradeFilter(g)}
                className={`px-3 py-1.5 rounded-xl font-bold font-manrope transition-all cursor-pointer ${
                  gradeFilter === g
                    ? 'bg-[#F4D500] text-[#0F172A] shadow-2xs'
                    : 'bg-white text-[#64748B] hover:text-[#0F172A] border border-[#E5E5E0]'
                }`}
              >
                {g === 'all' ? 'Bütün siniflər' : `${g}-ci sinif`}
              </button>
            ))}
          </div>

          {/* Search bar & View mode toggle */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-[#94A3B8] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="İmtahan və ya fənn axtar..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-[#E5E5E0] rounded-xl text-xs font-manrope text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#0F172A] shadow-2xs"
              />
            </div>

            {/* View Toggle (Grid / List) */}
            <div className="hidden sm:flex items-center bg-white border border-[#E5E5E0] rounded-xl p-1 shadow-2xs">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-[#0F172A] text-white'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
                title="Kart görünüşü"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-[#0F172A] text-white'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
                title="Cədvəl görünüşü"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Empty State */}
        {filteredExams.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-[#E5E5E0] shadow-2xs max-w-lg mx-auto">
            <AlertCircle className="w-10 h-10 text-[#94A3B8] mx-auto mb-3 stroke-[1.8]" />
            <h3 className="text-base font-bold text-[#0F172A] font-manrope">
              Uyğun imtahan tapılmadı
            </h3>
            <p className="text-xs text-[#64748B] mt-1 font-manrope">
              Filtrləri dəyişərək və ya axtarış sorğusunu təmizləyərək yenidən yoxlayın.
            </p>
            <button
              onClick={() => {
                setSelectedCategory('all');
                setGradeFilter('all');
                setSearchQuery('');
              }}
              className="mt-4 px-4 py-2 bg-[#FAFAF7] hover:bg-neutral-100 text-xs font-bold text-[#0F172A] rounded-xl border border-[#E5E5E0] cursor-pointer font-manrope transition-colors"
            >
              Filtrləri sıfırla
            </button>
          </div>
        ) : viewMode === 'list' ? (
          /* LIST / ROW VIEW (Ultra Clean Academic Schedule) */
          <div className="space-y-3">
            {filteredExams.map((exam) => {
              const isClosed = exam.status === 'closed';

              return (
                <div
                  key={exam.id}
                  className="bg-white rounded-2xl border border-[#E5E5E0] p-5 sm:p-6 transition-all hover:border-[#CBD5E1] shadow-2xs hover:shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  {/* Left: Date + Grade + Title */}
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-manrope">
                      <span className="font-bold text-[#0F172A] bg-[#FAFAF7] border border-[#E5E5E0] px-2.5 py-1 rounded-md">
                        {formatDateAz(exam.date)}
                      </span>
                      <span className="text-[#64748B] flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-[#D97706]" />
                        <span>
                          {exam.startTime} – {exam.endTime}
                        </span>
                      </span>
                      <span className="text-[#CBD5E1]">·</span>
                      <span className="font-semibold text-[#0F172A] bg-amber-50 text-amber-900 px-2 py-0.5 rounded">
                        {exam.grades.map((g) => `${g}-ci`).join(', ')} sinif
                      </span>
                      <span className="text-[#CBD5E1]">·</span>
                      <span className="text-[#64748B]">{exam.categoryLabel}</span>
                    </div>

                    <h3 className="text-base sm:text-lg font-bold font-manrope text-[#0F172A] leading-snug">
                      {exam.title}
                    </h3>

                    <p className="text-xs text-[#64748B] font-manrope line-clamp-1">
                      {exam.subjects.join(' · ')}
                    </p>
                  </div>

                  {/* Right: Price + Actions */}
                  <div className="flex items-center justify-between md:justify-end gap-4 shrink-0 pt-3 md:pt-0 border-t md:border-t-0 border-[#F1F5F9]">
                    <div className="text-left md:text-right">
                      <span className="text-[11px] text-[#94A3B8] font-manrope block">
                        Qiymət
                      </span>
                      <span className="text-base font-bold text-[#0F172A] font-manrope">
                        {exam.priceText}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onSelectExam(exam)}
                        className="px-3 py-2 text-xs font-semibold text-[#475569] hover:text-[#0F172A] hover:bg-neutral-100 rounded-xl transition-colors cursor-pointer font-manrope"
                      >
                        Ətraflı
                      </button>

                      <button
                        onClick={() => onApplyForExam(exam)}
                        disabled={isClosed}
                        className={`px-5 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 font-manrope cursor-pointer ${
                          isClosed
                            ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                            : 'bg-[#F4D500] hover:bg-[#E5C700] active:scale-[0.98] text-[#0F172A] shadow-2xs'
                        }`}
                      >
                        <span>Müraciət et</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* GRID VIEW (Modern Airy Cards) */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredExams.map((exam) => {
              const isClosed = exam.status === 'closed';

              return (
                <div
                  key={exam.id}
                  className="bg-white rounded-2xl border border-[#E5E5E0] p-6 sm:p-7 flex flex-col justify-between hover:border-[#CBD5E1] transition-all duration-150 shadow-2xs hover:shadow-xs group"
                >
                  {/* Top: Date & Category Badge */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#FAFAF7] border border-[#E5E5E0] rounded-full text-xs font-semibold text-[#0F172A] font-manrope">
                        <Calendar className="w-3.5 h-3.5 text-[#D97706]" />
                        <span>{formatDateAz(exam.date)}</span>
                      </span>

                      <span
                        className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full font-manrope ${
                          isClosed
                            ? 'text-rose-600 bg-rose-50'
                            : 'text-emerald-700 bg-emerald-50'
                        }`}
                      >
                        {isClosed ? 'Bağlanıb' : 'Açıqdır'}
                      </span>
                    </div>

                    {/* Metadata line */}
                    <div className="flex items-center gap-2 text-xs font-manrope text-[#64748B] mb-2">
                      <span className="font-bold text-[#0F172A]">
                        {exam.grades.map((g) => `${g}-ci`).join(', ')} sinif
                      </span>
                      <span>·</span>
                      <span>{exam.categoryLabel}</span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[#94A3B8]" />
                        <span>{exam.startTime}</span>
                      </span>
                    </div>

                    {/* Exam Title */}
                    <h3 className="text-lg font-bold font-manrope text-[#0F172A] group-hover:text-black leading-snug">
                      {exam.title}
                    </h3>

                    {/* Subjects */}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {exam.subjects.map((sub, idx) => (
                        <span
                          key={idx}
                          className="text-[11px] font-medium px-2 py-0.5 bg-[#FAFAF7] text-[#475569] border border-[#EAEAEA] rounded-md font-manrope"
                        >
                          {sub}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Bottom Row: Price & Action Buttons */}
                  <div className="mt-6 pt-4 border-t border-[#F1F5F9] flex items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-[#94A3B8] font-manrope block leading-tight">
                        İştirak haqqı
                      </span>
                      <span className="text-base sm:text-lg font-bold text-[#0F172A] font-manrope">
                        {exam.priceText}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onSelectExam(exam)}
                        className="px-3 py-2 text-xs font-semibold text-[#475569] hover:text-[#0F172A] hover:bg-neutral-100 rounded-xl transition-colors cursor-pointer font-manrope"
                      >
                        Ətraflı
                      </button>

                      <button
                        onClick={() => onApplyForExam(exam)}
                        disabled={isClosed}
                        className={`px-4 sm:px-5 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 font-manrope cursor-pointer ${
                          isClosed
                            ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                            : 'bg-[#F4D500] hover:bg-[#E5C700] active:scale-[0.98] text-[#0F172A] shadow-2xs'
                        }`}
                      >
                        <span>Müraciət et</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
