import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext.jsx';

const LEGACY_PREVIEW_STORAGE_KEY = 'cyber_admin_preview_enabled';
const AdminPreviewContext = createContext(null);

const publicViewerFetch = (...args) => fetch(...args);

const publicPreviewValue = {
  isAdminPreview: false,
  isPublicView: true,
  canPreview: false,
  isAuthChecking: false,
  enterAdminPreview: () => false,
  exitAdminPreview: () => {},
  viewerFetch: publicViewerFetch
};

const clearLegacyPreviewPreference = () => {
  try {
    localStorage.removeItem(LEGACY_PREVIEW_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
};

/**
 * An authenticated administrator sees the server-side admin projection by
 * default. They can deliberately switch a public route to its visitor-facing
 * projection. The backend remains the authority for every visibility decision;
 * this context only attaches the documented request credentials.
 */
export const AdminPreviewProvider = ({ children }) => {
  const { adminToken, isAuthenticated, isAuthChecking, logoutAdmin } = useAuth();
  const [publicViewRequested, setPublicViewRequested] = useState(false);

  const isAdminPreview = Boolean(!publicViewRequested && isAuthenticated && adminToken);
  const isPublicView = Boolean(publicViewRequested || !isAuthenticated);

  const enterAdminPreview = useCallback(() => {
    if (!isAuthenticated || !adminToken) return false;
    setPublicViewRequested(false);
    return true;
  }, [adminToken, isAuthenticated]);

  const exitAdminPreview = useCallback(() => {
    setPublicViewRequested(true);
  }, []);

  // Public mode is intentionally an in-memory, per-login choice. A new login,
  // expired session, or logout always starts from the safer, fully labelled
  // admin projection instead of silently retaining an earlier visitor view.
  useEffect(() => {
    if (!isAuthChecking && !isAuthenticated && publicViewRequested) {
      setPublicViewRequested(false);
    }
  }, [isAuthenticated, isAuthChecking, publicViewRequested]);

  // The previous implementation persisted the inverse choice in localStorage.
  // It must not affect the new admin-first behaviour after this upgrade.
  useEffect(() => {
    clearLegacyPreviewPreference();
  }, []);

  const viewerFetch = useCallback(async (input, options) => {
    // Keep the native public-fetch call shape intact. Besides avoiding an
    // unnecessary empty init object, this matters for callers that distinguish
    // an ordinary public request from an explicitly configured request.
    if (!isAdminPreview) return options === undefined ? fetch(input) : fetch(input, options);

    const requestOptions = options || {};
    const headers = new Headers(requestOptions.headers || {});
    headers.set('X-CA-Preview', 'admin');
    headers.set('x-admin-token', adminToken);

    const response = await fetch(input, { ...requestOptions, headers });
    if (response.status === 401) {
      // Admin rendering is fail-closed. A stale JWT cannot leave private data
      // selected in a future request, and AuthContext clears its persisted token.
      setPublicViewRequested(false);
      logoutAdmin();
    }
    return response;
  }, [adminToken, isAdminPreview, logoutAdmin]);

  const value = useMemo(() => ({
    isAdminPreview,
    isPublicView,
    canPreview: Boolean(isAuthenticated && adminToken),
    isAuthChecking,
    enterAdminPreview,
    exitAdminPreview,
    viewerFetch
  }), [adminToken, enterAdminPreview, exitAdminPreview, isAdminPreview, isAuthenticated, isAuthChecking, isPublicView, viewerFetch]);

  return <AdminPreviewContext.Provider value={value}>{children}</AdminPreviewContext.Provider>;
};

// A public fallback keeps isolated visual/unit tests and embeddable public
// components safe: without the provider, requests are ordinary public fetches.
export const useAdminPreview = () => useContext(AdminPreviewContext) || publicPreviewValue;
