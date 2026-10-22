import React from 'react';
import { Search } from 'lucide-react';
import { WebsiteSettings } from '../types';

interface CheckResultsProps {
  settings: WebsiteSettings;
}

export const CheckResults: React.FC<CheckResultsProps> = ({ settings }) => (
  <div className="py-14 sm:py-20 bg-[#FCFAF5] min-h-screen">
    <div className="max-w-3xl mx-auto px-4 sm:px-6">
      <section className="bg-white rounded-3xl border border-[#EAEAEA] shadow-sm p-7 sm:p-10">
        <div className="text-center mb-8">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-400 font-manrope block mb-2">
            Elektron Qiymətləndirmə
          </span>
          <h2 className="text-3xl font-bold font-serif text-[#171717]">İmtahan Nəticəsini Yoxla</h2>
          <p className="text-xs sm:text-sm text-[#666666] mt-2 font-manrope max-w-md mx-auto">
            {settings.brandName} nəticələri mövcud imtahan sistemindən yalnız read-only inteqrasiya ilə sonrakı mərhələdə göstəriləcək.
          </p>
        </div>
        <form onSubmit={(event) => event.preventDefault()} className="space-y-4" aria-label="Nəticə axtarışı">
          <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 font-manrope">
            Qeydiyyat nömrəsi
            <input
              disabled
              type="text"
              placeholder="Nəticə inteqrasiyası aktiv deyil"
              className="mt-1.5 w-full text-sm font-mono p-3.5 bg-[#FCFAF5] border border-[#EAEAEA] rounded-xl disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>
          <button
            disabled
            type="submit"
            className="w-full py-3.5 bg-[#F4D500] text-black font-bold font-manrope text-sm rounded-xl flex items-center justify-center gap-2 cursor-not-allowed opacity-60"
          >
            <Search className="w-4 h-4" />
            <span>Nəticəni axtar</span>
          </button>
        </form>
        <p role="status" className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 font-manrope">
          Demo nəticələri çıxarılıb. Nəticə bazası, CSV idxalı və nəticə idarəetməsi bu mərhələnin əhatəsinə daxil deyil.
        </p>
      </section>
    </div>
  </div>
);
