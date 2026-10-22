import React from 'react';
import { Home, Calendar, Ticket, Search } from 'lucide-react';

interface MobileBottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  setActiveTab,
}) => {
  const navItems = [
    { id: 'home', label: 'Ana səhifə', icon: Home, action: () => setActiveTab('home') },
    { id: 'exams', label: 'İmtahanlar', icon: Calendar, action: () => setActiveTab('exams') },
    { id: 'find-ticket', label: 'Bilet tap', icon: Ticket, action: () => setActiveTab('find-ticket') },
    { id: 'results', label: 'Nəticələr', icon: Search, action: () => setActiveTab('results') },
  ];

  return (
    <nav className="sm:hidden fixed bottom-3 left-3 right-3 z-40 max-w-sm mx-auto no-print">
      <div className="bg-[#0F172A]/92 backdrop-blur-xl border border-white/15 rounded-full p-1.5 shadow-2xl shadow-black/40">
        <div className="grid grid-cols-4 gap-1 items-center">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  item.action();
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-full transition-all duration-200 cursor-pointer min-h-[46px] active:scale-95 ${
                  isActive
                    ? 'bg-[#F4D500] text-[#0F172A] font-extrabold shadow-sm'
                    : 'text-slate-300 hover:text-white font-medium hover:bg-white/5'
                }`}
              >
                <Icon
                  className={`w-4 h-4 mb-0.5 transition-transform ${
                    isActive ? 'stroke-[2.4] scale-110 text-[#0F172A]' : 'stroke-[1.8]'
                  }`}
                />
                <span className="text-[10px] font-manrope tracking-tight leading-none">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
