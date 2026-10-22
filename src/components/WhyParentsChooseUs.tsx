import React from 'react';
import { ShieldCheck, FileCheck, BookOpen, Smartphone, Users } from 'lucide-react';

export const WhyParentsChooseUs: React.FC = () => {
  const pillars = [
    {
      icon: ShieldCheck,
      title: 'Tam Real İmtahan Mühiti',
      description:
        'İmtahan zalları, vaxt bölgüsü, nəzarətçi heyəti və cavab kartlarının kodlaşdırılması rəsmi dövlət imtahanı qaydalarına 100% uyğun təşkil edilir.',
    },
    {
      icon: FileCheck,
      title: 'Şəffaf və Dərhal Nəticələr',
      description:
        'İmtahan yekunlaşdıqdan dərhal sonra onlayn kabinet vasitəsilə cavabların təhlili, fənlər üzrə faizlər və toplanmış bal valideynin ixtiyarına verilir.',
    },
    {
      icon: BookOpen,
      title: 'Aktual Metodika və Suallar',
      description:
        'Bütün test tapşırıqları təcrübəli ekspert müəllimlər tərəfindən cari kurikulum və ən son DİM qəbul modellərinə əsasən xüsusi tərtib edilir.',
    },
    {
      icon: Smartphone,
      title: 'Rəqəmsal və Təhlükəsiz Sistem',
      description:
        'QR kodlu rəsmi buraxılış vərəqəsi, fərdi parta və zal bölgüsü, həmçinin imtahan detalları haqqında rahat WhatsApp bildirişi təmin edilir.',
    },
  ];

  return (
    <section className="py-16 bg-[#F5F5F0] border-y border-[#EAEAEA]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-[#E2E8F0] rounded-full text-xs font-semibold text-[#0F172A] mb-3 shadow-2xs">
            <Users className="w-3.5 h-3.5 text-[#F4D500]" />
            <span>Valideynlərin Güvən Seçimi</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-serif font-bold text-[#0F172A] tracking-tight">
            Valideynlər Niyə Bizi Seçir?
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-[#64748B] font-manrope">
            Övladınızın gələcək imtahan uğurunu təsadüfə buraxmayın — etibarlı, şəffaf və nəticəyönümlü mərkəz.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {pillars.map((pillar, idx) => {
            const Icon = pillar.icon;
            return (
              <div
                key={idx}
                className="bg-white rounded-2xl p-6 border border-[#E5E5E0] shadow-2xs hover:shadow-md transition-all hover:-translate-y-0.5 group"
              >
                <div className="w-12 h-12 rounded-xl bg-[#0F172A] text-[#F4D500] flex items-center justify-center mb-5 group-hover:scale-105 transition-transform shadow-xs">
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold font-serif text-[#0F172A] mb-2 leading-snug">
                  {pillar.title}
                </h3>
                <p className="text-xs sm:text-sm text-[#475569] leading-relaxed font-manrope">
                  {pillar.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
