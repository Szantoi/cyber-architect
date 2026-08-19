import React, { createContext, useContext, useState, useCallback } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [adminToken, setAdminToken] = useState(() => {
    try {
      return localStorage.getItem('cyber_admin_token') || null;
    } catch {
      return null;
    }
  });

  const loginAdmin = useCallback(async (pin) => {
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem('cyber_admin_token', data.token);
        setAdminToken(data.token);
        return { success: true };
      }
      return { success: false, error: data.error || 'INVALID_PIN' };
    } catch {
      return { success: false, error: 'SERVER_UNAVAILABLE' };
    }
  }, []);

  const logoutAdmin = useCallback(() => {
    try {
      localStorage.removeItem('cyber_admin_token');
    } catch {
      // ignore
    }
    setAdminToken(null);
  }, []);

  const adminFetch = useCallback(async (url, options = {}) => {
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
      isAuthenticated: !!adminToken,
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
