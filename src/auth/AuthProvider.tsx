import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient } from '../services/supabaseClient';
import type { AppRole } from '../types';

interface AuthContextValue {
  session: Session | null;
  role: AppRole | null;
  loading: boolean;
  configurationError: string | null;
  signIn(email: string, password: string): Promise<string | null>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = getSupabaseClient();
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [authRevision, setAuthRevision] = useState(0);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;
    const loadSession = async () => {
      let hasSession = false;
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!active) return;
        hasSession = !error && Boolean(data.session);
        setSession(error ? null : data.session);
      } catch {
        if (active) setSession(null);
      } finally {
        if (active) setLoading(hasSession);
      }
    };

    void loadSession();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setRole(null);
      setAuthRevision((revision) => revision + 1);
      setLoading(Boolean(nextSession));
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    let active = true;
    setRole(null);

    if (!supabase || !session?.user) {
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);
    void Promise.all([
      supabase.auth.getUser(),
      supabase
        .from('profiles')
        .select('role, active')
        .eq('id', session.user.id)
        .maybeSingle(),
    ]).then(([{ data: userData, error: userError }, { data: profile, error: profileError }]) => {
      if (!active) return;
      const allowed: AppRole[] = ['super_admin', 'admin', 'operator', 'scanner'];
      if (!userError && userData.user?.id === session.user.id && !profileError && profile?.active && allowed.includes(profile.role as AppRole)) {
        setRole(profile.role as AppRole);
      } else {
        setRole(null);
      }
    }).catch(() => {
      if (active) setRole(null);
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [authRevision, session?.user?.id, supabase]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    role,
    loading,
    configurationError: supabase ? null : 'Supabase konfiqurasiya edilməyib. Layihə URL-i və anon açarı Vercel mühit dəyişənlərində təyin olunmalıdır.',
    signIn: async (email, password) => {
      if (!supabase) return 'Supabase konfiqurasiya edilməyib.';
      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return error ? 'Giriş mümkün olmadı. Məlumatları yoxlayıb yenidən cəhd edin.' : null;
      } catch {
        return 'Giriş mümkün olmadı. Məlumatları yoxlayıb yenidən cəhd edin.';
      }
    },
    signOut: async () => {
      if (!supabase) return;
      try {
        await supabase.auth.signOut();
      } catch {
        // Clear local authorization state even when the network logout request fails.
      } finally {
        setSession(null);
        setRole(null);
        setLoading(false);
      }
    },
  }), [session, role, loading, supabase]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
