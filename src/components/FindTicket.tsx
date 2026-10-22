import React from 'react';
import { Search } from 'lucide-react';

export const FindTicket: React.FC = () => (
  <div className="py-14 sm:py-20 bg-[#FCFAF5] min-h-screen">
    <div className="max-w-xl mx-auto px-4 sm:px-6">
      <section className="bg-white rounded-3xl border border-[#EAEAEA] shadow-sm p-7 sm:p-10">
        <header className="text-center mb-8">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-400 font-manrope block mb-2">Bilet Bərpası</span>
          <h2 className="text-3xl font-bold font-serif text-[#171717]">Biletimi tap</h2>
          <p className="text-xs sm:text-sm text-[#666666] mt-2 font-manrope">Bilet bərpası təhlükəsiz axtarışla Phase 7-də aktivləşdiriləcək.</p>
        </header>
        <form onSubmit={(event) => event.preventDefault()} className="space-y-4 font-manrope" aria-label="Bilet axtarışı">
          <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700">
            Müraciət / İş Nömrəsi
            <input disabled type="text" placeholder="Phase 7-də aktiv olacaq" className="mt-1.5 w-full text-sm font-mono p-3.5 bg-[#FCFAF5] border border-[#EAEAEA] rounded-xl disabled:cursor-not-allowed disabled:opacity-60" />
          </label>
          <div className="relative flex py-1 items-center"><div className="flex-grow border-t border-neutral-100" /><span className="flex-shrink mx-3 text-xs text-neutral-400">və ya</span><div className="flex-grow border-t border-neutral-100" /></div>
          <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700">
            Telefon Nömrəsi
            <input disabled type="tel" placeholder="Phase 7-də aktiv olacaq" className="mt-1.5 w-full text-sm p-3 bg-[#FCFAF5] border border-[#EAEAEA] rounded-xl disabled:cursor-not-allowed disabled:opacity-60" />
          </label>
          <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700">
            Şagird Soyadı
            <input disabled type="text" placeholder="Phase 7-də aktiv olacaq" className="mt-1.5 w-full text-sm p-3 bg-[#FCFAF5] border border-[#EAEAEA] rounded-xl disabled:cursor-not-allowed disabled:opacity-60" />
          </label>
          <button disabled type="submit" className="w-full py-3.5 bg-[#F4D500] text-black font-bold text-sm rounded-xl flex items-center justify-center gap-2 cursor-not-allowed opacity-60">
            <Search className="w-4 h-4" /><span>Bileti axtar</span>
          </button>
        </form>
        <p role="status" className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 font-manrope">Bilet axtarışı Phase 7-də aktivləşdiriləcək. Demo şagird biletləri bu versiyadan çıxarılıb.</p>
      </section>
    </div>
  </div>
);
