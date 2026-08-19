import React, { useState } from 'react';
import TerminalModal from '../modals/TerminalModal';
import WorkspaceEditor from '../matrix/WorkspaceEditor';

const OrgMatrixTab = ({
  terminalsList,
  agentStats,
  onRefresh,
  onSaveTerminal,
  onDeleteTerminal,
  onSelectTerminalForInbox,
  adminFetch,
  showNotify
}) => {
  const [orgViewMode, setOrgViewMode] = useState('tree');
  const [editingTerminal, setEditingTerminal] = useState(null);
  const [showTerminalModal, setShowTerminalModal] = useState(false);
  const [terminalForm, setTerminalForm] = useState({
    id: '',
    name: '',
    pod: 'Engineering',
    lead_id: 'tech-lead',
    icon: 'terminal',
    color: '#00FFFF',
    role_description: '',
    responsibilities: '',
    delegates_to: '',
    sort_order: 0
  });

  // Workspace editor state
  const [selectedTerminalWorkspace, setSelectedTerminalWorkspace] = useState(null);
  const [workspaceFiles, setWorkspaceFiles] = useState([]);
  const [selectedFilePath, setSelectedFilePath] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [fileOriginalContent, setFileOriginalContent] = useState('');
  const [isMarkdownPreview, setIsMarkdownPreview] = useState(false);
  const [isSavingFile, setIsSavingFile] = useState(false);

  const openNewTerminalModal = () => {
    setEditingTerminal(null);
    setTerminalForm({
      id: '',
      name: '',
      pod: 'Engineering',
      lead_id: 'tech-lead',
      icon: 'terminal',
      color: '#00FFFF',
      role_description: '',
      responsibilities: '',
      delegates_to: '',
      sort_order: terminalsList.length + 1
    });
    setShowTerminalModal(true);
  };

  const openEditTerminalModal = (term) => {
    setEditingTerminal(term);
    setTerminalForm({
      id: term.id,
      name: term.name,
      pod: term.pod || 'Engineering',
      lead_id: term.lead_id || '',
      icon: term.icon || 'terminal',
      color: term.color || '#00FFFF',
      role_description: term.role_description || '',
      responsibilities: Array.isArray(term.responsibilities) ? term.responsibilities.join('\n') : (term.responsibilities || ''),
      delegates_to: Array.isArray(term.delegates_to) ? term.delegates_to.join(', ') : (term.delegates_to || ''),
      sort_order: term.sort_order || 0
    });
    setShowTerminalModal(true);
  };

  const handleSaveTerminalSubmit = async (e) => {
    e.preventDefault();
    try {
      const respArray = terminalForm.responsibilities
        ? terminalForm.responsibilities.split('\n').map(r => r.trim()).filter(Boolean)
        : [];
      const delegArray = terminalForm.delegates_to
        ? terminalForm.delegates_to.split(',').map(d => d.trim().replace(/^@/, '')).filter(Boolean)
        : [];

      const payload = {
        ...terminalForm,
        responsibilities: respArray,
        delegates_to: delegArray
      };

      await onSaveTerminal(payload, editingTerminal);
      setShowTerminalModal(false);
    } catch {
      showNotify('TERMINAL_SAVE_FAILED', true);
    }
  };

  const openTerminalWorkspace = async (term) => {
    setSelectedTerminalWorkspace(term);
    setSelectedFilePath('');
    setFileContent('');
    setFileOriginalContent('');
    setIsMarkdownPreview(false);

    try {
      const res = await adminFetch(`/api/admin/terminals/${term.id}/files`);
      if (res.ok) {
        const data = await res.json();
        setWorkspaceFiles(data.files || []);

        const defaultFile = data.files.find(f => !f.is_dir && f.name === 'AGENTS.md') || data.files.find(f => !f.is_dir && f.is_markdown);
        if (defaultFile) {
          loadTerminalFile(term.id, defaultFile.path);
        }
      }
    } catch {
      showNotify('FAILED_TO_LOAD_WORKSPACE_FILES', true);
    }
  };

  const loadTerminalFile = async (terminalId, filePath) => {
    try {
      const res = await adminFetch(`/api/admin/terminals/${terminalId}/file?path=${encodeURIComponent(filePath)}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedFilePath(filePath);
        setFileContent(data.content || '');
        setFileOriginalContent(data.content || '');
      } else {
        const err = await res.json();
        showNotify(err.error || 'FILE_READ_FAILED', true);
      }
    } catch {
      showNotify('FILE_READ_FAILED', true);
    }
  };

  const handleSaveTerminalFile = async () => {
    if (!selectedTerminalWorkspace || !selectedFilePath) return;
    setIsSavingFile(true);
    try {
      const res = await adminFetch(`/api/admin/terminals/${selectedTerminalWorkspace.id}/file`, {
        method: 'PUT',
        body: JSON.stringify({
          path: selectedFilePath,
          content: fileContent
        })
      });

      if (res.ok) {
        showNotify(`FILE_SAVED: @${selectedTerminalWorkspace.id}/${selectedFilePath}`);
        setFileOriginalContent(fileContent);
      } else {
        const err = await res.json();
        showNotify(err.error || 'FILE_SAVE_FAILED', true);
      }
    } catch {
      showNotify('FILE_SAVE_FAILED', true);
    } finally {
      setIsSavingFile(false);
    }
  };

  const closeTerminalWorkspace = () => {
    if (fileContent !== fileOriginalContent) {
      if (!window.confirm('Nem mentett módosításaid vannak. Biztosan bezárod a munkaterületet?')) {
        return;
      }
    }
    setSelectedTerminalWorkspace(null);
    setWorkspaceFiles([]);
    setSelectedFilePath('');
    setFileContent('');
    setFileOriginalContent('');
  };

  return (
    <div className="bg-[var(--surface-panel)] p-6 lg:p-8 border-2 dark:border-white/10 border-slate-900 relative font-mono shadow-[6px_6px_0_#0f172a] dark:shadow-none">
      <div className="corner-bracket-tl text-neonCyan"></div>
      <div className="corner-bracket-br text-neonMagenta"></div>

      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 pb-6 border-b-2 dark:border-white/10 border-slate-900">
        <div>
          <h2 className="text-2xl font-headline font-black italic uppercase text-on-surface flex items-center gap-3">
            <span className="text-neonCyan">//</span> ORGANIZATIONAL MATRIX & AGENT NETWORK
          </h2>
          <p className="text-xs dark:text-slate-400 text-slate-700 font-medium mt-1">
            Szervezeti hierarchia, Pod architektúra és Ágens Munkaterek (AGENTS.md / Markdown Studio).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* View Mode Switcher */}
          <div className="flex border-2 dark:border-white/20 border-slate-900 bg-slate-100 dark:bg-black/60 p-0.5">
            <button
              onClick={() => setOrgViewMode('tree')}
              className={`px-3 py-1.5 text-xs font-bold uppercase flex items-center gap-1.5 transition-all ${
                orgViewMode === 'tree'
                  ? 'dark:bg-neonCyan bg-slate-900 text-white dark:text-black shadow-sm'
                  : 'dark:text-slate-400 text-slate-800 hover:text-slate-950'
              }`}
            >
              <span className="material-symbols-outlined text-sm">account_tree</span>
              <span>HIERARCHIA FA</span>
            </button>
            <button
              onClick={() => setOrgViewMode('grid')}
              className={`px-3 py-1.5 text-xs font-bold uppercase flex items-center gap-1.5 transition-all ${
                orgViewMode === 'grid'
                  ? 'dark:bg-neonCyan bg-slate-900 text-white dark:text-black shadow-sm'
                  : 'dark:text-slate-400 text-slate-800 hover:text-slate-950'
              }`}
            >
              <span className="material-symbols-outlined text-sm">grid_view</span>
              <span>POD KÁRTYÁK</span>
            </button>
          </div>

          <button
            onClick={onRefresh}
            className="px-4 py-2 border-2 dark:border-white/20 border-slate-900 dark:bg-slate-900 bg-slate-100 text-slate-900 dark:text-slate-300 hover:bg-slate-900 hover:text-white uppercase text-xs font-bold flex items-center gap-2 shadow-[2px_2px_0_#0f172a] dark:shadow-none transition-colors"
          >
            <span className="material-symbols-outlined text-sm">sync</span>
            FRISSÍTÉS
          </button>

          <button
            onClick={openNewTerminalModal}
            className="px-5 py-2 dark:bg-neonCyan bg-cyan-700 text-white dark:text-black font-headline font-black italic uppercase text-xs border-2 border-slate-950 shadow-[3px_3px_0_#0f172a] hover:bg-slate-950 hover:text-white transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            + ÚJ_TERMINÁL
          </button>
        </div>
      </div>

      {/* VIEW MODE 1: HIERARCHICAL TREE VIEW */}
      {orgViewMode === 'tree' && (
        <div className="p-6 dark:bg-black/40 bg-slate-50 border-2 dark:border-white/10 border-slate-900 overflow-x-auto shadow-inner">
          <div className="min-w-[900px] flex flex-col items-center space-y-6">
            {/* LEVEL 1: ROOT */}
            {(() => {
              const rootTerm = terminalsList.find(t => t.id === 'root') || {
                id: 'root',
                name: 'Főirányító & Stratéga (Szántói Gábor)',
                pod: 'Executive',
                icon: 'diamond',
                role_description: 'Stratégiai döntések, minőségi kapuk és release authority.'
              };
              const unread = agentStats[rootTerm.id]?.unread || 0;

              return (
                <div className="flex flex-col items-center">
                  <div className="w-80 p-4 dark:bg-slate-900 bg-white border-2 border-slate-900 relative shadow-[4px_4px_0_#0f172a] dark:shadow-[0_0_25px_rgba(0,251,251,0.25)] group hover:scale-[1.02] transition-all">
                    <div className="corner-bracket-tl text-neonCyan"></div>
                    <div className="corner-bracket-br text-neonMagenta"></div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 dark:bg-black bg-slate-100 border-2 dark:border-neonCyan border-slate-900 text-neonCyan">
                          <span className="material-symbols-outlined text-base">diamond</span>
                        </div>
                        <div>
                          <span className="text-neonCyan font-black text-sm block">@{rootTerm.id}</span>
                          <span className="text-[9px] text-plasmaGreen uppercase font-bold">LEVEL 1 // FŐIRÁNYÍTÓ (CEO)</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {unread > 0 && (
                          <span className="px-1.5 py-0.5 bg-neonCyan text-black font-black text-[9px] animate-pulse">
                            {unread} ÚJ
                          </span>
                        )}
                        <button
                          onClick={() => openEditTerminalModal(rootTerm)}
                          className="p-1 dark:text-slate-400 text-slate-700 hover:text-slate-950 font-bold"
                          title="Szerkesztés"
                        >
                          <span className="material-symbols-outlined text-xs">edit</span>
                        </button>
                      </div>
                    </div>
                    <h4 className="text-xs font-bold text-on-surface uppercase mb-1 font-headline">{rootTerm.name}</h4>
                    <p className="text-[10px] dark:text-slate-400 text-slate-700 font-medium line-clamp-2 mb-3 leading-relaxed">{rootTerm.role_description}</p>
                    <div className="flex items-center gap-2 pt-2 border-t-2 dark:border-white/10 border-slate-900 text-[10px]">
                      <button
                        onClick={() => openTerminalWorkspace(rootTerm)}
                        className="flex-1 py-1 dark:bg-black/60 bg-slate-100 border-2 dark:border-neonCyan/40 border-slate-900 text-neonCyan hover:bg-neonCyan hover:text-black uppercase font-bold text-[9px] transition-colors flex items-center justify-center gap-1 shadow-sm"
                      >
                        <span className="material-symbols-outlined text-xs">folder_open</span>
                        WORKSPACE
                      </button>
                      <button
                        onClick={() => onSelectTerminalForInbox(rootTerm.id)}
                        className="py-1 px-2 border-2 dark:border-white/20 border-slate-900 dark:text-slate-400 text-slate-800 font-bold hover:bg-slate-900 hover:text-white uppercase text-[9px]"
                      >
                        INBOX
                      </button>
                    </div>
                  </div>

                  {/* Line from Root to Conductor */}
                  <div className="w-0.5 h-10 bg-slate-900 dark:bg-neonCyan shadow-[0_0_8px_#00FFFF] relative">
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 dark:bg-neonCyan rotate-45"></span>
                  </div>
                </div>
              );
            })()}

            {/* LEVEL 2: CONDUCTOR */}
            {(() => {
              const condTerm = terminalsList.find(t => t.id === 'conductor') || {
                id: 'conductor',
                name: 'Task Orchestrator & Koordinátor (COO)',
                pod: 'Executive',
                icon: 'alt_route',
                role_description: 'Taskok bontása, sprint tervezés és diszpečelés.'
              };
              const unread = agentStats[condTerm.id]?.unread || 0;

              return (
                <div className="flex flex-col items-center">
                  <div className="w-80 p-4 dark:bg-slate-900 bg-white border-2 border-slate-900 relative shadow-[4px_4px_0_#0f172a] dark:shadow-[0_0_20px_rgba(0,251,251,0.2)] group hover:scale-[1.02] transition-all">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 dark:bg-black bg-slate-100 border-2 dark:border-neonCyan border-slate-900 text-neonCyan">
                          <span className="material-symbols-outlined text-base">alt_route</span>
                        </div>
                        <div>
                          <span className="text-neonCyan font-black text-sm block">@{condTerm.id}</span>
                          <span className="text-[9px] text-neonCyan uppercase font-bold">LEVEL 2 // KOORDINÁTOR (COO)</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {unread > 0 && (
                          <span className="px-1.5 py-0.5 bg-neonCyan text-black font-black text-[9px]">
                            {unread} ÚJ
                          </span>
                        )}
                        <button
                          onClick={() => openEditTerminalModal(condTerm)}
                          className="p-1 dark:text-slate-400 text-slate-700 hover:text-slate-950 font-bold"
                          title="Szerkesztés"
                        >
                          <span className="material-symbols-outlined text-xs">edit</span>
                        </button>
                      </div>
                    </div>
                    <h4 className="text-xs font-bold text-on-surface uppercase mb-1 font-headline">{condTerm.name}</h4>
                    <p className="text-[10px] dark:text-slate-400 text-slate-700 font-medium line-clamp-2 mb-3 leading-relaxed">{condTerm.role_description}</p>
                    <div className="flex items-center gap-2 pt-2 border-t-2 dark:border-white/10 border-slate-900 text-[10px]">
                      <button
                        onClick={() => openTerminalWorkspace(condTerm)}
                        className="flex-1 py-1 dark:bg-black/60 bg-slate-100 border-2 dark:border-neonCyan/40 border-slate-900 text-neonCyan hover:bg-neonCyan hover:text-black uppercase font-bold text-[9px] transition-colors flex items-center justify-center gap-1 shadow-sm"
                      >
                        <span className="material-symbols-outlined text-xs">folder_open</span>
                        WORKSPACE
                      </button>
                      <button
                        onClick={() => onSelectTerminalForInbox(condTerm.id)}
                        className="py-1 px-2 border-2 dark:border-white/20 border-slate-900 dark:text-slate-400 text-slate-800 font-bold hover:bg-slate-900 hover:text-white uppercase text-[9px]"
                      >
                        INBOX
                      </button>
                    </div>
                  </div>

                  {/* Central Bus Spine */}
                  <div className="w-0.5 h-8 bg-slate-900 dark:bg-white/40"></div>
                </div>
              );
            })()}

            {/* LEVEL 3 & 4: 3 POD COLUMNS WITH HORIZONTAL CONNECTOR BUS */}
            <div className="w-full relative">
              <div className="absolute top-0 left-[18%] right-[18%] h-0.5 bg-gradient-to-r from-neonCyan via-neonMagenta to-plasmaGreen shadow-[0_0_10px_rgba(0,251,251,0.3)]">
                <span className="absolute left-0 top-0 w-2.5 h-2.5 -translate-y-1 bg-neonCyan shadow-[0_0_8px_#00FFFF]"></span>
                <span className="absolute left-1/2 -translate-x-1/2 top-0 w-2.5 h-2.5 -translate-y-1 bg-neonMagenta shadow-[0_0_8px_#FF00FF]"></span>
                <span className="absolute right-0 top-0 w-2.5 h-2.5 -translate-y-1 bg-plasmaGreen shadow-[0_0_8px_#80FF00]"></span>
              </div>

              <div className="grid grid-cols-3 gap-6 pt-8">
                {/* ---------------- POD 1: ENGINEERING ---------------- */}
                <div className="flex flex-col items-center">
                  <div className="w-0.5 h-6 bg-neonCyan mb-2"></div>

                  {/* Pod Lead: @tech-lead */}
                  {(() => {
                    const lead = terminalsList.find(t => t.id === 'tech-lead') || {
                      id: 'tech-lead',
                      name: 'Mérnöki Vezető (Tech Lead)',
                      icon: 'architecture',
                      role_description: 'Architektúra, API szerződések és kódminőség felügyelete.'
                    };
                    return (
                      <div className="w-full max-w-[280px] p-3.5 dark:bg-slate-900/90 bg-white border-2 border-slate-900 relative shadow-[3px_3px_0_#0f172a] dark:shadow-[0_0_15px_rgba(0,251,251,0.2)]">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-neonCyan text-base">architecture</span>
                            <span className="text-neonCyan font-bold text-xs">@{lead.id}</span>
                          </div>
                          <span className="px-1.5 py-0.2 bg-neonCyan/20 text-neonCyan text-[8px] font-bold uppercase border border-neonCyan/30">POD LEAD</span>
                        </div>
                        <h5 className="text-[11px] font-bold text-on-surface uppercase mb-1">{lead.name}</h5>
                        <p className="text-[9px] dark:text-slate-400 text-slate-700 font-medium line-clamp-2 mb-2 leading-relaxed">{lead.role_description}</p>
                        <div className="flex items-center gap-1.5 pt-1.5 border-t-2 dark:border-white/10 border-slate-900">
                          <button
                            onClick={() => openTerminalWorkspace(lead)}
                            className="flex-1 py-0.5 dark:bg-black/60 bg-slate-100 border-2 dark:border-neonCyan/30 border-slate-900 text-neonCyan hover:bg-neonCyan hover:text-black uppercase text-[8px] font-bold"
                          >
                            WORKSPACE
                          </button>
                          <button
                            onClick={() => openEditTerminalModal(lead)}
                            className="p-0.5 dark:text-slate-400 text-slate-700 hover:text-slate-950 font-bold"
                          >
                            <span className="material-symbols-outlined text-xs">edit</span>
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="w-0.5 h-6 bg-neonCyan/50"></div>
                  <div className="w-full max-w-[260px] h-0.5 bg-neonCyan/40 relative">
                    <span className="absolute left-0 top-0 w-1.5 h-1.5 -translate-y-0.5 bg-neonCyan"></span>
                    <span className="absolute left-1/2 -translate-x-1/2 top-0 w-1.5 h-1.5 -translate-y-0.5 bg-neonCyan"></span>
                    <span className="absolute right-0 top-0 w-1.5 h-1.5 -translate-y-0.5 bg-neonCyan"></span>
                  </div>

                  <div className="w-full space-y-3 pt-3">
                    {terminalsList.filter(t => t.pod === 'Engineering' && t.id !== 'tech-lead').map(term => {
                      const unread = agentStats[term.id]?.unread || 0;
                      return (
                        <div key={term.id} className="p-3 dark:bg-black/60 bg-slate-50 border-2 dark:border-white/10 border-slate-900 shadow-[2px_2px_0_#0f172a] dark:shadow-none hover:border-neonCyan transition-all">
                          <div className="flex items-start justify-between gap-1 mb-1">
                            <div className="flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-neonCyan text-xs">{term.icon || 'terminal'}</span>
                              <span className="text-neonCyan font-bold text-xs">@{term.id}</span>
                            </div>
                            {unread > 0 && (
                              <span className="px-1 py-0.2 bg-neonCyan text-black font-bold text-[8px]">{unread} ÚJ</span>
                            )}
                          </div>
                          <h6 className="text-[10px] font-bold text-on-surface uppercase">{term.name}</h6>
                          <p className="text-[9px] dark:text-slate-400 text-slate-700 font-medium line-clamp-2 mt-0.5 mb-2 leading-relaxed">{term.role_description}</p>
                          <div className="flex items-center justify-between pt-1.5 border-t-2 dark:border-white/10 border-slate-900 text-[8px]">
                            <button
                              onClick={() => openTerminalWorkspace(term)}
                              className="text-neonCyan font-bold hover:underline uppercase flex items-center gap-0.5"
                            >
                              <span>MUNKATERÜLET</span>
                              <span className="material-symbols-outlined text-[10px]">folder_open</span>
                            </button>
                            <button
                              onClick={() => openEditTerminalModal(term)}
                              className="dark:text-slate-500 text-slate-700 font-bold hover:text-slate-950"
                            >
                              SZERKESZTÉS ✏️
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ---------------- POD 2: MARKETING ---------------- */}
                <div className="flex flex-col items-center">
                  <div className="w-0.5 h-6 bg-neonMagenta mb-2"></div>

                  {/* Pod Lead: @marketing-lead */}
                  {(() => {
                    const lead = terminalsList.find(t => t.id === 'marketing-lead') || {
                      id: 'marketing-lead',
                      name: 'Marketing & Tartalmi Stratéga',
                      icon: 'campaign',
                      role_description: 'Szakmai pozicionálás, célcsoport-fókusz és lead generálás.'
                    };
                    return (
                      <div className="w-full max-w-[280px] p-3.5 dark:bg-slate-900/90 bg-white border-2 border-slate-900 relative shadow-[3px_3px_0_#0f172a] dark:shadow-[0_0_15px_rgba(255,0,255,0.2)]">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-neonMagenta text-base">campaign</span>
                            <span className="text-neonMagenta font-bold text-xs">@{lead.id}</span>
                          </div>
                          <span className="px-1.5 py-0.2 bg-neonMagenta/20 text-neonMagenta text-[8px] font-bold uppercase border border-neonMagenta/30">POD LEAD</span>
                        </div>
                        <h5 className="text-[11px] font-bold text-on-surface uppercase mb-1">{lead.name}</h5>
                        <p className="text-[9px] dark:text-slate-400 text-slate-700 font-medium line-clamp-2 mb-2 leading-relaxed">{lead.role_description}</p>
                        <div className="flex items-center gap-1.5 pt-1.5 border-t-2 dark:border-white/10 border-slate-900">
                          <button
                            onClick={() => openTerminalWorkspace(lead)}
                            className="flex-1 py-0.5 dark:bg-black/60 bg-slate-100 border-2 dark:border-neonMagenta/30 border-slate-900 text-neonMagenta hover:bg-neonMagenta hover:text-white uppercase text-[8px] font-bold"
                          >
                            WORKSPACE
                          </button>
                          <button
                            onClick={() => openEditTerminalModal(lead)}
                            className="p-0.5 dark:text-slate-400 text-slate-700 hover:text-slate-950 font-bold"
                          >
                            <span className="material-symbols-outlined text-xs">edit</span>
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="w-0.5 h-6 bg-neonMagenta/50"></div>
                  <div className="w-full max-w-[260px] h-0.5 bg-neonMagenta/40 relative">
                    <span className="absolute left-0 top-0 w-1.5 h-1.5 -translate-y-0.5 bg-neonMagenta"></span>
                    <span className="absolute right-0 top-0 w-1.5 h-1.5 -translate-y-0.5 bg-neonMagenta"></span>
                  </div>

                  <div className="w-full space-y-3 pt-3">
                    {terminalsList.filter(t => t.pod === 'Marketing' && t.id !== 'marketing-lead').map(term => {
                      const unread = agentStats[term.id]?.unread || 0;
                      return (
                        <div key={term.id} className="p-3 dark:bg-black/60 bg-slate-50 border-2 dark:border-white/10 border-slate-900 shadow-[2px_2px_0_#0f172a] dark:shadow-none hover:border-neonMagenta transition-all">
                          <div className="flex items-start justify-between gap-1 mb-1">
                            <div className="flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-neonMagenta text-xs">{term.icon || 'edit_note'}</span>
                              <span className="text-neonMagenta font-bold text-xs">@{term.id}</span>
                            </div>
                            {unread > 0 && (
                              <span className="px-1 py-0.2 bg-neonMagenta text-white font-bold text-[8px]">{unread} ÚJ</span>
                            )}
                          </div>
                          <h6 className="text-[10px] font-bold text-on-surface uppercase">{term.name}</h6>
                          <p className="text-[9px] dark:text-slate-400 text-slate-700 font-medium line-clamp-2 mt-0.5 mb-2 leading-relaxed">{term.role_description}</p>
                          <div className="flex items-center justify-between pt-1.5 border-t-2 dark:border-white/10 border-slate-900 text-[8px]">
                            <button
                              onClick={() => openTerminalWorkspace(term)}
                              className="text-neonMagenta font-bold hover:underline uppercase flex items-center gap-0.5"
                            >
                              <span>MUNKATERÜLET</span>
                              <span className="material-symbols-outlined text-[10px]">folder_open</span>
                            </button>
                            <button
                              onClick={() => openEditTerminalModal(term)}
                              className="dark:text-slate-500 text-slate-700 font-bold hover:text-slate-950"
                            >
                              SZERKESZTÉS ✏️
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ---------------- POD 3: AGENT OPERATIONS ---------------- */}
                <div className="flex flex-col items-center">
                  <div className="w-0.5 h-6 bg-plasmaGreen mb-2"></div>

                  {/* Pod Lead: @agentic */}
                  {(() => {
                    const lead = terminalsList.find(t => t.id === 'agentic') || {
                      id: 'agentic',
                      name: 'Ágens Rendszer & ACI Specialista',
                      icon: 'psychology',
                      role_description: 'Ágens szabályzatok, Zod tool sémák és multi-agent felügyelet.'
                    };
                    return (
                      <div className="w-full max-w-[280px] p-3.5 dark:bg-slate-900/90 bg-white border-2 border-slate-900 relative shadow-[3px_3px_0_#0f172a] dark:shadow-[0_0_15px_rgba(128,255,0,0.2)]">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-plasmaGreen text-base">psychology</span>
                            <span className="text-plasmaGreen font-bold text-xs">@{lead.id}</span>
                          </div>
                          <span className="px-1.5 py-0.2 bg-plasmaGreen/20 text-plasmaGreen text-[8px] font-bold uppercase border border-plasmaGreen/30">POD LEAD</span>
                        </div>
                        <h5 className="text-[11px] font-bold text-on-surface uppercase mb-1">{lead.name}</h5>
                        <p className="text-[9px] dark:text-slate-400 text-slate-700 font-medium line-clamp-2 mb-2 leading-relaxed">{lead.role_description}</p>
                        <div className="flex items-center gap-1.5 pt-1.5 border-t-2 dark:border-white/10 border-slate-900">
                          <button
                            onClick={() => openTerminalWorkspace(lead)}
                            className="flex-1 py-0.5 dark:bg-black/60 bg-slate-100 border-2 dark:border-plasmaGreen/30 border-slate-900 text-plasmaGreen hover:bg-plasmaGreen hover:text-black uppercase text-[8px] font-bold"
                          >
                            WORKSPACE
                          </button>
                          <button
                            onClick={() => openEditTerminalModal(lead)}
                            className="p-0.5 dark:text-slate-400 text-slate-700 hover:text-slate-950 font-bold"
                          >
                            <span className="material-symbols-outlined text-xs">edit</span>
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="w-0.5 h-6 bg-plasmaGreen/50"></div>
                  <div className="w-full max-w-[260px] h-0.5 bg-plasmaGreen/40 relative">
                    <span className="absolute left-0 top-0 w-1.5 h-1.5 -translate-y-0.5 bg-plasmaGreen"></span>
                    <span className="absolute right-0 top-0 w-1.5 h-1.5 -translate-y-0.5 bg-plasmaGreen"></span>
                  </div>

                  <div className="w-full space-y-3 pt-3">
                    {terminalsList.filter(t => t.pod === 'AgentOps' && t.id !== 'agentic').map(term => {
                      const unread = agentStats[term.id]?.unread || 0;
                      return (
                        <div key={term.id} className="p-3 dark:bg-black/60 bg-slate-50 border-2 dark:border-white/10 border-slate-900 shadow-[2px_2px_0_#0f172a] dark:shadow-none hover:border-plasmaGreen transition-all">
                          <div className="flex items-start justify-between gap-1 mb-1">
                            <div className="flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-plasmaGreen text-xs">{term.icon || 'smart_toy'}</span>
                              <span className="text-plasmaGreen font-bold text-xs">@{term.id}</span>
                            </div>
                            {unread > 0 && (
                              <span className="px-1 py-0.2 bg-plasmaGreen text-black font-bold text-[8px]">{unread} ÚJ</span>
                            )}
                          </div>
                          <h6 className="text-[10px] font-bold text-on-surface uppercase">{term.name}</h6>
                          <p className="text-[9px] dark:text-slate-400 text-slate-700 font-medium line-clamp-2 mt-0.5 mb-2 leading-relaxed">{term.role_description}</p>
                          <div className="flex items-center justify-between pt-1.5 border-t-2 dark:border-white/10 border-slate-900 text-[8px]">
                            <button
                              onClick={() => openTerminalWorkspace(term)}
                              className="text-plasmaGreen font-bold hover:underline uppercase flex items-center gap-0.5"
                            >
                              <span>MUNKATERÜLET</span>
                              <span className="material-symbols-outlined text-[10px]">folder_open</span>
                            </button>
                            <button
                              onClick={() => openEditTerminalModal(term)}
                              className="dark:text-slate-500 text-slate-700 font-bold hover:text-slate-950"
                            >
                              SZERKESZTÉS ✏️
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW MODE 2: GRID VIEW */}
      {orgViewMode === 'grid' && (
        <>
          {/* Pod Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            {[
              { name: 'Executive Pod', count: terminalsList.filter(t => t.pod === 'Executive').length, icon: 'diamond', color: 'border-slate-900 dark:border-neonCyan text-neonCyan', desc: 'Stratégia, koordináció & jóváhagyás' },
              { name: 'Engineering Pod', count: terminalsList.filter(t => t.pod === 'Engineering').length, icon: 'code', color: 'border-slate-900 dark:border-neonCyan text-neonCyan', desc: 'Frontend, Backend, MCP, QA' },
              { name: 'Marketing Pod', count: terminalsList.filter(t => t.pod === 'Marketing').length, icon: 'campaign', color: 'border-slate-900 dark:border-neonMagenta text-neonMagenta', desc: 'Szövegírás, SEO, Tudástár' },
              { name: 'AgentOps Pod', count: terminalsList.filter(t => t.pod === 'AgentOps').length, icon: 'smart_toy', color: 'border-slate-900 dark:border-plasmaGreen text-plasmaGreen', desc: 'ACI, Promptok, Tool Sémák' },
            ].map(pod => (
              <div key={pod.name} className={`p-4 dark:bg-slate-900/60 bg-white border-2 ${pod.color} shadow-[3px_3px_0_#0f172a] dark:shadow-none rounded-none`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="material-symbols-outlined text-2xl">{pod.icon}</span>
                  <span className="text-xl font-bold font-headline text-on-surface">{pod.count} Ágens</span>
                </div>
                <h4 className="text-xs font-bold uppercase text-on-surface tracking-wider">{pod.name}</h4>
                <p className="text-[10px] dark:text-slate-400 text-slate-700 font-medium mt-1">{pod.desc}</p>
              </div>
            ))}
          </div>

          {/* Pod Sections with Terminal Cards */}
          <div className="space-y-8">
            {['Executive', 'Engineering', 'Marketing', 'AgentOps'].map(podName => {
              const podTerminals = terminalsList.filter(t => t.pod === podName);
              if (podTerminals.length === 0) return null;

              const podTheme = {
                Executive: 'text-neonCyan border-neonCyan/30',
                Engineering: 'text-neonCyan border-neonCyan/30',
                Marketing: 'text-neonMagenta border-neonMagenta/30',
                AgentOps: 'text-plasmaGreen border-plasmaGreen/30'
              }[podName] || 'text-white border-white/20';

              return (
                <div key={podName} className="border-2 dark:border-white/10 border-slate-900 dark:bg-black/40 bg-slate-50 p-6 shadow-[4px_4px_0_#0f172a] dark:shadow-none">
                  <div className="flex items-center justify-between pb-4 mb-4 border-b-2 dark:border-white/10 border-slate-900">
                    <div className="flex items-center gap-2">
                      <span className={`material-symbols-outlined ${podTheme.split(' ')[0]}`}>
                        {podName === 'Executive' ? 'diamond' : podName === 'Engineering' ? 'architecture' : podName === 'Marketing' ? 'campaign' : 'psychology'}
                      </span>
                      <h3 className="text-lg font-headline font-black italic uppercase text-on-surface tracking-wider">
                        {podName.toUpperCase()}_POD ({podTerminals.length})
                      </h3>
                    </div>
                    <span className="text-[11px] dark:text-slate-500 text-slate-700 font-bold uppercase font-mono">
                      POD_LEAD: {podTerminals.find(t => !t.lead_id || t.id === 'tech-lead' || t.id === 'marketing-lead' || t.id === 'agentic')?.name || 'N/A'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {podTerminals.map(term => {
                      const unreadCount = agentStats[term.id]?.unread || 0;
                      const totalCount = agentStats[term.id]?.total || 0;

                      return (
                        <div
                          key={term.id}
                          className="p-4 dark:bg-slate-900/80 bg-white border-2 dark:border-white/10 border-slate-900 hover:border-neonCyan shadow-[3px_3px_0_#0f172a] dark:shadow-none transition-all flex flex-col justify-between group"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2 mb-3">
                              <div className="flex items-center gap-2">
                                <div className="p-2 dark:bg-black/60 bg-slate-100 border-2 dark:border-white/10 border-slate-900 text-neonCyan">
                                  <span className="material-symbols-outlined text-lg">{term.icon || 'terminal'}</span>
                                </div>
                                <div>
                                  <span className="text-neonCyan font-bold text-sm block">@{term.id}</span>
                                  <span className="text-[10px] dark:text-slate-400 text-slate-700 font-bold uppercase">
                                    {term.lead_id ? `➔ VEZETŐJE: @${term.lead_id}` : '★ POD / SZERVEZETI LEAD'}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1">
                                {unreadCount > 0 && (
                                  <span className="px-1.5 py-0.5 bg-neonCyan text-black font-black text-[10px]">
                                    {unreadCount} ÚJ
                                  </span>
                                )}
                                <button
                                  onClick={() => openEditTerminalModal(term)}
                                  title="Szerkesztés"
                                  className="p-1 dark:text-slate-400 text-slate-700 hover:text-slate-950 font-bold"
                                >
                                  <span className="material-symbols-outlined text-sm">edit</span>
                                </button>
                                {term.id !== 'root' && (
                                  <button
                                    onClick={() => onDeleteTerminal(term.id)}
                                    title="Törlés"
                                    className="p-1 dark:text-slate-500 text-slate-700 hover:text-neonMagenta font-bold"
                                  >
                                    <span className="material-symbols-outlined text-sm">delete</span>
                                  </button>
                                )}
                              </div>
                            </div>

                            <h4 className="text-xs font-bold text-on-surface uppercase mb-2 font-headline">
                              {term.name}
                            </h4>
                            <p className="text-[11px] dark:text-slate-400 text-slate-700 font-body font-medium mb-3 line-clamp-3 leading-relaxed">
                              {term.role_description}
                            </p>

                            {term.responsibilities && term.responsibilities.length > 0 && (
                              <div className="mb-3 p-2 dark:bg-black/40 bg-slate-50 border-2 dark:border-white/5 border-slate-900 text-[10px]">
                                <div className="dark:text-slate-500 text-slate-800 uppercase font-bold mb-1">FELELŐSSÉGI KÖRÖK:</div>
                                <ul className="list-disc list-inside space-y-0.5 dark:text-slate-300 text-slate-900 font-medium">
                                  {term.responsibilities.slice(0, 3).map((r, i) => (
                                    <li key={i} className="truncate">{r}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {term.delegates_to && term.delegates_to.length > 0 && (
                              <div className="mb-3 flex flex-wrap gap-1 text-[9px]">
                                <span className="dark:text-slate-500 text-slate-800 uppercase font-bold mr-1">DELEGÁL:</span>
                                {term.delegates_to.map((d, i) => (
                                  <span key={i} className="px-1 py-0.5 dark:bg-slate-800 bg-slate-200 border-2 dark:border-white/10 border-slate-900 text-on-surface font-bold">
                                    @{d}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="pt-3 border-t-2 dark:border-white/10 border-slate-900 flex flex-col gap-2 text-[10px]">
                            <div className="flex items-center justify-between dark:text-slate-500 text-slate-700 font-bold">
                              <span>Összes üzenet: <strong className="text-on-surface font-black">{totalCount}</strong></span>
                              <button
                                onClick={() => onSelectTerminalForInbox(term.id)}
                                className="dark:text-slate-400 text-slate-800 hover:text-neonCyan uppercase flex items-center gap-1 font-bold"
                              >
                                <span>POSTALÁDA</span>
                                <span className="material-symbols-outlined text-xs">mail</span>
                              </button>
                            </div>

                            <button
                              onClick={() => openTerminalWorkspace(term)}
                              className="w-full py-1.5 dark:bg-black/60 bg-slate-100 border-2 dark:border-neonCyan/40 border-slate-900 hover:bg-slate-900 hover:text-white text-neonCyan uppercase font-bold flex items-center justify-center gap-2 transition-all shadow-[2px_2px_0_#0f172a] dark:shadow-none"
                            >
                              <span className="material-symbols-outlined text-sm">folder_open</span>
                              <span>MUNKATERÜLET & MD SZERKESZTŐ ➔</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Terminal Workspace Editor Modal */}
      <WorkspaceEditor
        selectedTerminalWorkspace={selectedTerminalWorkspace}
        workspaceFiles={workspaceFiles}
        selectedFilePath={selectedFilePath}
        fileContent={fileContent}
        setFileContent={setFileContent}
        fileOriginalContent={fileOriginalContent}
        isMarkdownPreview={isMarkdownPreview}
        setIsMarkdownPreview={setIsMarkdownPreview}
        isSavingFile={isSavingFile}
        onLoadFile={loadTerminalFile}
        onSaveFile={handleSaveTerminalFile}
        onClose={closeTerminalWorkspace}
      />

      {/* Terminal Create/Edit Modal */}
      <TerminalModal
        isOpen={showTerminalModal}
        onClose={() => setShowTerminalModal(false)}
        editingTerminal={editingTerminal}
        terminalForm={terminalForm}
        setTerminalForm={setTerminalForm}
        onSave={handleSaveTerminalSubmit}
      />
    </div>
  );
};

export default OrgMatrixTab;
