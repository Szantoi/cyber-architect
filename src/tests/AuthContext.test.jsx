import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { AuthProvider, useAuth } from '../context/AuthContext';

describe('AuthContext Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('provides unauthenticated initial state when token is absent in localStorage', () => {
    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.adminToken).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('initializes authenticated state from pre-existing localStorage token', () => {
    localStorage.setItem('cyber_admin_token', 'test-jwt-token-xyz');

    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.adminToken).toBe('test-jwt-token-xyz');
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('updates token and localStorage upon successful login', async () => {
    const fakeToken = 'mock-signed-jwt-token';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: fakeToken })
    });

    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
    const { result } = renderHook(() => useAuth(), { wrapper });

    let response;
    await act(async () => {
      response = await result.current.loginAdmin('1337');
    });

    expect(response.success).toBe(true);
    expect(result.current.adminToken).toBe(fakeToken);
    expect(result.current.isAuthenticated).toBe(true);
    expect(localStorage.getItem('cyber_admin_token')).toBe(fakeToken);
  });

  it('clears token on logout', () => {
    localStorage.setItem('cyber_admin_token', 'token-to-be-removed');

    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isAuthenticated).toBe(true);

    act(() => {
      result.current.logoutAdmin();
    });

    expect(result.current.adminToken).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem('cyber_admin_token')).toBeNull();
  });
});
