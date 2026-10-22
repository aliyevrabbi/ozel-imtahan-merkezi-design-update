import React, { useEffect, useState } from 'react';
import { getAuthRouteState, type ProtectedRoute } from './adminRoutes';
import { runLoginAttempt } from './loginAttempt';
import { AdminLayout } from '../components/AdminLayout';
import { Lock, ShieldCheck } from 'lucide-react';
import { useAuth } from './AuthProvider';

export function AdminAuthRoute({ route }: { route: ProtectedRoute }) {
  const { session, role, loading, configurationError, signIn, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { area, allowedRoles, login, path } = route;
  const routeName = area === 'operator' ? 'Operator' : 'Admin';
  const loginPath = area === 'operator' ? '/operator/login' : '/admin/login';
  const routeState = getAuthRouteState({
    hasSession: Boolean(session), role, loading, configurationError, allowedRoles,
  });

  useEffect(() => {
    if (!login && routeState === 'login') {
      window.history.replaceState(null, '', loginPath);
    } else if (login && routeState === 'authorized') {
      window.history.replaceState(null, '', area === 'admin' ? '/admin' : '/operator');
    }
  }, [area, login, loginPath, routeState]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage('');
    const result = await runLoginAttempt(signIn, email, password, setSubmitting);
    setMessage(result === 'success'
      ? 'Giriş qəbul edildi. Rol yoxlanılır...'
      : 'Giriş mümkün olmadı. Məlumatları yoxlayıb yenidən cəhd edin.');
  };

  // Authorized sessions get the full protected layout; the login card is only for other states.
  if (routeState === 'authorized' && role) {
    return <AdminLayout area={area} role={role} onSignOut={() => void signOut()} />;
  }

  return (
    <main className="min-h-screen bg-[#FAFAF7] px-4 py-16 flex items-center justify-center font-manrope">
      <section className="w-full max-w-md rounded-3xl border border-[#E5E5E0] bg-white p-8 shadow-sm space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0F172A] text-[#F4D500]">
          {session ? <ShieldCheck className="h-8 w-8" /> : <Lock className="h-8 w-8" />}
        </div>
        <header className="text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-[#D97706]">Özəl İmtahan Mərkəzi</p>
          <h1 className="mt-2 font-serif text-2xl font-bold text-[#0F172A]">{routeName} girişi</h1>
          <p className="mt-2 text-sm text-[#64748B]">Daxil olmaq üçün mərkəz tərəfindən yaradılmış Supabase Auth hesabından istifadə edin.</p>
        </header>

        {routeState === 'configuration_error' ? (
          <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {configurationError} Admin hesabı avtomatik yaradılmır.
          </div>
        ) : routeState === 'loading' ? (
          <p role="status" className="text-center text-sm text-[#64748B]">Hesab və rol yoxlanılır...</p>
        ) : routeState === 'unauthorized' ? (
          <div className="space-y-4">
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              Bu hesabın {routeName.toLowerCase()} panelinə daxil olmaq üçün uyğun rolu yoxdur. Giriş rədd edildi.
            </p>
            <button onClick={() => void signOut()} className="w-full rounded-xl bg-[#0F172A] px-4 py-3 text-sm font-bold text-white">
              Çıxış et
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block text-sm font-semibold text-[#334155]">
              E-poçt
              <input required type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-xl border border-[#E5E5E0] bg-[#FAFAF7] p-3 font-normal" />
            </label>
            <label className="block text-sm font-semibold text-[#334155]">
              Şifrə
              <input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-xl border border-[#E5E5E0] bg-[#FAFAF7] p-3 font-normal" />
            </label>
            {message && <p role="status" className="text-sm text-[#475569]">{message}</p>}
            <button disabled={submitting} type="submit" className="w-full rounded-xl bg-[#F4D500] px-4 py-3 text-sm font-bold text-[#0F172A] disabled:opacity-60">
              {submitting ? 'Yoxlanılır...' : 'Daxil ol'}
            </button>
          </form>
        )}
        <p className="text-center text-xs text-[#64748B]">Bu panel yalnız qorunan Supabase Auth və verilənlər bazası rolları ilə açılır. <a className="font-semibold underline" href={login ? path : loginPath}>Giriş səhifəsi</a></p>
      </section>
    </main>
  );
}
