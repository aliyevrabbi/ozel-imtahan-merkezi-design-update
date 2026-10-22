import React from 'react';
import { LockKeyhole, ShieldAlert } from 'lucide-react';

export const AdminPanel: React.FC = () => (
  <main className="min-h-screen bg-[#FAFAF7] px-4 py-16 flex items-center justify-center font-manrope">
    <section className="w-full max-w-xl rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-sm space-y-5">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
        <ShieldAlert className="h-8 w-8" />
      </div>
      <h1 className="font-serif text-2xl font-bold text-[#0F172A]">İdarəetmə əməliyyatları deaktivdir</h1>
      <p className="text-sm leading-relaxed text-[#475569]">
        Phase 1 yalnız Supabase Auth, rollar və verilənlər bazasının təhlükəsiz təməlini hazırlayır. Admin əməliyyat paneli hələ RLS ilə qorunan server/baza əməliyyatlarına qoşulmayıb.
      </p>
      <div className="flex items-start gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-left text-xs text-neutral-700">
        <LockKeyhole className="h-5 w-5 shrink-0 text-neutral-500" />
        <span>Brauzer əsaslı giriş, SQL kopyalama/qurulum UI-si, nəticə faylı idxalı və demo şəxsi məlumatlar çıxarılıb.</span>
      </div>
      <a href="/" className="inline-flex rounded-xl bg-[#0F172A] px-5 py-3 text-sm font-bold text-white">Ana səhifəyə qayıt</a>
    </section>
  </main>
);
