import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Key, Plus, Trash2, Copy, Check, Terminal, Bot, RefreshCw } from 'lucide-react';

const SecurityPinTab = ({ onUpdatePin, adminFetch, showNotify }) => {
  // PIN State
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinMessage, setPinMessage] = useState('');
  const [isError, setIsError] = useState(false);

  // Agent Keys State
  const [agentKeys, setAgentKeys] = useState([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentRole, setNewAgentRole] = useState('AGENT_EDITOR');
  const [newlyIssuedKey, setNewlyIssuedKey] = useState(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const loadAgentKeys = useCallback(async () => {
    if (!adminFetch) return;
    setLoadingKeys(true);
    try {
      const res = await adminFetch('/api/admin/agent-keys');
      if (res.ok) {
        const data = await res.json();
        setAgentKeys(data.keys || []);
      }
    } catch (err) {
      console.error('Failed to load agent keys:', err);
    } finally {
      setLoadingKeys(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    loadAgentKeys();
  }, [loadAgentKeys]);

  const handlePinSubmit = async (e) => {
    e.preventDefault();
    setPinMessage('');
    setIsError(false);

    if (newPin.length < 12 || newPin.length > 64) {
      setIsError(true);
      setPinMessage('HIBA: A PIN kódnak 12 és 64 karakter között kell lennie!');
      return;
    }

    if (newPin !== confirmPin) {
      setIsError(true);
      setPinMessage('HIBA: A két megadott PIN kód nem egyezik meg!');
      return;
    }

    try {
      await onUpdatePin(newPin);
      setNewPin('');
      setConfirmPin('');
      setPinMessage('SIKER: A biztonsági PIN kód sikeresen frissítve!');
    } catch (error) {
      setIsError(true);
      setPinMessage(`HIBA: ${error?.message || 'A PIN kód frissítése sikertelen volt.'}`);
    }
  };

  const handleGenerateKey = async (e) => {
    e.preventDefault();
    if (!newAgentName.trim() || !adminFetch) return;

    try {
      const res = await adminFetch('/api/admin/agent-keys', {
        method: 'POST',
        body: JSON.stringify({
          agent_name: newAgentName.trim(),
          role: newAgentRole,
          permissions: ['READ', 'WRITE', 'PUBLISH']
        })
      });

      if (res.ok) {
        const data = await res.json();
        setNewlyIssuedKey(data.key);
        setNewAgentName('');
        if (showNotify) showNotify(`ÁGENS_REGISZTRÁLVA: ${data.key.agent_name}`);
        loadAgentKeys();
      } else {
        if (showNotify) showNotify('KEY_GENERATION_FAILED', true);
      }
    } catch {
      if (showNotify) showNotify('NETWORK_ERROR', true);
    }
  };

  const handleRevokeKey = async (id, name) => {
    if (!window.confirm(`BIZTOSAN VISSZAVONOD A(Z) "${name}" ÁGENS HOZZÁFÉRÉSÉT?`) || !adminFetch) return;
    try {
      const res = await adminFetch(`/api/admin/agent-keys/${id}/revoke`, { method: 'POST' });
      if (res.ok) {
        if (showNotify) showNotify(`HOZZÁFÉRÉS_VISSZAVONVA: #${id}`);
        loadAgentKeys();
      } else {
        if (showNotify) showNotify('REVOKE_FAILED', true);
      }
    } catch {
      if (showNotify) showNotify('NETWORK_ERROR', true);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2500);
  };

  return (
    <div className="space-y-8 font-mono">
      
      {/* ────────────────────────────────────────────────────────── */}
      {/* 1. AGENT REGISTRATION & API KEY GENERATOR                  */}
      {/* ────────────────────────────────────────────────────────── */}
      <div className="bg-[var(--surface-panel)] p-6 md:p-8 border-2 border-neonMagenta relative shadow-[6px_6px_0_#0f172a] dark:shadow-none">
        <div className="corner-bracket-tl text-neonMagenta"></div>
        <div className="corner-bracket-br text-neonMagenta"></div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b dark:border-white/10 border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] text-neonMagenta font-black uppercase tracking-widest mb-1">
              <Bot size={14} />
              <span>SZIGORÚAN VÉDETT // SAJÁT ÁGENS REGISZTRÁCIÓ & SZERKESZTÉSI JOGOK</span>
            </div>
            <h2 className="text-xl md:text-2xl font-headline font-black italic uppercase text-slate-900 dark:text-white">
              AI Ágens Hitelesítés & Token Kezelő
            </h2>
          </div>

          <button
            onClick={loadAgentKeys}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-400 dark:border-white/20 text-xs hover:border-neonMagenta transition-all self-start md:self-auto"
          >
            <RefreshCw size={12} className={loadingKeys ? 'animate-spin' : ''} />
            <span>FRISSÍTÉS</span>
          </button>
        </div>

        <p className="text-xs dark:text-slate-300 text-slate-700 leading-relaxed mb-6">
          A külső ágensek csak <strong>olvashatják és kereshetik</strong> a tudástárat. <strong>Szerkesztési és feltöltési jogot</strong> kizárólag az itt regisztrált, egyedi <code className="text-neonMagenta font-bold">PORTFOLIO_API_KEY</code> tokennel rendelkező saját ágenseid kapnak.
        </p>

        {/* Newly Issued Key Alert */}
        {newlyIssuedKey && (
          <div className="p-5 mb-6 border-2 border-plasmaGreen bg-plasmaGreen/10 animate-fade-in relative">
            <span className="text-[10px] font-bold text-plasmaGreen uppercase tracking-widest block mb-1">
              🎉 ÚJ ÁGENS SIKERESEN REGISZTRÁLVA! MÁSOLD KI AZONNAL:
            </span>
            <div className="text-xs text-slate-900 dark:text-white font-bold mb-2">
              Ágens: <span className="text-neonCyan">{newlyIssuedKey.agent_name}</span> ({newlyIssuedKey.role})
            </div>
            <div className="flex items-center gap-2 bg-[#050814] p-3 border border-plasmaGreen/50 text-plasmaGreen text-xs break-all">
              <code className="flex-1 select-all">{newlyIssuedKey.raw_key}</code>
              <button
                onClick={() => copyToClipboard(newlyIssuedKey.raw_key)}
                className="px-3 py-1 bg-plasmaGreen text-slate-950 font-bold hover:bg-white transition-all flex items-center gap-1 text-[11px] shrink-0"
              >
                {copiedKey ? <Check size={13} /> : <Copy size={13} />}
                <span>{copiedKey ? 'MÁSOLVA!' : 'MÁSOLÁS'}</span>
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 italic">
              Figyelem: A teljes titkos kulcs biztonsági okokból csak most jelenik meg, az adatbázisban kizárólag a SHA-256 hash-e tárolódik!
            </p>
          </div>
        )}

        {/* Generate New Key Form */}
        <form onSubmit={handleGenerateKey} className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-8 bg-slate-950/40 p-4 border border-slate-800">
          <div className="md:col-span-6">
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
              ÁGENS NEVE VAGY AZONOSÍTÓJA:
            </label>
            <input
              type="text"
              required
              value={newAgentName}
              onChange={(e) => setNewAgentName(e.target.value)}
              placeholder="pl. Claude-Code-Local, Antigravity-IDE, CI-Worker"
              className="w-full dark:bg-slate-900 bg-white border border-slate-700 p-2.5 text-xs text-neonCyan outline-none focus:border-neonMagenta"
            />
          </div>

          <div className="md:col-span-3">
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
              SZEREPKÖR / JOGOSULTSÁG:
            </label>
            <select
              value={newAgentRole}
              onChange={(e) => setNewAgentRole(e.target.value)}
              className="w-full dark:bg-slate-900 bg-white border border-slate-700 p-2.5 text-xs text-white outline-none focus:border-neonMagenta"
            >
              <option value="AGENT_EDITOR">AGENT_EDITOR (Írás / Szerkesztés)</option>
              <option value="AGENT_ADMIN">AGENT_ADMIN (Teljes Vezérlés)</option>
            </select>
          </div>

          <div className="md:col-span-3 flex items-end">
            <button
              type="submit"
              className="w-full bg-neonMagenta hover:bg-white hover:text-slate-950 text-white font-headline font-black italic uppercase py-2.5 px-4 text-xs transition-all flex items-center justify-center gap-1.5 shadow-[2px_2px_0_#0f172a]"
            >
              <Plus size={14} />
              <span>KULCS GENERÁLÁSA</span>
            </button>
          </div>
        </form>

        {/* Active Keys Table */}
        <div>
          <h3 className="text-xs font-bold uppercase text-slate-400 mb-3 tracking-wider flex items-center gap-2">
            <Key size={13} className="text-neonCyan" />
            <span>REGISZTRÁLT ÁGENS KULCSOK ({agentKeys.length})</span>
          </h3>

          {agentKeys.length === 0 ? (
            <div className="p-4 border border-dashed border-slate-700 text-center text-xs text-slate-500">
              Nincs még regisztrált egyedi ágens kulcs. Hozz létre egyet a fenti űrlappal!
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-800">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900/80 border-b border-slate-800 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    <th className="p-3">ID / ÁGENS NEVE</th>
                    <th className="p-3">PREFIX</th>
                    <th className="p-3">SZEREPKÖR</th>
                    <th className="p-3">STÁTUSZ</th>
                    <th className="p-3">LÉTREHOZVA</th>
                    <th className="p-3">UTOLJÁRA HASZNÁLVA</th>
                    <th className="p-3 text-right">MŰVELET</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {agentKeys.map((k) => (
                    <tr key={k.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="p-3 font-bold text-white flex items-center gap-2">
                        <Terminal size={13} className="text-neonCyan" />
                        <span>{k.agent_name}</span>
                      </td>
                      <td className="p-3 font-mono text-slate-400">{k.key_prefix}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 text-[9px] bg-slate-800 border border-slate-700 text-neonCyan font-bold">
                          {k.role}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 text-[9px] font-bold ${
                          k.status === 'ACTIVE'
                            ? 'bg-emerald-500/20 text-plasmaGreen border border-plasmaGreen/30'
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        }`}>
                          {k.status}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500 text-[11px]">
                        {new Date(k.created_at).toLocaleString('hu-HU')}
                      </td>
                      <td className="p-3 text-slate-500 text-[11px]">
                        {k.last_used_at ? new Date(k.last_used_at).toLocaleString('hu-HU') : 'Még nem volt használva'}
                      </td>
                      <td className="p-3 text-right">
                        {k.status === 'ACTIVE' && (
                          <button
                            onClick={() => handleRevokeKey(k.id, k.agent_name)}
                            className="px-2 py-1 text-[10px] text-rose-400 border border-rose-500/30 hover:bg-rose-500 hover:text-white transition-all inline-flex items-center gap-1"
                          >
                            <Trash2 size={11} />
                            <span>VISSZAVONÁS</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────── */}
      {/* 2. MASTER SECURITY PIN UPDATE                              */}
      {/* ────────────────────────────────────────────────────────── */}
      <div className="bg-[var(--surface-panel)] p-6 md:p-8 border-2 dark:border-white/10 border-slate-900 relative shadow-[6px_6px_0_#0f172a] dark:shadow-none">
        <div className="corner-bracket-tl dark:text-white/10 text-slate-900"></div>
        <div className="corner-bracket-br dark:text-white/10 text-slate-900"></div>

        <h2 className="text-xl md:text-2xl font-headline font-black italic uppercase text-on-surface mb-6 flex items-center gap-3">
          <span className="text-neonCyan">//</span> FŐ ADMINISZTRÁTORI PIN KÓD MÓDOSÍTÁSA
        </h2>

        <div className="max-w-xl">
          <p className="text-xs dark:text-slate-400 text-slate-700 font-medium mb-6 leading-relaxed">
            Az Adminisztrátori felülethez és a védett API végpontokhoz szükséges Bcrypt kriptográfiai hash-sel tárolt mester PIN kód frissítése.
          </p>

          {pinMessage && (
            <div className={`p-4 mb-6 border-2 font-bold text-xs ${isError ? 'bg-neonMagenta/15 border-neonMagenta text-neonMagenta' : 'bg-neonCyan/15 border-neonCyan text-neonCyan'}`}>
              {pinMessage}
            </div>
          )}

          <form onSubmit={handlePinSubmit} className="space-y-6 text-xs">
            <div>
              <label className="block dark:text-slate-400 text-slate-900 uppercase tracking-wider mb-2 font-bold">
                ÚJ_BIZTONSÁGI_PIN (12–64 KARAKTER):
              </label>
              <input
                type="password"
                required
                minLength={12}
                maxLength={64}
                autoComplete="new-password"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder="••••"
                className="w-full dark:bg-slate-900 bg-white border-2 dark:border-white/20 border-slate-900 p-3 text-neonCyan font-bold outline-none focus:border-neonCyan"
              />
            </div>

            <div>
              <label className="block dark:text-slate-400 text-slate-900 uppercase tracking-wider mb-2 font-bold">
                ÚJ_PIN_MEGERŐSÍTÉSE:
              </label>
              <input
                type="password"
                required
                minLength={12}
                maxLength={64}
                autoComplete="new-password"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                placeholder="••••"
                className="w-full dark:bg-slate-900 bg-white border-2 dark:border-white/20 border-slate-900 p-3 text-neonCyan font-bold outline-none focus:border-neonCyan"
              />
            </div>

            <button
              type="submit"
              className="dark:bg-neonCyan bg-cyan-700 text-white dark:text-black font-headline font-black italic uppercase px-8 py-3.5 border-2 border-slate-950 shadow-[4px_4px_0_#0f172a] hover:bg-slate-950 hover:text-white transition-all text-xs"
            >
              PIN_KÓD_MÓDOSÍTÁSA 🔒
            </button>
          </form>
        </div>
      </div>

    </div>
  );
};

export default SecurityPinTab;
