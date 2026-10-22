import React from 'react';
import { Search, Ticket, Calendar, ArrowRight } from 'lucide-react';

interface QuickActionsProps {
  onCheckResults: () => void;
  onFindTicket: () => void;
  onViewExams: () => void;
}

export const QuickActions: React.FC<QuickActionsProps> = ({
  onCheckResults,
  onFindTicket,
  onViewExams
}) => {
  const cards = [
    {
      id: 'exams',
      title: 'Aktiv imtahanlar',
      desc: 'Keçiriləcək bütün buraxılış, sınaq və monitorinq imtahanlarının cədvəli və seçimi.',
      btnText: 'İmtahanlara bax və seç',
      icon: Calendar,
      action: onViewExams,
      highlight: true
    },
    {
      id: 'results',
      title: 'Nəticəni yoxla',
      desc: 'Nəticələr bazası inteqrasiya edildikdən sonra nəticə axtarışı aktivləşdiriləcək.',
      btnText: 'Nəticəyə bax',
      icon: Search,
      action: onCheckResults,
      highlight: false
    },
    {
      id: 'ticket',
      title: 'Biletimi tap',
      desc: 'Bilet axtarışı bu versiyada söndürülüb və sonrakı mərhələdə aktivləşdiriləcək.',
      btnText: 'Bileti tap',
      icon: Ticket,
      action: onFindTicket,
      highlight: false
    }
  ];

  return (
    <section className="pt-2 pb-14 sm:pt-4 sm:pb-16 bg-[#FAFAF7] border-b border-[#EAEAEA]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* 3 Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.id}
                onClick={card.action}
                className={`flex flex-col justify-between p-6 sm:p-7 rounded-2xl border transition-all duration-200 cursor-pointer group ${
                  card.highlight
                    ? 'bg-white border-[#F4D500] shadow-sm hover:shadow-md ring-1 ring-[#F4D500]/50'
                    : 'bg-white border-[#E5E5E0] hover:border-[#CBD5E1] shadow-2xs hover:shadow-xs'
                }`}
              >
                <div>
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 transition-colors ${
                      card.highlight
                        ? 'bg-[#F4D500] text-[#0F172A]'
                        : 'bg-[#FAFAF7] text-[#0F172A] group-hover:bg-[#0F172A] group-hover:text-white'
                    }`}
                  >
                    <Icon className="w-5 h-5 stroke-[1.8]" />
                  </div>

                  <h3 className="text-base sm:text-lg font-bold font-manrope text-[#0F172A] group-hover:text-black">
                    {card.title}
                  </h3>

                  <p className="mt-2 text-xs sm:text-sm text-[#64748B] leading-relaxed font-manrope min-h-[2.5rem]">
                    {card.desc}
                  </p>
                </div>

                <div className="pt-4 mt-4 border-t border-[#F1F5F9] flex items-center justify-between text-xs sm:text-sm font-bold font-manrope">
                  <span className={card.highlight ? 'text-[#0F172A]' : 'text-[#475569] group-hover:text-[#0F172A]'}>
                    {card.btnText}
                  </span>
                  <ArrowRight className="w-4 h-4 text-[#94A3B8] group-hover:translate-x-1 group-hover:text-[#0F172A] transition-all" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
