import React from 'react';
import { Star, Award } from 'lucide-react';

interface Testimonial {
  id: string;
  name: string;
  school: string;
  score: string;
  faculty: string;
  comment: string;
}

const testimonials: Testimonial[] = [
  {
    id: '1',
    name: 'Fərid Məmmədov',
    school: 'Gəncə şəhər M.Müşfiq adına 14 saylı məktəb',
    score: '658 bal',
    faculty: 'Bakı Dövlət Universiteti — Hüquqşünaslıq',
    comment:
      'Ö.İ.M.-in sınaq imtahanlarında sualların səviyyəsi və auditoriya nizam-intizamı dövlət qəbul imtahanından heç fərqlənmirdi. Nəticəmi dərhal onlayn yoxlamaq mənə zəif nöqtələrimi tez aradan qaldırmağa kömək etdi.',
  },
  {
    id: '2',
    name: 'Ayan Qasımova',
    school: 'Gəncə Fizika-Riyaziyyat Təmayüllü Lisey',
    score: '632 bal',
    faculty: 'ADA Universiteti — Kompüter Mühəndisliyi',
    comment:
      'QR kodlu bilet və fərdi yer ayrılması imtahan günü həyəcanı sıfıra endirdi. İmtahan zalındakı akustika və nəzarət yüksək səviyyədə idi. Hər kəsə tövsiyə edirəm.',
  },
  {
    id: '3',
    name: 'Murad Əliyev',
    school: 'Gəncə şəhər 4 saylı tam orta məktəb',
    score: '674 bal',
    faculty: 'Azərbaycan Tibb Universiteti — Müalicə İşi',
    comment:
      'Buraxılış və fənn sınaqlarında iştirak edərək vaxtı düzgün idarə etməyi öyrəndim. Suallar tam DİM formatında hazırlanmışdı. Yüksək bal toplamağımda böyük rolu oldu.',
  },
  {
    id: '4',
    name: 'Leyla İsmayılova',
    school: 'Gəncə şəhər İ.Qayıbov adına 1 saylı məktəb',
    score: '618 bal',
    faculty: 'UNEC — Maliyyə və Vergi',
    comment:
      'Qeydiyyatdan keçmək çox rahat idi, WhatsApp vasitəsilə bildiriş gəldi və zal nömrəm dəqiq göstərilmişdi. Bütün proses şəffaf və peşəkar təşkil olunub.',
  },
  {
    id: '5',
    name: 'Tural Həsənov',
    school: 'Gəncə şəhər 27 saylı məktəb-lisey',
    score: '645 bal',
    faculty: 'ADNSU — İnformasiya Təhlükəsizliyi',
    comment:
      'Riyaziyyat və ingilis dili suallarının dəqiqliyi xüsusilə diqqətimi çəkdi. Hər ay sınaqlarda iştirak edərək balımın necə artdığını aydın gördüm.',
  },
  {
    id: '6',
    name: 'Nərgiz Rəhimova',
    school: 'Samux rayon Alıuşağı kənd məktəbi',
    score: '625 bal',
    faculty: 'Dillər Universiteti — Tərcümə',
    comment:
      'Gəncədə belə nizamlı, rəsmi atmosferə malik mərkəzin olması bölgə şagirdləri üçün böyük şansdır. İmtahan nəticə vərəqində fənlər üzrə faizlərin göstərilməsi çox faydalı idi.',
  },
];

export const StudentTestimonialsMarquee: React.FC = () => {
  // Duplicate array 3 times for a flawless, smooth infinite marquee loop
  const marqueeItems = [...testimonials, ...testimonials, ...testimonials];

  return (
    <section className="relative py-14 overflow-hidden bg-[#FAFAF7]">
      {/* Self-contained CSS for seamless 60fps marquee loop */}
      <style>{`
        @keyframes customMarqueeLoop {
          0% {
            transform: translate3d(0, 0, 0);
          }
          100% {
            transform: translate3d(-33.333333%, 0, 0);
          }
        }
        .testimonials-marquee-track {
          display: flex;
          width: max-content;
          animation: customMarqueeLoop 36s linear infinite;
          will-change: transform;
        }
        .testimonials-marquee-track:hover {
          animation-play-state: paused;
        }
      `}</style>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center mb-8">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200/80 rounded-full text-xs font-semibold text-amber-900 mb-3 shadow-2xs">
          <Award className="w-3.5 h-3.5 text-amber-600" />
          <span>Şagirdlərimizin Nəticələri</span>
        </div>
        <h2 className="text-2xl sm:text-4xl font-serif font-bold text-[#0F172A] tracking-tight">
          Şagird və Məzun Rəyləri
        </h2>
        <p className="mt-2 text-xs sm:text-sm text-[#64748B] max-w-xl mx-auto font-manrope">
          Ö.İ.M. sınaq imtahanlarında biliklərini sınaqdan keçirərək tələbə adını qazanmış məzunlarımızın təəssüratları.
        </p>
      </div>

      {/* Infinite loop marquee with edge gradient scrims */}
      <div className="relative w-full max-w-full overflow-hidden py-2">
        {/* Left & Right gradient scrims */}
        <div className="absolute left-0 top-0 bottom-0 w-8 sm:w-20 bg-gradient-to-r from-[#FAFAF7] to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-8 sm:w-20 bg-gradient-to-l from-[#FAFAF7] to-transparent z-10 pointer-events-none" />

        <div className="testimonials-marquee-track flex gap-4 sm:gap-5">
          {marqueeItems.map((item, idx) => (
            <div
              key={`${item.id}-${idx}`}
              className="w-[280px] sm:w-[360px] shrink-0 bg-white border border-[#EAEAEA] rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-md transition-all hover:border-slate-300 flex flex-col justify-between select-none"
            >
              <div>
                {/* Header: Score badge and stars */}
                <div className="flex items-center justify-between gap-3 mb-2.5">
                  <div className="flex items-center gap-1 text-[#F4D500]">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 fill-[#F4D500]" />
                    ))}
                  </div>

                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#0F172A] text-[#F4D500] font-mono">
                    {item.score}
                  </span>
                </div>

                {/* Comment */}
                <p className="text-xs sm:text-sm text-[#334155] leading-relaxed italic line-clamp-4 font-manrope">
                  "{item.comment}"
                </p>
              </div>

              {/* Author footer */}
              <div className="mt-4 pt-3 border-t border-[#F1F5F9] flex items-center gap-3">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#0F172A] text-[#F4D500] font-bold text-xs flex items-center justify-center shrink-0">
                  {item.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs sm:text-sm font-bold text-[#0F172A] truncate">
                    {item.name}
                  </h4>
                  <p className="text-[11px] text-[#64748B] truncate">
                    {item.faculty}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
