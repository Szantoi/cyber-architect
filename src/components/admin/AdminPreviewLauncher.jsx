import React from 'react';
import { Network, BookOpenText, Newspaper, LayoutDashboard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAdminPreview } from '../../context/AdminPreviewContext.jsx';

const PREVIEW_DESTINATIONS = [
  { id: 'public', label: 'HONLAP', detail: 'A teljes nyitóoldal', to: '/', Icon: LayoutDashboard, color: '#00fbfb' },
  { id: 'blog', label: 'BLOG', detail: 'Cikkek és esettanulmányok', to: '/blog', Icon: Newspaper, color: '#ff00ff' },
  { id: 'knowledge', label: 'TUDÁSTÁR', detail: 'Jegyzetek és RAG keresés', to: '/knowledge', Icon: BookOpenText, color: '#80ff00' },
  { id: 'graph', label: 'TUDÁSGRÁF', detail: 'Wikilink alap és DB-rétegek', to: '/graph', Icon: Network, color: '#00fbfb' }
];

const AdminPreviewLauncher = () => {
  const navigate = useNavigate();
  const { isAdminPreview } = useAdminPreview();

  const openPreview = (destination) => {
    navigate(destination.to);
  };

  return (
    <section data-testid="admin-preview-launcher" aria-labelledby="admin-preview-launcher-title" className="mb-8 overflow-hidden border-2 border-neonMagenta/55 bg-[#100a18] shadow-[4px_4px_0_#0f172a] dark:shadow-[0_0_32px_rgba(255,0,255,.09)]">
      <div className="relative flex flex-col gap-2 border-b border-neonMagenta/30 bg-[radial-gradient(circle_at_84%_30%,rgba(255,0,255,.18),transparent_24rem),linear-gradient(90deg,rgba(0,251,251,.06)_1px,transparent_1px),linear-gradient(rgba(0,251,251,.06)_1px,transparent_1px)] bg-[size:auto,20px_20px,20px_20px] p-4">
        <div className="relative min-w-0">
          <p className="font-mono text-[9px] font-black uppercase tracking-[.17em] text-neonMagenta">Hitelesített gyorsugrás</p>
          <h2 id="admin-preview-launcher-title" className="mt-1 font-headline text-xl font-black uppercase italic text-white">Előnézeti célok</h2>
          <p className="mt-1 max-w-3xl font-mono text-[9px] leading-relaxed text-slate-400">A felső navigáció egyetlen nézetváltója jelöli és kezeli az admin vagy publikus vetületet. Ezek a gyorsugrások az éppen kiválasztott nézetet tartják meg.</p>
        </div>
        <p className={`font-mono text-[8px] font-black uppercase tracking-[.12em] ${isAdminPreview ? 'text-neonMagenta' : 'text-neonCyan'}`}>{isAdminPreview ? 'ADMIN VETÜLET AKTÍV' : 'PUBLIKUS VETÜLET AKTÍV'}</p>
      </div>
      <div className="grid gap-px bg-neonMagenta/15 sm:grid-cols-2 xl:grid-cols-4">
        {PREVIEW_DESTINATIONS.map((destination) => {
          const DestinationIcon = destination.Icon;
          return (
            <button key={destination.id} type="button" data-testid={`admin-preview-open-${destination.id}`} onClick={() => openPreview(destination)} className="group flex min-h-20 items-center gap-3 bg-[#100a18] p-3 text-left transition-colors hover:bg-white/[.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neonCyan">
              <span className="grid h-9 w-9 shrink-0 place-items-center border" style={{ borderColor: destination.color, color: destination.color }}><DestinationIcon size={17} aria-hidden="true" /></span>
              <span className="min-w-0"><span className="block font-mono text-[10px] font-black tracking-[.1em] text-slate-100" style={{ color: destination.color }}>{destination.label}</span><span className="mt-1 block font-mono text-[8px] leading-relaxed text-slate-500">{destination.detail}</span></span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default AdminPreviewLauncher;
