import React, { useEffect, useLayoutEffect, useState } from 'react';
import { resolveProtectedRoute } from './auth/adminRoutes';
import { getSettings, getBuildings } from './services/storageService';
import { loadPublishedExams } from './services/examService';
import { WebsiteSettings, Exam, Building } from './types';
import { AdminAuthRoute } from './auth/AdminAuthRoute';
import TicketLinkPage from './components/TicketLinkPage';
import { getTicketPathToken } from './services/ticketService';
import { AuthProvider } from './auth/AuthProvider';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { Hero } from './components/Hero';
import { QuickActions } from './components/QuickActions';
import { ActiveExams } from './components/ActiveExams';
import { ExamDetailsModal } from './components/ExamDetailsModal';
import { ApplicationForm } from './components/ApplicationForm';
import { FindTicket } from './components/FindTicket';
import { CheckResults } from './components/CheckResults';
import { WhatsAppButton } from './components/WhatsAppButton';
import { MobileBottomNav } from './components/MobileBottomNav';
import { InfoSections } from './components/InfoSections';
import { NearestExamCountdown } from './components/NearestExamCountdown';
import { StudentTestimonialsMarquee } from './components/StudentTestimonialsMarquee';
import { WhyParentsChooseUs } from './components/WhyParentsChooseUs';
import { WiseQuoteSection } from './components/WiseQuoteSection';

function PublicApp() {
  const [settings] = useState<WebsiteSettings>(getSettings());
  const [exams, setExams] = useState<Exam[]>([]);
  const [examsLoading, setExamsLoading] = useState(true);
  const [examLoadError, setExamLoadError] = useState(false);
  const [buildings] = useState<Building[]>(getBuildings());

  useEffect(() => {
    let active = true;
    void loadPublishedExams()
      .then((publishedExams) => {
        if (active) setExams(publishedExams);
      })
      .catch(() => {
        if (active) setExamLoadError(true);
      })
      .finally(() => {
        if (active) setExamsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Navigation tab
  const [activeTab, setActiveTab] = useState<string>('home');

  useLayoutEffect(() => {
    if (activeTab === 'apply') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [activeTab]);

  // Modals & Flows
  const [selectedExamForModal, setSelectedExamForModal] = useState<Exam | null>(null);
  const [selectedExamForApply, setSelectedExamForApply] = useState<Exam | null>(null);

  const handleOpenApply = (exam?: Exam) => {
    if (exam) {
      setSelectedExamForApply(exam);
    } else {
      setSelectedExamForApply(exams.find((e) => e.status === 'open') || null);
    }
    setActiveTab('apply');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAF7] text-[#0F172A] font-manrope">
      {/* Sticky Header */}
      <Header
        settings={settings}
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
        }}
        onOpenApply={() => handleOpenApply()}
      />

      {/* Main Content Area: Multi-view separated by navigation */}
      <main className="flex-1 pb-24 sm:pb-0">
        {/* VIEW 1: HOME (Focused, Uncluttered, Breathable, Fast) */}
        {activeTab === 'home' && (
          <div className="fade-in-light space-y-2">
            {/* Hero Section */}
            <Hero settings={settings} />

            {/* Nearest Exam Dynamic Countdown (Hero-nun dərhal altında) */}
            <NearestExamCountdown
              exams={exams}
              onApply={(exam) => handleOpenApply(exam)}
              onViewAllExams={() => {
                setActiveTab('exams');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />

            {/* Quick Actions Bar */}
            <QuickActions
              onCheckResults={() => {
                setActiveTab('results');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onFindTicket={() => {
                setActiveTab('find-ticket');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onViewExams={() => {
                setActiveTab('exams');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />

            {/* Why Parents Choose Us Section */}
            <WhyParentsChooseUs />

            {/* Student & Graduate Testimonials Marquee Loop */}
            <StudentTestimonialsMarquee />
          </div>
        )}

        {/* VIEW 2: ACTIVE EXAMS (Dedicated Page with full categories and filters) */}
        {activeTab === 'exams' && (
          <div className="fade-in-light">
            {examLoadError && (
              <p
                role="alert"
                className="mx-auto mb-6 max-w-3xl rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
              >
                İmtahan məlumatlarını yükləmək mümkün olmadı. Zəhmət olmasa bir az sonra yenidən cəhd edin.
              </p>
            )}
            {examsLoading && (
              <p role="status" className="mx-auto mb-6 max-w-3xl p-4 text-center text-sm text-slate-600">
                İmtahanlar yüklənir...
              </p>
            )}
            <ActiveExams
              exams={exams}
              onSelectExam={(exam) => setSelectedExamForModal(exam)}
              onApplyForExam={(exam) => handleOpenApply(exam)}
            />
          </div>
        )}

        {/* VIEW 3: APPLICATION FORM / PENDING PAYMENT VIEW */}
        {activeTab === 'apply' && (
          <div className="fade-in-light">
            <ApplicationForm
              exams={exams}
              selectedExam={selectedExamForApply}
              settings={settings}
              onCancel={() => setActiveTab('home')}
            />
          </div>
        )}

        {/* VIEW 4: FIND TICKET */}
        {activeTab === 'find-ticket' && (
          <div className="fade-in-light">
            <FindTicket />
          </div>
        )}

        {/* VIEW 5: CHECK RESULTS */}
        {activeTab === 'results' && (
          <div className="fade-in-light">
            <CheckResults settings={settings} />
          </div>
        )}

        {/* VIEW 6: ABOUT & CONTACT */}
        {activeTab === 'about-contact' && (
          <div className="fade-in-light">
            <InfoSections
              settings={settings}
              onOpenApply={() => handleOpenApply()}
            />
          </div>
        )}
      </main>

      {/* Exam Details Modal */}
      <ExamDetailsModal
        exam={selectedExamForModal}
        buildings={buildings}
        onClose={() => setSelectedExamForModal(null)}
        onApply={(exam) => {
          setSelectedExamForModal(null);
          handleOpenApply(exam);
        }}
      />

      {/* Educational Wisdom / Quote Section at the very bottom */}
      <WiseQuoteSection />

      {/* Floating WhatsApp Button */}
      <WhatsAppButton settings={settings} />

      {/* Ultra-Responsive Clean Mobile Bottom Navigation */}
      <MobileBottomNav
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
        }}
      />

      {/* Footer */}
      <Footer
        settings={settings}
        setActiveTab={(tab) => {
          setActiveTab(tab);
        }}
      />
    </div>
  );
}

export default function App() {
  const ticketToken = getTicketPathToken(window.location.pathname);
  if (ticketToken) return <TicketLinkPage token={ticketToken} />;

  const protectedRoute = resolveProtectedRoute(window.location.pathname);
  if (protectedRoute) {
    return (
      <AuthProvider>
        <AdminAuthRoute route={protectedRoute} />
      </AuthProvider>
    );
  }

  return <PublicApp />;
}
