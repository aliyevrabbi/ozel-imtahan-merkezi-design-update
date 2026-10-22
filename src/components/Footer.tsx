import React from 'react';
import { WebsiteSettings } from '../types';
import { MapPin, Phone, Mail, Instagram, ArrowUpRight } from 'lucide-react';

interface FooterProps {
  settings: WebsiteSettings;
  setActiveTab: (tab: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ settings, setActiveTab }) => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[#0F172A] text-white pt-14 pb-24 sm:pb-12 border-t border-slate-800 font-manrope">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8 pb-12 border-b border-slate-800">
          {/* Brand Info */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 bg-[#F4D500] text-[#0F172A] font-bold font-serif text-lg rounded-xl">
                ÖİM
              </div>
              <div>
                <h3 className="font-serif text-lg font-bold text-white tracking-tight leading-tight">
                  {settings.brandName}
                </h3>
                <p className="text-xs text-slate-400">imtahanim.az · {settings.city}</p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed font-manrope">
              Məktəblər, kurslar və fərdi müəllimlər üçün müstəqil imtahan təşkilatçılığı.
            </p>

            <div className="pt-2">
              <a
                href={settings.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-xs font-medium text-slate-200 hover:text-white rounded-xl border border-slate-800 transition-colors"
              >
                <Instagram className="w-4 h-4 text-[#F4D500]" />
                <span>{settings.instagramHandle}</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-500" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#F4D500] font-manrope">
              Sürətli Keçidlər
            </h4>
            <ul className="space-y-2.5 text-xs sm:text-sm text-slate-300 font-manrope">
              <li>
                <button
                  onClick={() => { setActiveTab('exams'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="hover:text-[#F4D500] transition-colors cursor-pointer text-left"
                >
                  Aktiv İmtahanlar Cədvəli
                </button>
              </li>
              <li>
                <button
                  onClick={() => { setActiveTab('apply'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="hover:text-[#F4D500] transition-colors cursor-pointer text-left"
                >
                  İmtahana Müraciət Forması
                </button>
              </li>
              <li>
                <button
                  onClick={() => { setActiveTab('find-ticket'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="hover:text-[#F4D500] transition-colors cursor-pointer text-left"
                >
                  Biletimi Tap
                </button>
              </li>
              <li>
                <button
                  onClick={() => { setActiveTab('results'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="hover:text-[#F4D500] transition-colors cursor-pointer text-left"
                >
                  İmtahan Nəticələrini Yoxla
                </button>
              </li>
              <li>
                <button
                  onClick={() => { setActiveTab('about-contact'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="hover:text-[#F4D500] transition-colors cursor-pointer text-left"
                >
                  Haqqımızda və Əlaqə
                </button>
              </li>
            </ul>
          </div>

          {/* Categories */}
          <div className="space-y-4">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#F4D500] font-manrope">
              İmtahan İstiqamətləri
            </h4>
            <ul className="space-y-2 text-xs sm:text-sm text-slate-300 font-manrope">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#F4D500]"></span>
                <span>Buraxılış İmtahanları (9 və 11)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#F4D500]"></span>
                <span>Blok Fənləri Sınağı (I-IV Qruplar)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#F4D500]"></span>
                <span>Monitorinq İmtahanları</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#F4D500]"></span>
                <span>Hədiyyəli Bilik Yarışları</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#F4D500]"></span>
                <span>Fənn Olimpiada Sınaqları</span>
              </li>
            </ul>
          </div>

          {/* Contact Details */}
          <div className="space-y-4">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#F4D500] font-manrope">
              Gəncə İmtahan Mərkəzi
            </h4>
            <div className="space-y-3 text-xs sm:text-sm text-slate-300 font-manrope">
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-[#F4D500] shrink-0 mt-0.5" />
                <span>{settings.address}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-[#F4D500] shrink-0" />
                <a href={`tel:${settings.phone}`} className="hover:text-white transition-colors">
                  {settings.phone}
                </a>
              </div>
              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-[#F4D500]" />
                <span>{settings.email}</span>
              </div>
              <div className="text-xs text-slate-400 pt-1">
                İş saatları: {settings.workingHours}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div>
            © {currentYear} {settings.brandName} (Ö.İ.M.). Bütün hüquqlar qorunur.
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span>imtahanim.az · Gəncə, Azərbaycan</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
