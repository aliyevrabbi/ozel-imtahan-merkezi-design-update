import React from 'react';
import { WebsiteSettings } from '../types';

interface HeroProps {
  settings: WebsiteSettings;
}

export const Hero: React.FC<HeroProps> = ({ settings }) => {
  return (
    <section className="relative overflow-hidden pt-12 pb-4 sm:pt-16 sm:pb-6 bg-[#FAFAF7]">
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4">
        {/* Playfair Display Serif Headline - Enlarged and punchy on mobile */}
        <h1 className="text-[2.15rem] sm:text-5xl lg:text-6xl font-bold font-serif text-[#0F172A] tracking-tight leading-[1.18] sm:leading-[1.14]">
          {settings.heroTitle || 'Sənin uğur yolun — Özəl İmtahan Mərkəzindən keçir.'}
        </h1>

        {/* Calm Academic Subtext */}
        <p className="text-sm sm:text-base md:text-lg text-[#475569] max-w-2xl mx-auto leading-relaxed font-manrope font-normal">
          {settings.heroSubtext || 'Ö.İ.M. buraxılış, sınaq, monitorinq və fənn üzrə imtahanlar təşkil edir. İmtahanlara bax, müraciət göndər və qeydiyyat nömrəni al. Bilet və nəticə xidmətləri sonrakı mərhələdə aktivləşdiriləcək.'}
        </p>
      </div>
    </section>
  );
};
