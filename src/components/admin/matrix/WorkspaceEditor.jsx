import React from 'react';
import MarkdownRenderer from '../../markdown/MarkdownRenderer';

const WorkspaceEditor = ({
  selectedTerminalWorkspace,
  workspaceFiles,
  selectedFilePath,
  fileContent,
  setFileContent,
  fileOriginalContent,
  isMarkdownPreview,
  setIsMarkdownPreview,
  isSavingFile,
  onLoadFile,
  onSaveFile,
  onClose
}) => {
  if (!selectedTerminalWorkspace) return null;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-3 lg:p-6 font-mono">
      <div className="w-full max-w-6xl h-[90vh] bg-[var(--surface-panel)] border-2 dark:border-neonCyan border-slate-900 flex flex-col relative shadow-[8px_8px_0_#0f172a] dark:shadow-[0_0_50px_rgba(0,251,251,0.2)]">
        <div className="corner-bracket-tl text-neonCyan"></div>
        <div className="corner-bracket-br text-neonMagenta"></div>

        {/* Top Header Bar */}
        <div className="flex items-center justify-between p-4 border-b-2 dark:border-white/10 border-slate-900">
          <div className="flex items-center gap-3">
            <div className="p-1.5 dark:bg-black bg-slate-100 border-2 dark:border-neonCyan border-slate-900 text-neonCyan">
              <span className="material-symbols-outlined text-base">{selectedTerminalWorkspace.icon || 'terminal'}</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-neonCyan font-bold text-sm">@{selectedTerminalWorkspace.id}</span>
                <span className="text-[10px] dark:text-slate-400 text-slate-700 font-bold uppercase">
                  // {selectedTerminalWorkspace.name}
                </span>
              </div>
              <span className="text-[10px] text-plasmaGreen font-mono font-bold">
                MUNKATERÜLET: .agents/workspaces/{selectedTerminalWorkspace.id}/
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {selectedFilePath && (
              <button
                onClick={() => setIsMarkdownPreview(!isMarkdownPreview)}
                className={`px-3 py-1.5 border-2 text-xs font-bold uppercase flex items-center gap-1.5 transition-all shadow-[2px_2px_0_#0f172a] dark:shadow-none ${
                  isMarkdownPreview
                    ? 'dark:bg-plasmaGreen bg-emerald-700 text-white dark:text-black border-slate-900'
                    : 'dark:bg-slate-900 bg-slate-100 dark:border-white/20 border-slate-900 text-slate-900 dark:text-slate-300 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-sm">{isMarkdownPreview ? 'edit_note' : 'visibility'}</span>
                <span>{isMarkdownPreview ? 'SZERKESZTŐ' : 'ELŐNÉZET'}</span>
              </button>
            )}

            {selectedFilePath && fileContent !== fileOriginalContent && (
              <button
                onClick={onSaveFile}
                disabled={isSavingFile}
                className="px-4 py-1.5 dark:bg-neonCyan bg-cyan-700 text-white dark:text-black font-headline font-black italic uppercase text-xs border-2 border-slate-950 shadow-[3px_3px_0_#0f172a] hover:bg-slate-950 hover:text-white transition-all flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">{isSavingFile ? 'sync' : 'save'}</span>
                <span>{isSavingFile ? 'MENTÉS...' : 'MENTÉS 💾'}</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 dark:text-slate-400 text-slate-800 hover:text-neonMagenta font-bold text-lg"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Studio Workspace 2-Column Grid */}
        <div className="flex-1 grid grid-cols-12 overflow-hidden text-xs">
          {/* Left Column: Workspace File Explorer */}
          <div className="col-span-3 border-r-2 dark:border-white/10 border-slate-900 p-3 overflow-y-auto dark:bg-black/40 bg-slate-100">
            <div className="text-[10px] dark:text-slate-400 text-slate-900 uppercase font-bold tracking-wider mb-2 flex items-center gap-1">
              <span className="material-symbols-outlined text-xs text-neonCyan">folder</span>
              DOKUMENTUMOK:
            </div>
            {workspaceFiles.length === 0 ? (
              <div className="text-slate-500 text-[10px] p-2">Nincs elérhető fájl a munkatérben.</div>
            ) : (
              <div className="space-y-1">
                {workspaceFiles.map(file => (
                  <button
                    key={file.path}
                    onClick={() => onLoadFile(selectedTerminalWorkspace.id, file.path)}
                    className={`w-full text-left p-2 border-2 transition-all flex items-center gap-2 text-[11px] ${
                      selectedFilePath === file.path
                        ? 'dark:bg-neonCyan/20 bg-slate-900 text-white font-bold border-slate-900 dark:border-neonCyan shadow-sm'
                        : 'dark:bg-slate-900/60 bg-white dark:border-white/5 border-slate-900 dark:text-slate-300 text-slate-800 font-bold hover:bg-slate-200 dark:hover:text-white'
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm text-neonCyan">
                      {file.name === 'AGENTS.md' ? 'smart_toy' : file.is_markdown ? 'description' : 'code'}
                    </span>
                    <span className="truncate">{file.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Markdown Editor / Live Preview */}
          <div className="col-span-9 flex flex-col overflow-hidden dark:bg-black/20 bg-white">
            {selectedFilePath ? (
              <>
                <div className="flex items-center justify-between px-4 py-2 border-b-2 dark:border-white/10 border-slate-900 dark:bg-black/60 bg-slate-50 text-[11px]">
                  <span className="text-slate-800 dark:text-slate-300 font-bold">📄 {selectedFilePath}</span>
                  {fileContent !== fileOriginalContent && (
                    <span className="text-neonMagenta font-bold uppercase text-[10px] animate-pulse">
                      ● NEM MENTETT MÓDOSÍTÁSOK
                    </span>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  {isMarkdownPreview ? (
                    <div className="h-full overflow-y-auto p-4 bg-[var(--bg-main)] border-2 dark:border-neonCyan/20 border-slate-900 shadow-inner">
                      <MarkdownRenderer content={fileContent} />
                    </div>
                  ) : (
                    <textarea
                      value={fileContent}
                      onChange={(e) => setFileContent(e.target.value)}
                      className="w-full h-full p-4 bg-[var(--surface-panel)] border-2 dark:border-white/10 border-slate-900 text-on-surface font-mono text-xs leading-relaxed outline-none focus:border-neonCyan resize-none font-medium"
                      placeholder="Fájl tartalma..."
                    />
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
                Válassz ki egy fájlt a bal oldali listából a megtekintéshez vagy szerkesztéshez.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkspaceEditor;
