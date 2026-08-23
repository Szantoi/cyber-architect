import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { AuthProvider, useAuth } from '../context/AuthContext.jsx';

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
const VALID_TOKEN = 'verified-admin-jwt-token';

describe('AuthContext Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('provides an unauthenticated initial state when no token is present', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.adminToken).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isAuthChecking).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not trust a persisted token until the server validates its session', async () => {
    localStorage.setItem('cyber_admin_token', VALID_TOKEN);
    globalThis.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ authenticated: true, role: 'OVERSEER_ADMIN' })
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.adminToken).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isAuthChecking).toBe(true);

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    expect(result.current.adminToken).toBe(VALID_TOKEN);
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/admin/session', expect.objectContaining({
      headers: { 'x-admin-token': VALID_TOKEN }
    }));
  });

  it('purges a rejected persisted token and stays unauthenticated', async () => {
    localStorage.setItem('cyber_admin_token', 'forged-token');
    globalThis.fetch.mockResolvedValue({ ok: false, status: 401 });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isAuthChecking).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.adminToken).toBeNull();
    expect(localStorage.getItem('cyber_admin_token')).toBeNull();
  });

  it('purges a valid token that the server does not confirm as an admin session', async () => {
    localStorage.setItem('cyber_admin_token', VALID_TOKEN);
    globalThis.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ authenticated: true, role: 'VIEWER' })
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isAuthChecking).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.adminToken).toBeNull();
    expect(localStorage.getItem('cyber_admin_token')).toBeNull();
  });

  it('updates token and authenticated state upon a successful PIN login', async () => {
    const fakeToken = 'mock-signed-jwt-token';
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ token: fakeToken, role: 'OVERSEER_ADMIN' })
    });

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

  it('clears a validated session and its persisted token on logout', async () => {
    localStorage.setItem('cyber_admin_token', VALID_TOKEN);
    globalThis.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ authenticated: true, role: 'OVERSEER_ADMIN' })
    });
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    act(() => {
      result.current.logoutAdmin();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.adminToken).toBeNull();
    expect(localStorage.getItem('cyber_admin_token')).toBeNull();
  });

});
