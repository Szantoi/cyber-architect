import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Arsenal from './components/Arsenal';
import Diagnostics from './components/Diagnostics';
import ProjectGrid from './components/ProjectGrid';
import Uplink from './components/Uplink';
import Footer from './components/Footer';
import CyberLoadingFallback from './components/common/CyberLoadingFallback';
import CyberSEO from './components/common/CyberSEO';

// Route Code-Splitting with Dynamic Lazy Imports
const BlogList = lazy(() => import('./components/blog/BlogList'));
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard'));
const KnowledgeBase = lazy(() => import('./components/docs/KnowledgeBase'));
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
  <main className="relative z-10">
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
  </main>
);

function App() {
  return (
    <div className="bg-[var(--bg-main)] text-[var(--text-main)] font-body overflow-x-hidden min-h-screen relative selection:bg-neonCyan selection:text-black flex flex-col justify-between transition-colors duration-200">
      {/* Global Aesthetic Overlays */}
      <div className="scanlines pointer-events-none fixed inset-0 z-[10000]"></div>
      <div className="noise-overlay pointer-events-none fixed inset-0 z-[9999]"></div>
      
      <Navbar />
      
      <div className="flex-grow">
        <Suspense fallback={<CyberLoadingFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/blog" element={<BlogList />} />
            <Route path="/blog/*" element={<BlogList />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/knowledge" element={<KnowledgeBase />} />
            <Route path="/knowledge/*" element={<KnowledgeBase />} />
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
      </div>

      <Footer />
    </div>
  );
}

export default App;
