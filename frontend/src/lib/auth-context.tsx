'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

interface User {
  userId: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'MANAGER' | 'AGENT' | 'FIELD' | 'READONLY';
}

interface AuthContextValue {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isManager: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3100';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = useCallback((expiresIn: number) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const refreshAt = (expiresIn - 60) * 1000;
    refreshTimerRef.current = setTimeout(() => {
      refreshToken();
    }, Math.max(refreshAt, 5000));
  }, []);

  const refreshToken = useCallback(async () => {
    try {
      const res = await axios.post(`${API_URL}/api/auth/refresh`, {}, {
        withCredentials: true,
      });
      setAccessToken(res.data.accessToken);
      setUser(res.data.user);
      scheduleRefresh(res.data.expiresIn);
    } catch {
      setAccessToken(null);
      setUser(null);
    }
  }, [scheduleRefresh]);

  useEffect(() => {
    refreshToken().finally(() => setIsLoading(false));
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [refreshToken]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await axios.post(`${API_URL}/api/auth/login`, { email, password }, {
      withCredentials: true,
    });
    setAccessToken(res.data.accessToken);
    setUser(res.data.user);
    scheduleRefresh(res.data.expiresIn);
  }, [scheduleRefresh]);

  const logoutFn = useCallback(async () => {
    try {
      await axios.post(`${API_URL}/api/auth/logout`, {}, { withCredentials: true });
    } catch {
      // Swallow errors
    }
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    setAccessToken(null);
    setUser(null);
  }, []);

  const isAdmin = user?.role === 'ADMIN';
  const isManager = user?.role === 'MANAGER' || isAdmin;

  return (
    <AuthContext.Provider value={{
      user,
      accessToken,
      isLoading,
      login,
      logout: logoutFn,
      isAdmin,
      isManager,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
