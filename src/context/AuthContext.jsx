import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

const AuthContext = createContext(null);

const readPersistedToken = () => {
  try {
    return localStorage.getItem('cyber_admin_token') || null;
  } catch {
    return null;
  }
};

const clearPersistedToken = () => {
  try {
    localStorage.removeItem('cyber_admin_token');
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
};

export const AuthProvider = ({ children }) => {
  // A token in localStorage is only a recovery candidate, never proof of an
  // authenticated session. It is validated against the server before any
  // privileged UI or preview request can use it.
  const [persistedToken, setPersistedToken] = useState(readPersistedToken);
  const [adminToken, setAdminToken] = useState(null);
  const [isAuthChecking, setIsAuthChecking] = useState(() => Boolean(readPersistedToken()));

  useEffect(() => {
    if (!persistedToken) {
      setIsAuthChecking(false);
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    setIsAuthChecking(true);

    fetch('/api/admin/session', {
      signal: controller.signal,
      headers: { 'x-admin-token': persistedToken }
    })
      .then(async (response) => {
        if (!active) return;
        const session = response.ok ? await response.json().catch(() => null) : null;
        if (session?.authenticated === true && session.role === 'OVERSEER_ADMIN') {
          setAdminToken(persistedToken);
          return;
        }
        // An explicit server denial or a non-admin role means the value is
        // stale, forged, or insufficient for this console and must not survive
        // to a later page load.
        clearPersistedToken();
        setPersistedToken(null);
      })
      .catch((error) => {
        if (error?.name === 'AbortError' || !active) return;
        // Network failure is fail-closed in memory. Keep the value only so a
        // later reload can validate a genuine session when the server returns.
        setAdminToken(null);
      })
      .finally(() => {
        if (active) setIsAuthChecking(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [persistedToken]);

  const loginAdmin = useCallback(async (pin) => {
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      const data = await res.json();
      if (res.ok && data.token && data.role === 'OVERSEER_ADMIN') {
        localStorage.setItem('cyber_admin_token', data.token);
        setPersistedToken(null);
        setAdminToken(data.token);
        setIsAuthChecking(false);
        return { success: true };
      }
      return { success: false, error: data.error || 'INVALID_PIN' };
    } catch {
      return { success: false, error: 'SERVER_UNAVAILABLE' };
    }
  }, []);

  const logoutAdmin = useCallback(() => {
    clearPersistedToken();
    setPersistedToken(null);
    setAdminToken(null);
    setIsAuthChecking(false);
  }, []);

  const adminFetch = useCallback(async (url, options = {}) => {
    if (!adminToken) throw new Error('AUTH_REQUIRED');
    const headers = {
      'Content-Type': 'application/json',
      'x-admin-token': adminToken,
      ...(options.headers || {})
    };
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      logoutAdmin();
      throw new Error('SESSION_EXPIRED');
    }
    return res;
  }, [adminToken, logoutAdmin]);

  return (
    <AuthContext.Provider value={{
      adminToken,
      isAuthenticated: Boolean(adminToken && !isAuthChecking),
      isAuthChecking,
      loginAdmin,
      logoutAdmin,
      adminFetch
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
};
