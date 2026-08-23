import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Arsenal from './components/Arsenal';
import Diagnostics from './components/Diagnostics';
import ProjectGrid from './components/ProjectGrid';
import Uplink from './components/Uplink';
import Footer from './components/Footer';
import CyberLoadingFallback from './components/common/CyberLoadingFallback';
import CyberSEO from './components/common/CyberSEO';
import { useAdminPreview } from './context/AdminPreviewContext';

// Route Code-Splitting with Dynamic Lazy Imports
const BlogList = lazy(() => import('./components/blog/BlogList'));
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard'));
const KnowledgeBase = lazy(() => import('./components/docs/KnowledgeBase'));
const KnowledgeGraphPage = lazy(() => import('./components/graph/KnowledgeGraphPage'));
const SystemArchitectureView = lazy(() => import('./components/architecture/SystemArchitectureView'));
const McpAgentGateway = lazy(() => import('./components/mcp/McpAgentGateway'));

// Tactical Loading Placeholder for Grid
const GridSkeleton = () => (
  <div className="py-24 bg-background border-t border-white/5 animate-pulse">
    <div className="container mx-auto px-6">
      <div className="h-12 w-48 bg-white/10 mb-16"></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {[1, 2, 3].map(i => (
          <div key={i} className="aspect-square bg-white/5 border border-white/10"></div>
        ))}
      </div>
    </div>
  </div>
);

// Home Page Landing View
const HomePage = () => (
  <div className="relative z-10">
    <CyberSEO 
      title="Szántói Gábor // Mérnöki Folyamatautomatizálás & AI Integráció"
      description="Mérnöki szemléletű folyamatfejlesztő és AI integrátor. Szigetrendszerek összekötése, manuális adminisztráció kiváltása és biztonságos belső AI megoldások."
    />
    <Hero />
    <Arsenal />
    <Diagnostics />
    <Suspense fallback={<GridSkeleton />}>
      <ProjectGrid />
    </Suspense>
    <Uplink />
  </div>
);

function App() {
  const { isAdminPreview, isAuthChecking } = useAdminPreview();
  const location = useLocation();
  const isGraphWorkspace = location.pathname === '/graph' || location.pathname.startsWith('/graph/');

  useEffect(() => {
    if (!isGraphWorkspace) return undefined;

    const root = document.documentElement;
    const { body } = document;
    const previousRoot = { height: root.style.height, overflow: root.style.overflow, overscrollBehavior: root.style.overscrollBehavior };
    const previousBody = { height: body.style.height, overflow: body.style.overflow, overscrollBehavior: body.style.overscrollBehavior };

    root.style.height = '100%';
    root.style.overflow = 'hidden';
    root.style.overscrollBehavior = 'none';
    body.style.height = '100%';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';

    return () => {
      root.style.height = previousRoot.height;
      root.style.overflow = previousRoot.overflow;
      root.style.overscrollBehavior = previousRoot.overscrollBehavior;
      body.style.height = previousBody.height;
      body.style.overflow = previousBody.overflow;
      body.style.overscrollBehavior = previousBody.overscrollBehavior;
    };
  }, [isGraphWorkspace]);

  return (
    <MotionConfig reducedMotion="user">
      <div className={`bg-[var(--bg-main)] text-[var(--text-main)] font-body relative selection:bg-neonCyan selection:text-black transition-colors duration-200 ${isGraphWorkspace ? 'flex h-[100dvh] min-h-0 flex-col overflow-hidden' : 'flex min-h-screen flex-col justify-between overflow-x-clip pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:pb-0'}`}>
      <a href="#main-content" className="skip-link">
        Ugrás a fő tartalomra
      </a>

      {/* Global Aesthetic Overlays */}
      <div className="scanlines pointer-events-none fixed inset-0 z-[10000]"></div>
      <div className="noise-overlay pointer-events-none fixed inset-0 z-[9999]"></div>
      
      {!isGraphWorkspace && <Navbar />}
      
      <main
        key={isAdminPreview ? 'admin-preview' : 'public-view'}
        id="main-content"
        tabIndex={-1}
        className={isGraphWorkspace ? 'min-h-0 flex-1 overflow-hidden' : 'flex-grow'}
      >
        {isAuthChecking ? (
          <div role="status" aria-live="polite" aria-label="Admin jogosultság ellenőrzése">
            <CyberLoadingFallback />
          </div>
        ) : (
          <Suspense fallback={<CyberLoadingFallback />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/blog" element={<BlogList />} />
              <Route path="/blog/*" element={<BlogList />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/knowledge" element={<KnowledgeBase />} />
              <Route path="/knowledge/*" element={<KnowledgeBase />} />
              <Route path="/graph" element={<KnowledgeGraphPage />} />
              <Route path="/knowledge-base" element={<KnowledgeBase />} />
              <Route path="/knowledge-base/*" element={<KnowledgeBase />} />
              <Route path="/docs" element={<KnowledgeBase />} />
              <Route path="/docs/*" element={<KnowledgeBase />} />
              <Route path="/architecture" element={<SystemArchitectureView />} />
              <Route path="/rendszerterv" element={<SystemArchitectureView />} />
              <Route path="/mcp" element={<McpAgentGateway />} />
              <Route path="/agent" element={<McpAgentGateway />} />
            </Routes>
          </Suspense>
        )}
      </main>

      {!isGraphWorkspace && <Footer />}
      </div>
    </MotionConfig>
  );
}

export default App;
