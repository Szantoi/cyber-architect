import React from 'react';
import { Eye, ExternalLink, Globe2, ShieldCheck, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAdminPreview } from '../../context/AdminPreviewContext.jsx';

const AdminPreviewBar = () => {
  const location = useLocation();
  const { isAdminPreview, canPreview, enterAdminPreview, exitAdminPreview } = useAdminPreview();

  if (!canPreview || location.pathname === '/admin') return null;

  const adminViewActive = isAdminPreview;

  return (
    <aside
      data-testid={adminViewActive ? 'admin-preview-status' : 'admin-public-view-status'}
      role="status"
      aria-label={adminViewActive ? 'Admin nézet aktív' : 'Publikus nézet aktív'}
      className={`fixed inset-x-0 top-[62px] z-[60] border-y px-3 py-2 text-white backdrop-blur-xl md:top-[73px] md:px-6 ${adminViewActive ? 'border-neonMagenta/55 bg-[#160a1d]/95 shadow-[0_8px_22px_rgba(255,0,255,.18)]' : 'border-neonCyan/55 bg-[#071723]/95 shadow-[0_8px_22px_rgba(0,251,251,.14)]'}`}
    >
      <div className="mx-auto flex max-w-[1540px] flex-wrap items-center justify-between gap-2 font-mono">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`grid h-6 w-6 shrink-0 place-items-center border ${adminViewActive ? 'border-neonMagenta bg-neonMagenta/15 text-neonMagenta' : 'border-neonCyan bg-neonCyan/15 text-neonCyan'}`}>
            {adminViewActive ? <Eye size={13} aria-hidden="true" /> : <Globe2 size={13} aria-hidden="true" />}
          </span>
          {adminViewActive ? (
            <>
              <span className="min-w-0 text-[9px] font-black uppercase tracking-[.13em] text-neonMagenta sm:text-[10px]">Admin nézet aktív</span>
              <span data-testid="admin-preview-private-badge" className="hidden items-center gap-1 border border-plasmaGreen/50 bg-plasmaGreen/10 px-1.5 py-1 text-[8px] font-black uppercase tracking-[.1em] text-plasmaGreen sm:inline-flex"><ShieldCheck size={10} aria-hidden="true" />Privát és piszkozat tartalom is látható</span>
            </>
          ) : (
            <>
              <span className="min-w-0 text-[9px] font-black uppercase tracking-[.13em] text-neonCyan sm:text-[10px]">Publikus nézet aktív</span>
              <span className="hidden text-[8px] font-black uppercase tracking-[.1em] text-slate-400 sm:inline">Csak a látogatóknak elérhető tartalom látszik</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[.08em]">
          <Link to="/admin" className="inline-flex min-h-8 items-center gap-1 border border-white/20 px-2 text-slate-200 transition-colors hover:border-neonCyan hover:text-neonCyan"><ExternalLink size={11} aria-hidden="true" />Admin</Link>
          {adminViewActive ? (
            <button
              type="button"
              data-testid="admin-preview-mode-public"
              onClick={exitAdminPreview}
              className="inline-flex min-h-8 items-center gap-1 border border-neonMagenta bg-neonMagenta/10 px-2 text-neonMagenta transition-colors hover:bg-neonMagenta hover:text-slate-950"
            >
              <X size={11} aria-hidden="true" />Publikus nézet
            </button>
          ) : (
            <button
              type="button"
              data-testid="admin-preview-mode-all"
              onClick={enterAdminPreview}
              className="inline-flex min-h-8 items-center gap-1 border border-neonCyan bg-neonCyan/10 px-2 text-neonCyan transition-colors hover:bg-neonCyan hover:text-slate-950"
            >
              <Eye size={11} aria-hidden="true" />Admin nézet
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};

export default AdminPreviewBar;
