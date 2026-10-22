import React from 'react';
import { BookOpen } from 'lucide-react';

export const WiseQuoteSection: React.FC = () => {
  return (
    <section className="relative py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-[#FAFAF7] to-[#F1F1EB] border-t border-[#EAEAEA]">
      <div className="max-w-4xl mx-auto text-center space-y-4">
        {/* Decorative feather / book icon */}
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#0F172A] text-[#F4D500] mx-auto shadow-xs">
          <BookOpen className="w-5 h-5" />
        </div>

        {/* Serif Quote */}
        <blockquote className="relative">
          <p className="text-xl sm:text-2xl md:text-3xl font-serif italic font-medium text-[#0F172A] leading-relaxed tracking-tight max-w-3xl mx-auto">
            “Qüvvət elmdədir, başqa cür heç kəs,
            <br className="hidden sm:inline" />
            {' '}Heç kəsə üstünlük eyləyə bilməz.”
          </p>
          <footer className="mt-4 flex flex-col items-center justify-center">
            <div className="h-0.5 w-12 bg-[#F4D500] mb-2" />
            <cite className="text-sm sm:text-base font-serif font-bold text-[#1E293B] not-italic">
              Nizami Gəncəvi
            </cite>
            <span className="text-xs text-[#64748B] font-manrope">
              Böyük Azərbaycan mütəfəkkiri və şairi
            </span>
          </footer>
        </blockquote>
      </div>
    </section>
  );
};
