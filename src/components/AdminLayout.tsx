import React, { useState } from 'react';
import { LogOut, ShieldCheck } from 'lucide-react';
import { getVisibleAdminSections, type AdminSectionKey } from '../admin/adminNavigation';
import type { AdminArea } from '../auth/adminRoutes';
import type { AppRole } from '../types';
import { ApplicationReviewPanel } from './ApplicationReviewPanel';
import { ExamManagementPanel } from './ExamManagementPanel';
import { FacilityManagementPanel } from './FacilityManagementPanel';
import {
  AuditSection,
  DashboardSection,
  ExamsSection,
  SettingsSection,
  TicketsSection,
} from './AdminSections';

interface AdminLayoutProps {
  area: AdminArea;
  role: AppRole;
  onSignOut: () => void;
}

export function AdminLayout({ area, role, onSignOut }: AdminLayoutProps) {
  const sections = getVisibleAdminSections(role);
  const [requested, setRequested] = useState<AdminSectionKey>('dashboard');
  const active = sections.find((section) => section.key === requested)?.key ?? sections[0]?.key;

  return (
    <div className="min-h-screen bg-[#FAFAF7] font-manrope lg:flex">
      <aside className="border-b border-[#EAEAEA] bg-white lg:min-h-screen lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="px-4 pb-2 pt-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#D97706]">Özəl İmtahan Mərkəzi</p>
          <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-[#0F172A]">
            <ShieldCheck className="h-4 w-4 text-[#0F172A]" aria-hidden="true" />
            {area === 'admin' ? 'Admin paneli' : 'Operator paneli'} · {role}
          </p>
        </div>
        <nav aria-label="Admin menyusu" className="flex gap-2 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible">
          {sections.map((section) => {
            const isActive = section.key === active;
            return (
              <button
                key={section.key}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => setRequested(section.key)}
                className={`min-h-11 shrink-0 whitespace-nowrap rounded-xl px-3 text-left text-sm font-semibold transition ${isActive ? 'bg-[#0F172A] text-white' : 'text-[#334155] hover:bg-neutral-100'}`}
              >
                {section.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={onSignOut}
            aria-label="Hesabdan çıxış et"
            className="inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-[#E5E5E0] px-3 text-sm font-semibold text-[#334155] hover:bg-neutral-50 lg:mt-4"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" /> Çıxış
          </button>
        </nav>
      </aside>

      <main className="min-w-0 flex-1 px-3 py-5 sm:px-6 sm:py-8">
        <div className="mx-auto max-w-6xl">
          {active === undefined ? (
            <section role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
              Bu rol üçün admin bölmələri aktiv deyil. Təhlükəsizlik üçün yalnız icazəli rollara bölmələr göstərilir.
            </section>
          ) : (
            <SectionContent sectionKey={active} area={area} role={role} />
          )}
        </div>
      </main>
    </div>
  );
}

function SectionContent({ sectionKey, area, role }: { sectionKey: AdminSectionKey; area: AdminArea; role: AppRole }) {
  switch (sectionKey) {
    case 'dashboard': return <DashboardSection role={role} />;
    case 'exams': return <ExamManagementPanel role={role} />;
    case 'applications': return <ApplicationReviewPanel area={area} role={role} />;
    case 'facilities': return <FacilityManagementPanel role={role} />;
    case 'seating': return <ExamsSection role={role} />;
    case 'tickets': return <TicketsSection />;
    case 'audit': return <AuditSection role={role} />;
    case 'settings': return <SettingsSection />;
    default: return null;
  }
}
