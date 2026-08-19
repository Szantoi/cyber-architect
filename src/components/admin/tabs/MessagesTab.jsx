import React from 'react';

const MessagesTab = ({ messagesList, onMarkRead, onDeleteMessage }) => {
  return (
    <div className="bg-[var(--surface-panel)] p-8 border-2 dark:border-white/10 border-slate-900 relative shadow-[6px_6px_0_#0f172a] dark:shadow-none font-mono">
      <div className="corner-bracket-tl dark:text-white/10 text-slate-900"></div>
      <div className="corner-bracket-br dark:text-white/10 text-slate-900"></div>

      <h2 className="text-2xl font-headline font-black italic uppercase text-on-surface mb-6 flex items-center gap-3">
        <span className="text-neonCyan">//</span> INCOMING UPLINK TRANSMISSIONS
      </h2>

      {messagesList.length === 0 ? (
        <div className="p-8 text-center text-xs dark:text-slate-500 text-slate-700 border-2 dark:border-white/10 border-slate-900 font-bold">
          [NO_INCOMING_TRANSMISSIONS_RECORDED]
        </div>
      ) : (
        <div className="space-y-4">
          {messagesList.map(msg => (
            <div
              key={msg.id}
              className={`p-6 border-2 transition-all shadow-[4px_4px_0_#0f172a] dark:shadow-none ${
                msg.read_status
                  ? 'dark:bg-slate-900/60 bg-slate-50 dark:border-white/10 border-slate-900 opacity-90'
                  : 'dark:bg-slate-900/90 bg-white dark:border-neonCyan border-slate-950 shadow-[0_0_15px_rgba(0,251,251,0.15)]'
              }`}
            >
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 mb-4 pb-3 border-b-2 dark:border-white/10 border-slate-900 text-xs">
                <div>
                  <span className="text-plasmaGreen font-black text-sm uppercase mr-3">
                    FROM: {msg.identity}
                  </span>
                  <span className="dark:text-slate-500 text-slate-700 font-bold">{msg.created_at}</span>
                </div>
                <div className="flex items-center gap-3">
                  {!msg.read_status && (
                    <button
                      onClick={() => onMarkRead(msg.id)}
                      className="px-3 py-1 bg-neonCyan/20 border border-neonCyan text-neonCyan hover:bg-neonCyan hover:text-black uppercase text-[10px] font-black transition-colors"
                    >
                      MARK_AS_ACKNOWLEDGED
                    </button>
                  )}
                  <button
                    onClick={() => onDeleteMessage(msg.id)}
                    className="text-neonMagenta font-black hover:underline uppercase text-[10px]"
                  >
                    PURGE_RECORD
                  </button>
                </div>
              </div>

              <div className="mb-2">
                <span className="text-[10px] dark:text-slate-500 text-slate-900 uppercase font-black">SUBJECT_HEADER: </span>
                <span className="text-on-surface font-headline uppercase font-black text-sm">{msg.subject}</span>
              </div>

              <div className="p-4 dark:bg-black/60 bg-slate-100 border-2 dark:border-white/5 border-slate-900 text-xs text-on-surface whitespace-pre-wrap leading-relaxed font-mono font-medium">
                {msg.message}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MessagesTab;
