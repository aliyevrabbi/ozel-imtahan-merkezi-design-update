import React, { useEffect, useState } from 'react';
import { Calendar, Clock, MapPin, ArrowRight, Flame } from 'lucide-react';
import { Exam } from '../types';

interface NearestExamCountdownProps {
  exams: Exam[];
  onApply: (exam?: Exam) => void;
  onViewAllExams: () => void;
}

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
}

export const NearestExamCountdown: React.FC<NearestExamCountdownProps> = ({
  exams,
  onApply,
  onViewAllExams,
}) => {
  // Find the nearest upcoming active exam
  const nearestExam = React.useMemo(() => {
    const now = new Date().getTime();
    const openOrUpcoming = exams
      .filter((e) => e.status === 'open' || e.status === 'upcoming')
      .map((e) => {
        const timePart = e.startTime || '10:00';
        const parsed = new Date(`${e.date}T${timePart}:00`).getTime();
        return { exam: e, timestamp: isNaN(parsed) ? new Date(e.date).getTime() : parsed };
      })
      .filter((item) => !isNaN(item.timestamp) && item.timestamp > now)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (openOrUpcoming.length > 0) {
      return openOrUpcoming[0].exam;
    }
    // Fallback: Return first open exam or default exam
    return exams.find((e) => e.status === 'open') || exams[0] || null;
  }, [exams]);

  const targetDate = React.useMemo(() => {
    if (!nearestExam) {
      // Default to 14 days from now if no exam available
      return new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).getTime();
    }
    const timePart = nearestExam.startTime || '10:00';
    const parsed = new Date(`${nearestExam.date}T${timePart}:00`).getTime();
    return isNaN(parsed) ? new Date(nearestExam.date).getTime() : parsed;
  }, [nearestExam]);

  const calculateTimeRemaining = (): TimeRemaining => {
    const now = new Date().getTime();
    const difference = targetDate - now;

    if (difference <= 0) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true };
    }

    const days = Math.floor(difference / (1000 * 60 * 60 * 24));
    const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((difference % (1000 * 60)) / 1000);

    return { days, hours, minutes, seconds, isExpired: false };
  };

  const [timeLeft, setTimeLeft] = useState<TimeRemaining>(calculateTimeRemaining());

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeRemaining());
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  const formatNumber = (num: number) => String(num).padStart(2, '0');

  return (
    <section className="relative max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 -mt-2 mb-10 overflow-hidden">
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-[#0B1120] via-[#111C30] to-[#0A0F1D] text-white p-4.5 sm:p-7 md:p-8 shadow-2xl border border-slate-800/80">
        {/* Top subtle golden hairline light */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#F4D500]/45 to-transparent pointer-events-none" />

        {/* Ambient atmospheric lighting */}
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-48 sm:w-64 h-48 sm:h-64 bg-[#F4D500]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-6 -mb-10 w-40 sm:w-56 h-40 sm:h-56 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-5 sm:gap-7">
          {/* Left Info Column */}
          <div className="flex-1 text-center lg:text-left space-y-2.5 w-full">
            {/* FOMO Urgency Pulse Badge */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-rose-500/20 to-amber-500/15 border border-rose-500/30 rounded-full text-[11px] sm:text-xs font-bold text-rose-300 tracking-wide shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
              </span>
              <Flame className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>Qeydiyyat bağlanır · Son yerlər!</span>
            </div>

            <h2 className="text-xl sm:text-3xl md:text-4xl font-serif font-bold tracking-tight text-white leading-tight">
              {nearestExam?.title || 'Buraxılış və Monitorinq Sınaq İmtahanı'}
            </h2>

            {/* Aesthetic Meta Information Chips */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 text-xs text-slate-300 pt-1">
              {nearestExam?.date && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 backdrop-blur-sm">
                  <Calendar className="w-3.5 h-3.5 text-[#F4D500] shrink-0" />
                  <span className="font-medium text-slate-200">{nearestExam.date}</span>
                </div>
              )}
              {nearestExam?.startTime && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 backdrop-blur-sm">
                  <Clock className="w-3.5 h-3.5 text-[#F4D500] shrink-0" />
                  <span className="font-medium text-slate-200">Saat {nearestExam.startTime}</span>
                </div>
              )}
              {(nearestExam?.city || nearestExam?.organizer) && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 backdrop-blur-sm">
                  <MapPin className="w-3.5 h-3.5 text-[#F4D500] shrink-0" />
                  <span className="font-medium text-slate-200">{nearestExam.city || nearestExam.organizer}</span>
                </div>
              )}
            </div>
          </div>

          {/* Center: Luxury Timepiece Countdown Dock */}
          <div className="w-full max-w-sm sm:max-w-md shrink-0">
            <div className="bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-2xl p-2.5 sm:p-3.5 shadow-inner">
              <div className="flex items-center justify-between gap-1.5 sm:gap-2">
                {/* Gün */}
                <div className="flex-1 flex flex-col items-center">
                  <div className="w-full py-2.5 sm:py-3.5 bg-gradient-to-b from-white/[0.09] to-white/[0.02] border border-white/15 rounded-xl flex items-center justify-center shadow-sm">
                    <span className="text-2xl sm:text-3xl font-extrabold text-white font-mono tabular-nums tracking-tight">
                      {formatNumber(timeLeft.days)}
                    </span>
                  </div>
                  <span className="mt-1 text-[9px] sm:text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                    Gün
                  </span>
                </div>

                <span className="text-slate-600 font-bold text-base -mt-3.5 select-none">:</span>

                {/* Saat */}
                <div className="flex-1 flex flex-col items-center">
                  <div className="w-full py-2.5 sm:py-3.5 bg-gradient-to-b from-white/[0.09] to-white/[0.02] border border-white/15 rounded-xl flex items-center justify-center shadow-sm">
                    <span className="text-2xl sm:text-3xl font-extrabold text-white font-mono tabular-nums tracking-tight">
                      {formatNumber(timeLeft.hours)}
                    </span>
                  </div>
                  <span className="mt-1 text-[9px] sm:text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                    Saat
                  </span>
                </div>

                <span className="text-slate-600 font-bold text-base -mt-3.5 select-none">:</span>

                {/* Dəqiqə */}
                <div className="flex-1 flex flex-col items-center">
                  <div className="w-full py-2.5 sm:py-3.5 bg-gradient-to-b from-white/[0.09] to-white/[0.02] border border-white/15 rounded-xl flex items-center justify-center shadow-sm">
                    <span className="text-2xl sm:text-3xl font-extrabold text-white font-mono tabular-nums tracking-tight">
                      {formatNumber(timeLeft.minutes)}
                    </span>
                  </div>
                  <span className="mt-1 text-[9px] sm:text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                    Dəqiqə
                  </span>
                </div>

                <span className="text-slate-600 font-bold text-base -mt-3.5 select-none">:</span>

                {/* Saniyə */}
                <div className="flex-1 flex flex-col items-center">
                  <div className="w-full py-2.5 sm:py-3.5 bg-gradient-to-b from-[#F4D500]/20 to-[#F4D500]/5 border border-[#F4D500]/40 rounded-xl flex items-center justify-center shadow-sm">
                    <span className="text-2xl sm:text-3xl font-extrabold text-[#F4D500] font-mono tabular-nums tracking-tight">
                      {formatNumber(timeLeft.seconds)}
                    </span>
                  </div>
                  <span className="mt-1 text-[9px] sm:text-[10px] font-bold text-[#F4D500] uppercase tracking-widest">
                    Saniyə
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Action Column */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-2.5 w-full lg:w-auto shrink-0">
            <button
              onClick={() => onApply(nearestExam || undefined)}
              className="w-full sm:w-auto px-6 py-3.5 bg-[#F4D500] hover:bg-[#E5C700] text-[#0F172A] font-bold text-sm rounded-xl transition-all shadow-[0_4px_20px_rgba(244,213,0,0.25)] hover:shadow-[0_6px_24px_rgba(244,213,0,0.35)] flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
            >
              <span>Yerini İndi Tut</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={onViewAllExams}
              className="w-full sm:w-auto px-5 py-2.5 bg-white/5 hover:bg-white/10 text-slate-200 font-medium text-xs rounded-xl transition-colors border border-white/15 flex items-center justify-center cursor-pointer active:scale-[0.98]"
            >
              Bütün İmtahanlara Bax
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
