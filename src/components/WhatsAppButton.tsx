import React, { useState } from 'react';
import { MessageCircle, X, Send, ArrowRight } from 'lucide-react';
import { WebsiteSettings } from '../types';

interface WhatsAppButtonProps {
  settings: WebsiteSettings;
}

export const WhatsAppButton: React.FC<WhatsAppButtonProps> = ({ settings }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [customMsg, setCustomMsg] = useState('');

  const preFilledMessages = [
    'Salam. Aktiv imtahanlar haqqında məlumat almaq istəyirəm.',
    'Salam. Mən müraciətimin vəziyyətini öyrənmək istəyirəm.',
    'Salam. İmtahan biletimi yenidən əldə etmək istəyirəm.',
    'Salam. İmtahana müraciət qaydaları ilə bağlı sualım var.'
  ];

  const handleSend = (text: string) => {
    const phone = settings.whatsappPhone.replace(/\D/g, '');
    const encoded = encodeURIComponent(text);
    const url = `https://wa.me/${phone}?text=${encoded}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setIsOpen(false);
  };

  return (
    <>
      {/* Floating Action Button */}
      <div className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-40 no-print">
        <button
          onClick={() => setIsOpen(!isOpen)}
          aria-label="WhatsApp ilə əlaqə saxlayın"
          className="relative flex items-center justify-center w-13 h-13 sm:w-14 sm:h-14 bg-[#25D366] hover:bg-[#20ba59] active:scale-95 text-white rounded-2xl shadow-md transition-transform duration-150 cursor-pointer focus:outline-none"
        >
          <MessageCircle className="w-6 h-6 sm:w-7 sm:h-7 fill-white" />
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#F4D500] rounded-full border-2 border-white shadow-2xs"></span>
        </button>
      </div>

      {/* Pop-up Quick Chat Drawer */}
      {isOpen && (
        <div className="fixed inset-0 sm:inset-auto sm:bottom-22 sm:right-6 sm:w-96 z-50 flex flex-col bg-white sm:rounded-2xl shadow-xl border border-neutral-200 overflow-hidden fade-in-light">
          {/* Header */}
          <div className="bg-[#0A0A0A] p-4 text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#25D366] flex items-center justify-center text-white">
                <MessageCircle className="w-5 h-5 fill-white" />
              </div>
              <div>
                <h4 className="font-spartan font-bold text-sm text-white">Ö.İ.M. Dəstək Xətti</h4>
                <p className="text-[11px] text-[#F4D500]">Gəncə · WhatsApp ilə birbaşa əlaqə</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-neutral-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-4 bg-neutral-50/70 space-y-3 max-h-[60vh] sm:max-h-80 overflow-y-auto">
            <p className="text-xs text-neutral-600 font-medium">
              Sualınızı və ya hazır müraciət şablonunu seçin:
            </p>

            <div className="space-y-2">
              {preFilledMessages.map((msg, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(msg)}
                  className="w-full text-left p-3 text-xs text-neutral-800 bg-white hover:bg-neutral-100 border border-neutral-200 rounded-xl transition-all flex items-center justify-between group shadow-2xs cursor-pointer"
                >
                  <span className="pr-2">{msg}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-neutral-400 group-hover:text-[#0A0A0A] group-hover:translate-x-0.5 transition-all shrink-0" />
                </button>
              ))}
            </div>

            <div className="pt-2">
              <label className="block text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">
                Fərdi sualınız
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Mesajınızı bura yazın..."
                  value={customMsg}
                  onChange={(e) => setCustomMsg(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && customMsg.trim() && handleSend(customMsg)}
                  className="w-full text-xs px-3 py-2.5 bg-white border border-neutral-300 rounded-xl focus:outline-none focus:border-[#F4D500] focus:ring-1 focus:ring-[#F4D500]"
                />
                <button
                  onClick={() => customMsg.trim() && handleSend(customMsg)}
                  className="p-2.5 bg-[#25D366] hover:bg-[#20ba59] text-white rounded-xl cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
