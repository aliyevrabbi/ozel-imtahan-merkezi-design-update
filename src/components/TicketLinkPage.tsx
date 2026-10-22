import React, { useEffect, useState } from 'react';
import { getTicketByToken, getTicketServiceErrorMessage, TICKET_LOOKUP_INVALID_MESSAGE } from '../services/ticketService';
import type { PublicTicketDisplay } from '../services/ticketService';

type LookupState =
  | { status: 'loading' }
  | { status: 'found'; ticket: PublicTicketDisplay }
  | { status: 'invalid' }
  | { status: 'error'; message: string };

// The token is read from the URL path only. Nothing is written to browser storage.
export default function TicketLinkPage({ token }: { token: string }) {
  const [state, setState] = useState<LookupState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    void getTicketByToken(token).then((result) => {
      if (!active) return;
      setState(result.found ? { status: 'found', ticket: result.ticket } : { status: 'invalid' });
    }).catch((lookupError: unknown) => {
      if (!active) return;
      setState({ status: 'error', message: getTicketServiceErrorMessage(lookupError) });
    });
    return () => { active = false; };
  }, [token]);

  return (
    <main className="mx-auto max-w-xl space-y-4 p-6 text-[#0F172A]">
      <h1 className="text-xl font-bold">İmtahan bileti</h1>
      {state.status === 'loading' ? <p role="status" className="text-sm text-[#64748B]">Bilet yüklənir...</p> : null}
      {state.status === 'invalid' ? <p role="alert" className="text-sm text-rose-800">{TICKET_LOOKUP_INVALID_MESSAGE}</p> : null}
      {state.status === 'error' ? <p role="alert" className="text-sm text-rose-800">{state.message}</p> : null}
      {state.status === 'found' ? (
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            ['Qeydiyyat nömrəsi', state.ticket.registrationNumber],
            ['İmtahan', state.ticket.examTitle],
            ['Tarix', state.ticket.examDate],
            ['Başlama vaxtı', state.ticket.startTime],
            ['Bitmə vaxtı', state.ticket.endTime],
            ['Bina', state.ticket.buildingName],
            ['Otaq', state.ticket.roomName],
            ['Yer nömrəsi', state.ticket.seatNumber],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-[#FAFAF7] p-3">
              <dt className="text-xs font-semibold text-[#64748B]">{label}</dt>
              <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </main>
  );
}
