import React, { useState } from 'react';
import RollbackConfirmModal from '../modals/RollbackConfirmModal';

const AuditLogsTab = ({ auditList, onRefresh, onRollback }) => {
  const [expandedAuditId, setExpandedAuditId] = useState(null);
  const [rollbackTarget, setRollbackTarget] = useState(null);

  return (
    <div className="bg-[var(--surface-panel)] p-8 border-2 dark:border-white/10 border-slate-900 relative shadow-[6px_6px_0_#0f172a] dark:shadow-none">
      <div className="corner-bracket-tl dark:text-white/10 text-slate-900"></div>
      <div className="corner-bracket-br dark:text-white/10 text-slate-900"></div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b-2 dark:border-white/10 border-slate-900">
        <div>
          <h2 className="text-2xl font-headline font-black italic uppercase text-on-surface flex items-center gap-3">
            <span className="text-neonCyan">//</span> AUDIT_LOG_STREAM & TIMELINE
          </h2>
          <p className="font-mono text-xs dark:text-slate-400 text-slate-700 font-medium mt-1">
            Minden módosítás (MCP Agent, CLI terminál, Admin Dashboard) visszakövethető és visszavonható.
          </p>
        </div>

        <button
          onClick={onRefresh}
          className="px-4 py-2 dark:bg-slate-900 bg-[#cad4e2] border-2 dark:border-white/20 border-slate-900 text-slate-900 dark:text-slate-300 hover:bg-slate-900 hover:text-white font-mono text-xs uppercase font-bold flex items-center gap-2 shadow-[2px_2px_0_#0f172a] dark:shadow-none"
        >
          <span className="material-symbols-outlined text-sm">refresh</span>
          FRISSÍTÉS
        </button>
      </div>

      {auditList.length === 0 ? (
        <div className="p-8 text-center font-mono text-xs text-slate-500 border-2 dark:border-white/10 border-slate-900">
          [NINCS RÖGZÍTETT AUDIT BEJEGYZÉS]
        </div>
      ) : (
        <div className="space-y-4 font-mono text-xs">
          {auditList.map((log) => {
            const isExpanded = expandedAuditId === log.id;
            const isAgent = log.actor === 'MCP_AGENT';
            const isCli = log.actor === 'CLI_OPERATOR';
            const isAdmin = log.actor === 'ADMIN_DASHBOARD';

            const actorColor = isAgent
              ? 'border-2 border-cyan-700 dark:border-neonCyan text-cyan-800 dark:text-neonCyan bg-neonCyan/10'
              : isCli
              ? 'border-2 border-yellow-600 dark:border-yellow-400 text-yellow-800 dark:text-yellow-400 bg-yellow-400/10'
              : isAdmin
              ? 'border-2 border-neonMagenta text-neonMagenta bg-neonMagenta/10'
              : 'border-2 border-slate-900 dark:border-slate-500 text-slate-800 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/40';

            return (
              <div
                key={log.id}
                className="p-4 dark:bg-slate-900/60 bg-white border-2 dark:border-white/10 border-slate-900 shadow-[3px_3px_0_#0f172a] dark:shadow-none transition-all rounded-none"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-slate-900 dark:text-slate-400 font-black">#{log.id}</span>
                    <span className={`px-2 py-0.5 ${actorColor} text-[10px] font-black uppercase`}>
                      {log.actor}
                    </span>
                    <span className="font-black text-on-surface uppercase px-2 py-0.5 dark:bg-black/40 bg-slate-100 border-2 dark:border-white/10 border-slate-900">
                      {log.action}
                    </span>
                    <span className="text-slate-700 dark:text-slate-300 font-medium">
                      ON <strong className="text-emerald-700 dark:text-plasmaGreen font-black">{log.entity}</strong> {log.entity_id ? <span className="font-bold text-slate-900 dark:text-slate-300">[{log.entity_id}]</span> : ''}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-slate-700 dark:text-slate-400 text-[11px] font-bold">
                      {new Date(log.created_at).toLocaleString()}
                    </span>

                    <button
                      onClick={() => setExpandedAuditId(isExpanded ? null : log.id)}
                      className="px-3 py-1 dark:bg-white/5 bg-slate-100 border-2 dark:border-white/10 border-slate-900 text-slate-900 dark:text-slate-300 hover:bg-slate-900 hover:text-white uppercase text-[10px] font-bold shadow-[2px_2px_0_#0f172a] dark:shadow-none transition-colors"
                    >
                      {isExpanded ? 'DIFF ELREJTÉSE ▲' : 'DIFF MEGTEKINTÉSE ▼'}
                    </button>

                    <button
                      onClick={() => setRollbackTarget(log)}
                      className="px-3 py-1 bg-neonMagenta/15 border-2 border-neonMagenta text-neonMagenta hover:bg-neonMagenta hover:text-white uppercase text-[10px] font-black transition-colors shadow-[2px_2px_0_#0f172a] dark:shadow-none"
                    >
                      ROLLBACK ↺
                    </button>
                  </div>
                </div>

                {/* Expandable State Diff Preview */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t-2 dark:border-white/10 border-slate-900 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-[10px] uppercase text-neonMagenta font-bold mb-1 flex items-center gap-1">
                        <span>◀ ELŐZŐ ÁLLAPOT (PREV_STATE)</span>
                      </div>
                      <pre className="p-3 dark:bg-black/80 bg-slate-900 border-2 border-neonMagenta/40 text-slate-100 text-[11px] overflow-x-auto max-h-60 font-mono font-medium leading-relaxed">
                        {log.prev_state ? JSON.stringify(log.prev_state, null, 2) : '[NULL / LÉTREHOZÁSI ESEMÉNY]'}
                      </pre>
                    </div>

                    <div>
                      <div className="text-[10px] uppercase text-neonCyan font-bold mb-1 flex items-center gap-1">
                        <span>ÚJ ÁLLAPOT (NEW_STATE) ▶</span>
                      </div>
                      <pre className="p-3 dark:bg-black/80 bg-slate-900 border-2 border-neonCyan/40 text-slate-100 text-[11px] overflow-x-auto max-h-60 font-mono font-medium leading-relaxed">
                        {log.new_state ? JSON.stringify(log.new_state, null, 2) : '[NULL / TÖRLÉSI ESEMÉNY]'}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Rollback Confirm Modal */}
      <RollbackConfirmModal
        rollbackTarget={rollbackTarget}
        onConfirm={async (id) => {
          await onRollback(id);
          setRollbackTarget(null);
        }}
        onCancel={() => setRollbackTarget(null)}
      />
    </div>
  );
};

export default AuditLogsTab;
