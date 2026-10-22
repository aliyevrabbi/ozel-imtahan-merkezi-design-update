import React, { useState } from 'react';
import { Menu, X, ArrowRight, Search, FileText, Phone } from 'lucide-react';
import { WebsiteSettings } from '../types';

interface HeaderProps {
  settings: WebsiteSettings;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenApply?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  settings,
  activeTab,
  setActiveTab,
  onOpenApply
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { id: 'home', label: 'Ana səhifə' },
    { id: 'exams', label: 'Aktiv imtahanlar' },
    { id: 'find-ticket', label: 'Biletimi tap' },
    { id: 'results', label: 'Nəticəni yoxla' },
    { id: 'about-contact', label: 'Mərkəz haqqında' },
  ];

  const handleNav = (tabId: string) => {
    setActiveTab(tabId);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-[#FAFAF7] border-b border-[#EAEAEA]">
      {/* Top Academic Micro Bar */}
      <div className="bg-[#0F172A] text-[#EAEAEA] text-[11px] py-1.5 px-4 hidden sm:block">
        <div className="max-w-7xl mx-auto flex items-center justify-between font-manrope">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#F4D500]"></span>
            <span className="text-slate-300">
              imtahanim.az · Gəncə, Azərbaycan
            </span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Əlaqə: {settings.phone}</span>
            <span className="text-slate-700">|</span>
            <span>İş saatları: {settings.workingHours}</span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">

          {/* Logo & Brand Identity */}
          <button
            onClick={() => handleNav('home')}
            className="flex items-center gap-3 group text-left cursor-pointer focus-visible:outline-none"
          >
            <div className="flex items-center justify-center w-10 h-10 bg-[#0F172A] rounded-xl border border-slate-800 shadow-sm transition-transform group-hover:scale-105">
              <span className="text-base font-serif font-bold text-[#F4D500] tracking-tight">
                ÖİM
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-bold tracking-tight text-[#0F172A] font-manrope leading-tight flex items-center gap-0.5">
                <span>imtahanim</span><span className="text-[#D97706]">.az</span>
              </span>
              <span className="text-[11px] text-[#64748B] font-medium font-manrope tracking-wide">
                Gəncə, Azərbaycan
              </span>
            </div>
          </button>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map(item => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNav(item.id)}
                  className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer font-manrope ${
                    isActive
                      ? 'text-[#171717] bg-black/5 font-bold'
                      : 'text-[#777777] hover:text-[#171717] hover:bg-black/[0.02]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Desktop Actions */}
          <div className="hidden lg:flex items-center gap-3">
            <button
              onClick={() => handleNav('exams')}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-[#0F172A] bg-[#F4D500] hover:bg-[#E5C700] active:scale-[0.98] rounded-xl shadow-xs transition-transform cursor-pointer font-manrope"
            >
              <span>Aktiv imtahanlar</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Mobile Hamburger Button */}
          <div className="flex items-center lg:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-[#0F172A] hover:bg-neutral-100 rounded-lg focus:outline-none cursor-pointer"
              aria-label="Menyu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-b border-[#EAEAEA] bg-[#FCFAF5] px-5 pt-3 pb-6 space-y-3">
          <div className="grid grid-cols-1 gap-1">
            {navItems.map(item => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNav(item.id)}
                  className={`w-full text-left px-3.5 py-3 text-sm font-semibold rounded-xl transition-colors flex items-center justify-between font-manrope cursor-pointer ${
                    isActive ? 'bg-[#F4D500]/20 text-black font-bold' : 'text-neutral-700 hover:bg-black/5'
                  }`}
                >
                  <span>{item.label}</span>
                  <ArrowRight className="w-4 h-4 text-neutral-400" />
                </button>
              );
            })}
          </div>

          <div className="pt-3 border-t border-[#EAEAEA] space-y-2">
            <button
              onClick={() => {
                handleNav('exams');
              }}
              className="w-full flex items-center justify-center gap-2 py-3 bg-[#F4D500] hover:bg-[#E5C700] text-black font-bold rounded-xl text-sm font-manrope shadow-2xs cursor-pointer"
            >
              <span>Aktiv imtahanlara bax</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => handleNav('find-ticket')}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-white border border-[#EAEAEA] text-neutral-800 font-semibold rounded-xl text-xs font-manrope"
            >
              <FileText className="w-4 h-4 text-neutral-500" />
              <span>Biletimi tap</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
