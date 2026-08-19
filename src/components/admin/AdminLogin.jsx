import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const AdminLogin = ({ onLogin }) => {
  const [pinInput, setPinInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setIsLoading(true);

    try {
      const result = await onLogin(pinInput);
      if (!result?.success) {
        setAuthError('HOZZÁFÉRÉS ELUTASÍTVA: ÉRVÉNYTELEN BIZTONSÁGI PIN KÓD');
      }
    } catch {
      setAuthError('HÁLÓZATI HIBA: A SZERVER NEM ELÉRHETŐ');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pt-32 pb-20 flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 wireframe-grid opacity-15"></div>
      <div className="w-full max-w-md p-8 bg-[var(--surface-panel)] border-2 dark:border-white/10 border-slate-900 relative z-10 shadow-[8px_8px_0_#0f172a] dark:shadow-2xl">
        <div className="corner-bracket-tl text-neonCyan"></div>
        <div className="corner-bracket-br text-neonMagenta"></div>

        <div className="flex items-center gap-3 mb-6 pb-4 border-b-2 dark:border-white/10 border-slate-900">
          <span className="material-symbols-outlined text-neonCyan text-2xl">admin_panel_settings</span>
          <div>
            <h2 className="text-xl font-headline font-black italic uppercase text-on-surface">
              CYBER_CORE // AUTH
            </h2>
            <p className="text-[10px] font-mono text-secondary-fixed uppercase tracking-widest font-bold">
              ADMINISZTRÁTORI HITELESÍTÉS
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 font-mono text-xs">
          <div>
            <label className="block dark:text-slate-400 text-slate-900 uppercase tracking-wider mb-2 font-bold">
              BIZTONSÁGI_PIN:~$
            </label>
            <input
              type="password"
              required
              autoFocus
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="••••"
              className="w-full bg-[var(--surface-panel)] border-2 dark:border-white/20 border-slate-900 p-3 text-center text-2xl tracking-[0.5em] text-neonCyan font-bold outline-none focus:border-neonCyan transition-colors shadow-inner"
            />
          </div>

          {authError && (
            <div className="p-3 bg-neonMagenta/10 border-2 border-neonMagenta text-neonMagenta text-[11px] font-bold animate-pulse">
              [HIBA] {authError}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className={`w-full dark:bg-neonCyan bg-cyan-700 text-white dark:text-black font-headline font-black italic uppercase py-3.5 border-2 border-slate-950 shadow-[4px_4px_0_#0f172a] hover:bg-slate-950 hover:text-white transition-all text-sm ${isLoading ? 'opacity-50 cursor-wait' : ''}`}
          >
            {isLoading ? 'HITELESÍTÉS FOLYAMATBAN...' : 'KONZOL MEGNYITÁSA ➔'}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t-2 dark:border-white/10 border-slate-900 flex justify-between items-center text-[10px] font-mono">
          <Link to="/" className="text-slate-500 hover:text-neonCyan uppercase font-bold">
            ← VISSZA A KEZDŐLAPRA
          </Link>
          <span className="text-slate-600">PORTFOLIO_OS v4.2</span>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
