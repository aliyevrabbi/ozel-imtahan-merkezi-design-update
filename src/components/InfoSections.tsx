import React from 'react';
import { WebsiteSettings } from '../types';
import { MapPin, Phone, Mail, Instagram, ShieldCheck, CheckCircle2, Clock, ArrowRight } from 'lucide-react';

interface InfoSectionsProps {
  settings: WebsiteSettings;
  onOpenApply: () => void;
}

export const InfoSections: React.FC<InfoSectionsProps> = ({ settings, onOpenApply }) => {
  return (
    <div className="space-y-16 py-12 bg-[#FCFAF5] min-h-screen">

      {/* 1. Haqqımızda & Niyə Ö.İ.M.? */}
      <section id="haqqimizda" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-3xl border border-[#EAEAEA] p-8 sm:p-12 shadow-sm">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">

            <div className="lg:col-span-7 space-y-5">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-400 font-manrope block">
                Müstəqil İmtahan İnstitutu
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold font-serif text-[#171717] tracking-tight">
                {settings.brandName} haqqında
              </h2>
              <p className="text-sm sm:text-base text-[#555555] leading-relaxed font-manrope font-normal">
                {settings.aboutText}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 text-xs text-[#242424] font-manrope">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#F4D500] shrink-0" />
                  <span>Dövlət İmtahan Mərkəzi (DİM) standartı</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#F4D500] shrink-0" />
                  <span>Nəticə xidmətləri sonrakı mərhələdə aktivləşdiriləcək</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#F4D500] shrink-0" />
                  <span>İmtahan məkanı barədə məlumat dərc edilmiş elanda göstərilir</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#F4D500] shrink-0" />
                  <span>Bilet təyinatı bu mərhələdə aktiv deyil</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 bg-[#171717] text-white p-7 sm:p-8 rounded-3xl space-y-4 shadow-md border-t-2 border-[#F4D500]">
              <span className="text-[11px] uppercase font-bold text-[#F4D500] font-manrope tracking-wider block">
                Ö.İ.M. Akademik Prinsipləri
              </span>
              <h3 className="text-xl font-bold font-serif text-white">
                Obyektivlik və Real İmtahan Mühiti
              </h3>
              <p className="text-xs text-neutral-300 leading-relaxed font-manrope font-normal">
                Şagirdlərin imtahana psixoloji adaptasiyası, vaxtı düzgün idarə etməsi və cavab kartları ilə iş vərdişləri qazanması üçün ən müasir şərait yaradılıb.
              </p>
              <div className="pt-2 flex items-center gap-3 font-manrope">
                <div className="p-3.5 bg-white/5 rounded-2xl text-center flex-1 border border-white/5">
                  <span className="block text-xl font-bold font-serif text-[#F4D500]">100%</span>
                  <span className="text-[10px] text-neutral-400">Obyektiv Yoxlama</span>
                </div>
                <div className="p-3.5 bg-white/5 rounded-2xl text-center flex-1 border border-white/5">
                  <span className="block text-xl font-bold font-serif text-[#F4D500]">24 Saat</span>
                  <span className="text-[10px] text-neutral-400">Onlayn Nəticə</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 2. Kurslar və Müəllimlər üçün Əməkdaşlıq */}
      <section id="emekdasliq" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-[#171717] text-white rounded-3xl p-8 sm:p-12 shadow-sm border border-neutral-800">
          <div className="max-w-3xl space-y-4">
            <span className="text-[11px] uppercase font-bold text-[#F4D500] font-manrope tracking-wider block">
              Tərəfdaşlıq Proqramı
            </span>
            <h2 className="text-2xl sm:text-4xl font-bold font-serif text-white tracking-tight">
              Kurslar, Müəllimlər və Məktəblər üçün İmtahan Tərəfdaşlığı
            </h2>
            <p className="text-sm sm:text-base text-neutral-300 leading-relaxed font-manrope">
              {settings.partnershipText} Şagirdlərinizin bilik səviyyəsini müstəqil imtahan təşkilatçılığı üzrə əməkdaşlıqla dəyərləndirin.
            </p>
            <div className="pt-2">
              <a
                href={`https://wa.me/${settings.whatsappPhone}?text=${encodeURIComponent('Salam. Kursumuz üçün imtahan əməkdaşlığı ilə bağlı məlumat almaq istəyirik.')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3.5 bg-[#F4D500] hover:bg-[#FFD900] text-black font-bold font-manrope rounded-xl text-sm transition-all shadow-xs"
              >
                <span>Əməkdaşlıq üçün müraciət et</span>
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Əlaqə və Məkan (Gəncə) */}
      <section id="elaqe" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-3xl border border-[#EAEAEA] p-8 sm:p-12 shadow-sm">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            <div className="space-y-6">
              <div>
                <span className="text-[11px] uppercase font-bold text-[#171717] bg-[#FCFAF5] border border-[#EAEAEA] px-3 py-1 rounded-md font-manrope">
                  Bizimlə Əlaqə
                </span>
                <h2 className="text-2xl sm:text-3xl font-bold font-serif text-[#171717] mt-3">
                  Gəncə İmtahan Mərkəzi
                </h2>
                <p className="text-xs sm:text-sm text-[#666666] mt-1 font-manrope">
                  İmtahan qeydiyyatı, biletlər və ya əməkdaşlıq suallarınız üçün bizimlə əlaqə saxlayın.
                </p>
              </div>

              <div className="space-y-4 text-xs sm:text-sm text-[#242424] font-manrope">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#FCFAF5] border border-[#EAEAEA] flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4 text-[#F4D500]" />
                  </div>
                  <div>
                    <strong className="block text-neutral-900 font-semibold">Məkan:</strong>
                    <span className="text-neutral-600">{settings.address}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#FCFAF5] border border-[#EAEAEA] flex items-center justify-center shrink-0">
                    <Phone className="w-4 h-4 text-[#F4D500]" />
                  </div>
                  <div>
                    <strong className="block text-neutral-900 font-semibold">Telefon:</strong>
                    <a href={`tel:${settings.phone}`} className="hover:underline text-neutral-600">
                      {settings.phone}
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#FCFAF5] border border-[#EAEAEA] flex items-center justify-center shrink-0">
                    <Clock className="w-4 h-4 text-[#F4D500]" />
                  </div>
                  <div>
                    <strong className="block text-neutral-900 font-semibold">İş Saatları:</strong>
                    <span className="text-neutral-600">{settings.workingHours}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#FCFAF5] border border-[#EAEAEA] flex items-center justify-center shrink-0">
                    <Instagram className="w-4 h-4 text-[#F4D500]" />
                  </div>
                  <div>
                    <strong className="block text-neutral-900 font-semibold">Rəsmi Instagram:</strong>
                    <a href={settings.instagramUrl} target="_blank" rel="noopener noreferrer" className="text-black font-bold hover:underline">
                      {settings.instagramHandle}
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Visual Location Card */}
            <div className="bg-[#FCFAF5] rounded-3xl p-6 sm:p-7 border border-[#EAEAEA] flex flex-col justify-between space-y-4">
              <div>
                <span className="text-[11px] uppercase font-bold text-neutral-400 font-manrope block mb-1">
                  Mərkəzin Xəritəsi
                </span>
                <h3 className="font-bold font-serif text-lg text-neutral-900">
                  Gəncə İmtahan Korpusu
                </h3>
                <p className="text-xs text-[#666666] mt-1 font-manrope">
                  Nəqliyyat qovşaqlarına yaxın və rahat çatıla bilən ərazidə yerləşir.
                </p>
              </div>

              <div className="h-44 bg-neutral-200 rounded-2xl overflow-hidden relative flex items-center justify-center border border-neutral-300">
                <div className="text-center p-4">
                  <MapPin className="w-8 h-8 text-[#171717] mx-auto mb-1 animate-bounce" />
                  <span className="font-bold text-xs text-neutral-900 font-manrope block">
                    {settings.city}
                  </span>
                  <span className="text-[10px] text-neutral-500 font-manrope">
                    Xəritədə baxmaq üçün klikləyin
                  </span>
                </div>
                <a
                  href={settings.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute inset-0"
                  aria-label="Google Maps-də aç"
                />
              </div>

              <a
                href={settings.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 bg-white hover:bg-neutral-100 text-neutral-900 text-center font-bold font-manrope text-xs rounded-xl border border-[#EAEAEA] transition-colors cursor-pointer"
              >
                Google Maps-də Marşrut Aç &rarr;
              </a>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
};
