import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import AgentTransmitModal from '../modals/AgentTransmitModal';

const AgentMessagesTab = ({
  agentMessages,
  agentStats,
  onRefresh,
  onUpdateStatus,
  onDeleteMessage,
  onTransmit,
  transmitForm,
  setTransmitForm,
  showTransmitModal,
  setShowTransmitModal
}) => {
  const [agentTerminalFilter, setAgentTerminalFilter] = useState('all');
  const [agentStatusFilter, setAgentStatusFilter] = useState('all');
  const [agentTypeFilter, setAgentTypeFilter] = useState('all');
  const [agentSearchQuery, setAgentSearchQuery] = useState('');
  const [expandedAgentMsgId, setExpandedAgentMsgId] = useState(null);

  const filtered = agentMessages.filter(m => {
    if (agentTerminalFilter !== 'all') {
      const term = agentTerminalFilter.toLowerCase();
      if (m.recipient !== term && m.sender !== term && m.recipient !== 'all') return false;
    }
    if (agentStatusFilter !== 'all' && m.status !== agentStatusFilter) return false;
    if (agentTypeFilter !== 'all' && m.message_type !== agentTypeFilter) return false;
    if (agentSearchQuery.trim()) {
      const q = agentSearchQuery.toLowerCase();
      const matchSub = m.subject?.toLowerCase().includes(q);
      const matchBody = m.body?.toLowerCase().includes(q);
      const matchSender = m.sender?.toLowerCase().includes(q);
      const matchRecipient = m.recipient?.toLowerCase().includes(q);
      const matchLink = m.related_link?.toLowerCase().includes(q);
      if (!matchSub && !matchBody && !matchSender && !matchRecipient && !matchLink) return false;
    }
    return true;
  });

  const statusStyles = {
    unread: 'border-neonCyan text-neonCyan bg-neonCyan/10 shadow-[0_0_10px_rgba(0,251,251,0.2)]',
    read: 'border-slate-500 text-slate-300 bg-slate-800/40',
    archived: 'border-white/10 text-slate-500 bg-black/40'
  };

  const typeBadgeStyles = {
    handoff: 'border-neonMagenta text-neonMagenta bg-neonMagenta/10',
    channel_post: 'border-plasmaGreen text-plasmaGreen bg-plasmaGreen/10',
    status_alert: 'border-yellow-400 text-yellow-400 bg-yellow-400/10',
    task_dispatch: 'border-neonCyan text-neonCyan bg-neonCyan/10'
  };

  return (
    <div className="bg-[var(--surface-panel)] p-6 lg:p-8 border-2 dark:border-white/10 border-slate-900 relative font-mono shadow-[6px_6px_0_#0f172a] dark:shadow-none">
      <div className="corner-bracket-tl text-neonCyan"></div>
      <div className="corner-bracket-br text-neonMagenta"></div>

      {/* Header & New Transmission Button */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 pb-6 border-b-2 dark:border-white/10 border-slate-900">
        <div>
          <h2 className="text-2xl font-headline font-black italic uppercase text-on-surface flex items-center gap-3">
            <span className="text-neonCyan">//</span> AGENT TERMINAL NETWORK & HANDOFFS
          </h2>
          <p className="text-xs dark:text-slate-400 text-slate-700 font-medium mt-1">
            Valós idejű SQLite & MCP multi-agent üzenetváltás, auditált task handoffok és faliújság.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onRefresh}
            className="px-4 py-2 border-2 dark:border-white/20 border-slate-900 dark:bg-slate-900 bg-slate-100 text-slate-900 dark:text-slate-300 hover:bg-slate-900 hover:text-white uppercase text-xs font-bold flex items-center gap-2 shadow-[2px_2px_0_#0f172a] dark:shadow-none transition-colors"
          >
            <span className="material-symbols-outlined text-sm">sync</span>
            FRISSÍTÉS
          </button>
          <button
            onClick={() => setShowTransmitModal(true)}
            className="px-5 py-2 dark:bg-neonCyan bg-cyan-700 text-white dark:text-black font-headline font-black italic uppercase text-xs border-2 border-slate-950 shadow-[3px_3px_0_#0f172a] hover:bg-slate-950 hover:text-white transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">send</span>
            + ÚJ_HANDOFF_KÜLDÉSE
          </button>
        </div>
      </div>

      {/* Terminal Telemetry Pills */}
      <div className="mb-6">
        <div className="text-[10px] dark:text-slate-400 text-slate-900 uppercase tracking-wider mb-2 font-bold flex items-center gap-2">
          <span className="material-symbols-outlined text-xs text-neonCyan">terminal</span>
          TERMINÁLOK & POSTALÁDÁK (SZŰRÉS CÍMZETT / FELADÓ SZERINT):
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'all', label: 'ÖSSZES TERMINÁL', unread: agentMessages.filter(m => m.status === 'unread').length, total: agentMessages.length },
            { id: 'root', label: '@root', unread: agentStats.root?.unread || 0, total: agentStats.root?.total || 0 },
            { id: 'conductor', label: '@conductor', unread: agentStats.conductor?.unread || 0, total: agentStats.conductor?.total || 0 },
            { id: 'frontend', label: '@frontend', unread: agentStats.frontend?.unread || 0, total: agentStats.frontend?.total || 0 },
            { id: 'backend', label: '@backend', unread: agentStats.backend?.unread || 0, total: agentStats.backend?.total || 0 },
            { id: 'qa', label: '@qa', unread: agentStats.qa?.unread || 0, total: agentStats.qa?.total || 0 },
            { id: 'antigravity', label: '@antigravity', unread: agentStats.antigravity?.unread || 0, total: agentStats.antigravity?.total || 0 },
            { id: 'agentic', label: '@agentic', unread: agentStats.agentic?.unread || 0, total: agentStats.agentic?.total || 0 },
            { id: 'mcp', label: '@mcp', unread: agentStats.mcp?.unread || 0, total: agentStats.mcp?.total || 0 },
            { id: 'copywriter', label: '@copywriter', unread: agentStats.copywriter?.unread || 0, total: agentStats.copywriter?.total || 0 },
          ].map(term => (
            <button
              key={term.id}
              onClick={() => setAgentTerminalFilter(term.id)}
              className={`px-3 py-1.5 text-xs uppercase transition-all rounded-none border-2 flex items-center gap-2 ${
                agentTerminalFilter === term.id
                  ? 'dark:bg-neonCyan/20 bg-slate-900 text-white font-bold border-slate-900 dark:border-neonCyan shadow-[2px_2px_0_#0f172a]'
                  : 'dark:bg-slate-900 bg-white border-slate-900 dark:border-white/10 dark:text-slate-400 text-slate-800 font-bold hover:bg-slate-200 dark:hover:text-white'
              }`}
            >
              <span>{term.label}</span>
              {term.unread > 0 ? (
                <span className="px-1.5 py-0.2 bg-neonCyan text-black font-black text-[10px]">
                  {term.unread}
                </span>
              ) : (
                <span className="text-[10px] dark:text-slate-600 text-slate-500 font-bold">({term.total})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Filter Bar (Status, Type & Search) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 dark:bg-slate-900/80 bg-white border-2 dark:border-white/10 border-slate-900 mb-6 text-xs shadow-[3px_3px_0_#0f172a] dark:shadow-none">
        <div>
          <label className="block text-[10px] dark:text-slate-400 text-slate-900 uppercase mb-1 font-bold">STÁTUSZ SZŰRŐ</label>
          <select
            value={agentStatusFilter}
            onChange={(e) => setAgentStatusFilter(e.target.value)}
            className="w-full dark:bg-black bg-slate-50 border-2 dark:border-white/20 border-slate-900 p-2 text-on-surface font-bold outline-none focus:border-neonCyan"
          >
            <option value="all">MINDEN STÁTUSZ ({agentMessages.length})</option>
            <option value="unread">CSAK OLVASATLAN ({agentMessages.filter(m => m.status === 'unread').length})</option>
            <option value="read">OLVASOTT ({agentMessages.filter(m => m.status === 'read').length})</option>
            <option value="archived">ARCHIVÁLT ({agentMessages.filter(m => m.status === 'archived').length})</option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] dark:text-slate-400 text-slate-900 uppercase mb-1 font-bold">ÜZENET TÍPUS</label>
          <select
            value={agentTypeFilter}
            onChange={(e) => setAgentTypeFilter(e.target.value)}
            className="w-full dark:bg-black bg-slate-50 border-2 dark:border-white/20 border-slate-900 p-2 text-on-surface font-bold outline-none focus:border-neonCyan"
          >
            <option value="all">MINDEN TÍPUS</option>
            <option value="handoff">TASK HANDOFF</option>
            <option value="channel_post">CHANNEL POST (FALIÚJSÁG)</option>
            <option value="status_alert">STATUS ALERT (JELZÉS)</option>
            <option value="task_dispatch">TASK DISPATCH</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="block text-[10px] dark:text-slate-400 text-slate-900 uppercase mb-1 font-bold">KERESÉS (TÁRGY / SZÖVEG / LINK)</label>
          <div className="relative">
            <input
              type="text"
              value={agentSearchQuery}
              onChange={(e) => setAgentSearchQuery(e.target.value)}
              placeholder="Keresési kifejezés..."
              className="w-full dark:bg-black bg-slate-50 border-2 dark:border-white/20 border-slate-900 p-2 pl-8 text-on-surface font-bold outline-none focus:border-neonCyan"
            />
            <span className="material-symbols-outlined absolute left-2 top-2 dark:text-slate-500 text-slate-700 text-sm">search</span>
          </div>
        </div>
      </div>

      {/* Messages List */}
      {filtered.length === 0 ? (
        <div className="p-12 border-2 dark:border-white/10 border-slate-900 text-center dark:text-slate-500 text-slate-700 font-bold dark:bg-slate-900/40 bg-slate-100 shadow-[4px_4px_0_#0f172a] dark:shadow-none">
          <span className="material-symbols-outlined text-4xl mb-2 text-slate-600 block">inbox</span>
          NINCS A SZŰRÉSI FELTÉTELEKNEK MEGFELELŐ ÁGENS ÜZENET VAGY HANDOFF.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(msg => {
            const isExpanded = expandedAgentMsgId === msg.id;

            return (
              <div
                key={msg.id}
                className={`p-5 border-2 transition-all rounded-none shadow-[4px_4px_0_#0f172a] dark:shadow-none ${
                  msg.status === 'unread'
                    ? 'dark:bg-slate-900/90 bg-white border-neonCyan/80'
                    : 'dark:bg-slate-900/40 bg-[var(--surface-panel)] dark:border-white/10 border-slate-900'
                }`}
              >
                {/* Message Top Info Bar */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="dark:text-slate-500 text-slate-700 font-bold">#{msg.id}</span>
                    <span className={`px-2 py-0.5 border text-[10px] font-bold uppercase ${statusStyles[msg.status] || ''}`}>
                      {msg.status.toUpperCase()}
                    </span>
                    <span className={`px-2 py-0.5 border text-[10px] font-bold uppercase ${typeBadgeStyles[msg.message_type] || 'border-slate-900 dark:border-white/20 text-slate-800 dark:text-slate-400'}`}>
                      {msg.message_type.replace('_', ' ').toUpperCase()}
                    </span>
                    <span className="text-neonCyan font-black">@{msg.sender}</span>
                    <span className="dark:text-slate-500 text-slate-600">➔</span>
                    <span className="text-plasmaGreen font-black">@{msg.recipient}</span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="dark:text-slate-500 text-slate-700 font-bold mr-2">
                      {new Date(msg.created_at).toLocaleString()}
                    </span>

                    {msg.status === 'unread' && (
                      <button
                        onClick={() => onUpdateStatus(msg.id, 'read')}
                        className="px-2.5 py-1 bg-neonCyan/20 border border-neonCyan text-neonCyan hover:bg-neonCyan hover:text-black uppercase text-[10px] font-bold transition-colors"
                      >
                        OLVASVA
                      </button>
                    )}

                    {msg.status !== 'archived' && (
                      <button
                        onClick={() => onUpdateStatus(msg.id, 'archived')}
                        className="px-2.5 py-1 border dark:border-white/20 border-slate-900 dark:text-slate-400 text-slate-800 hover:bg-slate-900 hover:text-white uppercase text-[10px] font-bold transition-colors"
                      >
                        ARCHIVÁLÁS
                      </button>
                    )}

                    <button
                      onClick={() => onDeleteMessage(msg.id)}
                      className="px-2.5 py-1 border border-neonMagenta/40 text-neonMagenta hover:bg-neonMagenta hover:text-white uppercase text-[10px] font-bold transition-colors"
                    >
                      TÖRLÉS
                    </button>
                  </div>
                </div>

                {/* Subject Header */}
                <div className="flex items-start justify-between gap-4 mb-2">
                  <h4 className="font-headline font-bold text-on-surface uppercase text-sm">
                    {msg.subject}
                  </h4>
                  {msg.related_link && (
                    <span className="text-[10px] px-2 py-0.5 dark:bg-black/60 bg-slate-100 border dark:border-neonCyan/40 border-slate-900 text-neonCyan font-bold shrink-0">
                      🔗 {msg.related_link}
                    </span>
                  )}
                </div>

                {/* Message Body (Expandable if long) */}
                <div className="p-4 dark:bg-black/50 bg-slate-50 border-2 dark:border-white/5 border-slate-900 text-xs text-on-surface font-sans leading-relaxed">
                  <div className={!isExpanded && msg.body.length > 300 ? 'line-clamp-3' : ''}>
                    <ReactMarkdown>{msg.body}</ReactMarkdown>
                  </div>
                  {msg.body.length > 300 && (
                    <button
                      onClick={() => setExpandedAgentMsgId(isExpanded ? null : msg.id)}
                      className="mt-2 text-neonCyan text-[11px] font-bold hover:underline block"
                    >
                      {isExpanded ? '▲ KEVESEBB MEGJELENÍTÉSE' : '▼ TELJES ÜZENET KIBONTÁSA'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Transmit Modal */}
      <AgentTransmitModal
        isOpen={showTransmitModal}
        onClose={() => setShowTransmitModal(false)}
        transmitForm={transmitForm}
        setTransmitForm={setTransmitForm}
        onSend={onTransmit}
      />
    </div>
  );
};

export default AgentMessagesTab;
