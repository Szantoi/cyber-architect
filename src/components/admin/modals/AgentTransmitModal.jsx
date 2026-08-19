import React from 'react';

const AgentTransmitModal = ({ isOpen, onClose, transmitForm, setTransmitForm, onSend }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 font-mono">
      <div className="w-full max-w-2xl bg-[var(--surface-panel)] border-2 dark:border-neonCyan border-slate-900 p-6 relative shadow-[8px_8px_0_#0f172a] dark:shadow-[0_0_40px_rgba(0,251,251,0.25)]">
        <div className="corner-bracket-tl text-neonCyan"></div>
        <div className="corner-bracket-br text-neonMagenta"></div>

        <div className="flex items-center justify-between pb-4 mb-4 border-b-2 dark:border-white/10 border-slate-900">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-neonCyan text-2xl">send</span>
            <h3 className="text-lg font-headline font-black italic uppercase text-on-surface">
              ÚJ ÁGENS ÜZENET / TASK HANDOFF
            </h3>
          </div>
          <button
            onClick={onClose}
            className="dark:text-slate-400 text-slate-800 hover:text-neonMagenta text-lg font-bold"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSend} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block dark:text-slate-400 text-slate-900 uppercase mb-1 font-bold">FELADÓ TERMINÁL (SENDER)</label>
              <select
                value={transmitForm.sender}
                onChange={(e) => setTransmitForm({ ...transmitForm, sender: e.target.value })}
                className="w-full dark:bg-black bg-slate-50 border-2 dark:border-white/20 border-slate-900 p-2 text-neonCyan font-bold outline-none focus:border-neonCyan"
              >
                <option value="root">@root (Főirányító)</option>
                <option value="conductor">@conductor (Koordinátor)</option>
                <option value="frontend">@frontend (Frontend Fejlesztő)</option>
                <option value="backend">@backend (Backend & RAG)</option>
                <option value="qa">@qa (Tesztelő & Minőségbiztosító)</option>
                <option value="antigravity">@antigravity (Fő Rendszerarchitekt)</option>
                <option value="agentic">@agentic (Multi-Agent Rendszertervező)</option>
                <option value="mcp">@mcp (Protokoll & Eszközfejlesztő)</option>
                <option value="copywriter">@copywriter (Szakmai Szövegíró)</option>
              </select>
            </div>

            <div>
              <label className="block dark:text-slate-400 text-slate-900 uppercase mb-1 font-bold">CÍMZETT TERMINÁL (RECIPIENT)</label>
              <select
                value={transmitForm.recipient}
                onChange={(e) => setTransmitForm({ ...transmitForm, recipient: e.target.value })}
                className="w-full dark:bg-black bg-slate-50 border-2 dark:border-white/20 border-slate-900 p-2 text-plasmaGreen font-bold outline-none focus:border-plasmaGreen"
              >
                <option value="all">@all (Minden Terminál // Faliújság)</option>
                <option value="root">@root (Főirányító)</option>
                <option value="conductor">@conductor (Koordinátor)</option>
                <option value="frontend">@frontend (Frontend Fejlesztő)</option>
                <option value="backend">@backend (Backend & RAG)</option>
                <option value="qa">@qa (Tesztelő & Minőségbiztosító)</option>
                <option value="antigravity">@antigravity (Fő Rendszerarchitekt)</option>
                <option value="agentic">@agentic (Multi-Agent Rendszertervező)</option>
                <option value="mcp">@mcp (Protokoll & Eszközfejlesztő)</option>
                <option value="copywriter">@copywriter (Szakmai Szövegíró)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block dark:text-slate-400 text-slate-900 uppercase mb-1 font-bold">ÜZENET TÍPUS</label>
              <select
                value={transmitForm.message_type}
                onChange={(e) => setTransmitForm({ ...transmitForm, message_type: e.target.value })}
                className="w-full dark:bg-black bg-slate-50 border-2 dark:border-white/20 border-slate-900 p-2 text-on-surface font-bold outline-none focus:border-neonCyan"
              >
                <option value="handoff">TASK HANDOFF (Feladatátadás)</option>
                <option value="channel_post">CHANNEL POST (Közlemény)</option>
                <option value="status_alert">STATUS ALERT (Figyelmeztetés)</option>
                <option value="task_dispatch">TASK DISPATCH (Megbízás)</option>
              </select>
            </div>

            <div>
              <label className="block dark:text-slate-400 text-slate-900 uppercase mb-1 font-bold">KAPCSOLÓDÓ LINK / FÁJL ELÉRÉS</label>
              <input
                type="text"
                value={transmitForm.related_link}
                onChange={(e) => setTransmitForm({ ...transmitForm, related_link: e.target.value })}
                placeholder="pl. docs/QUALITY.md vagy tasks.yaml"
                className="w-full dark:bg-black bg-slate-50 border-2 dark:border-white/20 border-slate-900 p-2 text-on-surface font-bold outline-none focus:border-neonCyan"
              />
            </div>
          </div>

          <div>
            <label className="block dark:text-slate-400 text-slate-900 uppercase mb-1 font-bold">TÁRGY (SUBJECT)</label>
            <input
              type="text"
              required
              value={transmitForm.subject}
              onChange={(e) => setTransmitForm({ ...transmitForm, subject: e.target.value })}
              placeholder="pl. TASK-03 Backend Unit tesztek átadása verifikációra"
              className="w-full dark:bg-black bg-slate-50 border-2 dark:border-white/20 border-slate-900 p-2 text-on-surface font-bold outline-none focus:border-neonCyan"
            />
          </div>

          <div>
            <label className="block dark:text-slate-400 text-slate-900 uppercase mb-1 font-bold">ÜZENET SZÖVEGE (BODY // MARKDOWN SUPPORTED)</label>
            <textarea
              rows={5}
              required
              value={transmitForm.body}
              onChange={(e) => setTransmitForm({ ...transmitForm, body: e.target.value })}
              placeholder="Írd ide a részletes feladatleírást vagy státuszjelentést..."
              className="w-full dark:bg-black bg-slate-50 border-2 dark:border-white/20 border-slate-900 p-3 text-on-surface font-medium outline-none focus:border-neonCyan leading-relaxed"
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
              TOVÁBBÍTÁS ➔
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AgentTransmitModal;
