import React from 'react';

const TerminalModal = ({
  isOpen,
  onClose,
  editingTerminal,
  terminalForm,
  setTerminalForm,
  onSave
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 font-mono">
      <div className="w-full max-w-2xl bg-[var(--surface-panel)] border-2 dark:border-neonCyan border-slate-900 p-6 relative shadow-[8px_8px_0_#0f172a] dark:shadow-[0_0_40px_rgba(0,251,251,0.25)]">
        <div className="corner-bracket-tl text-neonCyan"></div>
        <div className="corner-bracket-br text-neonMagenta"></div>

        <div className="flex items-center justify-between pb-4 mb-4 border-b-2 dark:border-white/10 border-slate-900">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-neonCyan text-2xl">terminal</span>
            <h3 className="text-lg font-headline font-black italic uppercase text-on-surface">
              {editingTerminal ? `TERMINÁL SZERKESZTÉSE: @${editingTerminal.id}` : 'ÚJ TERMINÁL / SZEREPKÖR HOZZÁADÁSA'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="dark:text-slate-400 text-slate-800 hover:text-neonMagenta text-lg font-bold"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSave} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block dark:text-slate-400 text-slate-900 uppercase mb-1 font-bold">TERMINÁL AZONOSÍTÓ (ID // @TAG)</label>
              <input
                type="text"
                required
                disabled={!!editingTerminal}
                value={terminalForm.id}
                onChange={(e) => setTerminalForm({ ...terminalForm, id: e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '') })}
                placeholder="pl. security-analyst"
                className="w-full dark:bg-black bg-slate-50 border-2 dark:border-white/20 border-slate-900 p-2 text-neonCyan font-bold outline-none focus:border-neonCyan disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block dark:text-slate-400 text-slate-900 uppercase mb-1 font-bold">SZEREPKÖR MEGNEVEZÉSE (NÉV)</label>
              <input
                type="text"
                required
                value={terminalForm.name}
                onChange={(e) => setTerminalForm({ ...terminalForm, name: e.target.value })}
                placeholder="pl. Biztonsági & Audit Szakértő"
                className="w-full dark:bg-black bg-slate-50 border-2 dark:border-white/20 border-slate-900 p-2 text-on-surface font-bold outline-none focus:border-neonCyan"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block dark:text-slate-400 text-slate-900 uppercase mb-1 font-bold">POD (FUNKCIONÁLIS CSOPORT)</label>
              <select
                value={terminalForm.pod}
                onChange={(e) => setTerminalForm({ ...terminalForm, pod: e.target.value })}
                className="w-full dark:bg-black bg-slate-50 border-2 dark:border-white/20 border-slate-900 p-2 text-on-surface font-bold outline-none focus:border-neonCyan"
              >
                <option value="Executive">Executive (Felsővezetés)</option>
                <option value="Engineering">Engineering (Mérnöki & Dev)</option>
                <option value="Marketing">Marketing (Tartalom & Lead)</option>
                <option value="Operations">Operations (Üzemeltetés & RAG)</option>
              </select>
            </div>

            <div>
              <label className="block dark:text-slate-400 text-slate-900 uppercase mb-1 font-bold">FELELŐS VEZETŐ (POD LEAD)</label>
              <select
                value={terminalForm.lead_id}
                onChange={(e) => setTerminalForm({ ...terminalForm, lead_id: e.target.value })}
                className="w-full dark:bg-black bg-slate-50 border-2 dark:border-white/20 border-slate-900 p-2 text-on-surface font-bold outline-none focus:border-neonCyan"
              >
                <option value="root">@root (Főirányító)</option>
                <option value="conductor">@conductor (Koordinátor)</option>
                <option value="tech-lead">@tech-lead (Mérnöki Vezető)</option>
                <option value="marketing-lead">@marketing-lead (Marketing Vezető)</option>
                <option value="ops-lead">@ops-lead (Üzemeltetési Vezető)</option>
              </select>
            </div>

            <div>
              <label className="block dark:text-slate-400 text-slate-900 uppercase mb-1 font-bold">IKON (MATERIAL SYMBOL)</label>
              <input
                type="text"
                value={terminalForm.icon}
                onChange={(e) => setTerminalForm({ ...terminalForm, icon: e.target.value })}
                placeholder="terminal, security, hub"
                className="w-full dark:bg-black bg-slate-50 border-2 dark:border-white/20 border-slate-900 p-2 text-on-surface font-bold outline-none focus:border-neonCyan"
              />
            </div>
          </div>

          <div>
            <label className="block dark:text-slate-400 text-slate-900 uppercase mb-1 font-bold">FŐ SZEREPKÖR ÉS CÉLOK (1-2 MONDAT)</label>
            <input
              type="text"
              required
              value={terminalForm.role_description}
              onChange={(e) => setTerminalForm({ ...terminalForm, role_description: e.target.value })}
              placeholder="pl. Rendszerbiztonsági auditok, jogosultságok kezelése és Zero Trust megfelelés."
              className="w-full dark:bg-black bg-slate-50 border-2 dark:border-white/20 border-slate-900 p-2 text-on-surface font-bold outline-none focus:border-neonCyan"
            />
          </div>

          <div>
            <label className="block dark:text-slate-400 text-slate-900 uppercase mb-1 font-bold">RÉSZLETES FELELŐSSÉGI KÖRÖK (JSON VAGY VESSZŐVEL ELVÁLASZTVA)</label>
            <textarea
              rows={3}
              value={terminalForm.responsibilities}
              onChange={(e) => setTerminalForm({ ...terminalForm, responsibilities: e.target.value })}
              placeholder='["Zero Trust audit", "Kriptográfiai kulcskezelés", "Penetration tesztelés"]'
              className="w-full dark:bg-black bg-slate-50 border-2 dark:border-white/20 border-slate-900 p-2.5 text-on-surface font-medium outline-none focus:border-neonCyan leading-relaxed"
            />
          </div>

          <div>
            <label className="block dark:text-slate-400 text-slate-900 uppercase mb-1 font-bold">DELEGÁLÁSI SZABÁLYOK (DELEGATES TO)</label>
            <input
              type="text"
              value={terminalForm.delegates_to}
              onChange={(e) => setTerminalForm({ ...terminalForm, delegates_to: e.target.value })}
              placeholder="pl. qa, backend, conductor"
              className="w-full dark:bg-black bg-slate-50 border-2 dark:border-white/20 border-slate-900 p-2 text-on-surface font-bold outline-none focus:border-neonCyan"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t-2 dark:border-white/10 border-slate-900">
            <button
              type="button"
              onClick={onClose}
              className="border-2 dark:border-white/20 border-slate-900 px-6 py-2 uppercase dark:text-slate-300 text-slate-900 font-bold hover:bg-slate-900 hover:text-white transition-colors"
            >
              MÉGSE
            </button>
            <button
              type="submit"
              className="dark:bg-neonCyan bg-cyan-700 text-white dark:text-black font-headline font-black italic px-8 py-2 uppercase border-2 border-slate-950 shadow-[3px_3px_0_#0f172a] hover:bg-slate-950 hover:text-white transition-all"
            >
              MENTÉS 💾
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TerminalModal;
