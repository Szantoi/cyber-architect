import React from 'react';
import { useModalFocusTrap } from '../../../hooks/useModalFocusTrap';

const RollbackConfirmModal = ({ rollbackTarget, onConfirm, onCancel }) => {
  const modalRef = useModalFocusTrap(!!rollbackTarget, onCancel);

  if (!rollbackTarget) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 font-mono"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rollback-modal-title"
    >
      <div 
        ref={modalRef}
        className="w-full max-w-lg bg-[var(--surface-panel)] border-2 border-neonMagenta p-6 relative shadow-[8px_8px_0_#0f172a] dark:shadow-[0_0_30px_rgba(255,0,255,0.3)]"
      >
        <div className="corner-bracket-tl text-neonMagenta"></div>
        <div className="corner-bracket-br text-neonCyan"></div>

        <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 dark:border-white/10 border-slate-900">
          <span className="material-symbols-outlined text-neonMagenta text-2xl animate-pulse">warning</span>
          <h3 id="rollback-modal-title" className="text-lg font-headline font-black italic uppercase text-on-surface">
            AUDIT_ROLLBACK_CONFIRMATION
          </h3>
        </div>

        <p className="text-xs text-on-surface mb-4 leading-relaxed font-medium">
          Biztosan visszaállítod a rendszert a(z) <strong className="text-neonMagenta font-black">#{rollbackTarget.id}</strong> sorszámú audit bejegyzés előtti állapotra?
        </p>

        <div className="p-3 dark:bg-black/60 bg-slate-100 border-2 dark:border-white/10 border-slate-900 text-[11px] mb-6 space-y-1">
          <div><span className="dark:text-slate-500 text-slate-700 font-bold">MŰVELET:</span> <strong className="text-slate-900 dark:text-white">{rollbackTarget.action}</strong></div>
          <div><span className="dark:text-slate-500 text-slate-700 font-bold">ENTITÁS:</span> <strong className="text-neonCyan">{rollbackTarget.entity}</strong> [{rollbackTarget.entity_id || 'N/A'}]</div>
          <div><span className="dark:text-slate-500 text-slate-700 font-bold">AKTOR:</span> <strong className="text-plasmaGreen">{rollbackTarget.actor}</strong></div>
          <div><span className="dark:text-slate-500 text-slate-700 font-bold">IDŐPONT:</span> <strong className="text-slate-700 dark:text-slate-300">{new Date(rollbackTarget.created_at).toLocaleString()}</strong></div>
        </div>

        <div className="flex justify-end gap-4">
          <button
            onClick={onCancel}
            className="border-2 dark:border-white/20 border-slate-900 px-6 py-2 uppercase dark:text-slate-300 text-slate-900 font-bold hover:bg-slate-900 hover:text-white transition-colors text-xs"
            aria-label="Mégse és ablak bezárása"
          >
            MÉGSE
          </button>
          <button
            onClick={() => onConfirm(rollbackTarget.id)}
            className="bg-neonMagenta text-white font-headline font-black italic px-6 py-2 uppercase border-2 border-slate-950 shadow-[3px_3px_0_#0f172a] hover:bg-slate-950 hover:text-white transition-all text-xs"
            aria-label="Visszaállítás megerősítése és végrehajtása"
          >
            VISSZAÁLLÍTÁS_VÉGREHAJTÁSA ↺
          </button>
        </div>
      </div>
    </div>
  );
};

export default RollbackConfirmModal;
