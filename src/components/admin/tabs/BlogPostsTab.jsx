import React from 'react';
import { Link } from 'react-router-dom';
import MarkdownCheatSheetModal from '../modals/MarkdownCheatSheetModal';
import { presentationProfileOf } from '../../../utils/presentationProfile.js';

const BlogPostsTab = ({
  blogsList,
  showMarkdownCheatSheet,
  setShowMarkdownCheatSheet,
  onVaultSync,
  onEmptyDriveRepair,
  onDriveReconnect,
  isSyncing,
  syncResult,
  setSyncResult
}) => {
  const [filterType, setFilterType] = React.useState('all');

  const filteredBlogs = blogsList.filter(b => {
    if (filterType === 'knowledge') return presentationProfileOf(b) === 'knowledge';
    if (filterType === 'article') return presentationProfileOf(b) === 'article';
    return true;
  });
  const isCloudRecoveryResult = syncResult?.operation === 'EMPTY_DRIVE_REPAIR';
  const syncResultSource = isCloudRecoveryResult
    ? 'GOOGLE DRIVE // HELYREÁLLÍTÁS'
    : (syncResult?.source_of_truth || 'HELYI OBSIDIAN VAULT');

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 pb-4 border-b-2 dark:border-white/10 border-slate-900">
        <div>
          <h2 className="text-2xl font-headline font-black italic uppercase text-on-surface flex items-center gap-3">
            <span className="text-neonCyan">//</span> TUDÁSTÁR & ESETTANULMÁNY NÉZET (CMS)
          </h2>
          <p className="text-xs dark:text-slate-400 text-slate-700 font-medium mt-1">
            A szerveroldali Obsidian Vault az elsődleges forrás; a SQLite/RAG annak kereshető vetülete. Új dokumentumot, módosítást vagy törlést az Obsidian Vaultban végezz. A Drive-eszközök kizárólag külön felhő-helyreállításhoz használhatók.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowMarkdownCheatSheet(true)}
            className="px-4 py-2 dark:bg-slate-900 bg-slate-100 border-2 dark:border-plasmaGreen/40 border-slate-900 text-plasmaGreen dark:text-plasmaGreen hover:bg-slate-900 hover:text-white uppercase text-xs font-bold flex items-center gap-2 transition-all shadow-[2px_2px_0_#0f172a] dark:shadow-none"
          >
            <span className="material-symbols-outlined text-sm">help</span>
            <span>? OBSIDIAN MARKDOWN SÚGÓ</span>
          </button>

          <div
            role="group"
            aria-label="Elsődleges Obsidian Vault szinkronizálás"
            className="flex flex-wrap items-center gap-2 border-2 border-neonCyan/50 dark:bg-slate-900/70 bg-cyan-50 p-2"
          >
            <div className="flex items-center gap-1.5 px-1 font-mono text-[10px] font-black uppercase tracking-wide text-cyan-800 dark:text-neonCyan">
              <span className="material-symbols-outlined text-sm" aria-hidden="true">folder_open</span>
              <span>OBSIDIAN VAULT // ELSŐDLEGES</span>
            </div>
            <button
              type="button"
              onClick={() => onVaultSync(true)}
              disabled={isSyncing}
              className={`px-4 py-2 border-2 uppercase text-xs font-bold flex items-center gap-2 transition-all shadow-[2px_2px_0_#0f172a] dark:shadow-none ${
                isSyncing
                  ? 'border-neonCyan/30 text-neonCyan/50 cursor-not-allowed bg-slate-900/50'
                  : 'border-slate-900 dark:border-neonCyan/50 text-neonCyan dark:bg-slate-950 bg-white hover:bg-slate-900 hover:text-white'
              }`}
            >
              <span className={`material-symbols-outlined text-sm ${isSyncing ? 'animate-spin' : ''}`}>
                {isSyncing ? 'sync' : 'preview'}
              </span>
              <span>{isSyncing ? 'ELLENŐRZÉS...' : 'VAULT ELŐNÉZET'}</span>
            </button>

            <button
              type="button"
              onClick={() => onVaultSync(false)}
              disabled={isSyncing}
              className={`px-4 py-2 border-2 uppercase text-xs font-bold flex items-center gap-2 transition-all shadow-[2px_2px_0_#0f172a] dark:shadow-none ${
                isSyncing
                  ? 'border-neonMagenta/30 text-neonMagenta/50 cursor-not-allowed bg-slate-900/50'
                  : 'border-slate-900 dark:border-neonMagenta/50 text-neonMagenta dark:bg-slate-950 bg-white hover:bg-slate-900 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-sm">database_upload</span>
              <span>VAULT → SQLITE/RAG ALKALMAZÁS</span>
            </button>
          </div>

          <div
            role="group"
            aria-label="Különálló felhő-helyreállító eszközök"
            className="flex flex-wrap items-center gap-2 border border-amber-500/50 dark:bg-slate-900/70 bg-amber-50 p-2"
          >
            <div className="flex items-center gap-1.5 px-1 font-mono text-[10px] font-black uppercase tracking-wide text-amber-700 dark:text-amber-400">
              <span className="material-symbols-outlined text-sm" aria-hidden="true">cloud_sync</span>
              <span>FELHŐ-HELYREÁLLÍTÁS // NEM ELSŐDLEGES</span>
            </div>
            <button
              type="button"
              onClick={onDriveReconnect}
              disabled={isSyncing}
              aria-label="Google Drive újracsatlakoztatása"
              className={`px-4 py-2 border-2 uppercase text-xs font-bold flex items-center gap-2 transition-all shadow-[2px_2px_0_#0f172a] dark:shadow-none ${
                isSyncing
                  ? 'border-plasmaGreen/30 text-plasmaGreen/50 cursor-not-allowed bg-slate-900/50'
                  : 'border-slate-900 dark:border-plasmaGreen/50 text-emerald-700 dark:text-plasmaGreen dark:bg-slate-900 bg-emerald-50 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-sm" aria-hidden="true">add_to_drive</span>
              <span>GOOGLE DRIVE ÚJRACSATLAKOZTATÁS</span>
            </button>

            <button
              type="button"
              onClick={() => onEmptyDriveRepair(true)}
              disabled={isSyncing}
              className={`px-4 py-2 border-2 uppercase text-xs font-bold flex items-center gap-2 transition-all shadow-[2px_2px_0_#0f172a] dark:shadow-none ${
                isSyncing
                  ? 'border-amber-400/30 text-amber-500/50 cursor-not-allowed bg-slate-900/50'
                  : 'border-slate-900 dark:border-amber-400/50 text-amber-600 dark:text-amber-400 dark:bg-slate-900 bg-slate-100 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-sm">troubleshoot</span>
              <span>ÜRES DRIVE JAVÍTÁS ELŐNÉZET</span>
            </button>

            <button
              type="button"
              onClick={() => onEmptyDriveRepair(false)}
              disabled={isSyncing}
              className={`px-4 py-2 border-2 uppercase text-xs font-bold flex items-center gap-2 transition-all shadow-[2px_2px_0_#0f172a] dark:shadow-none ${
                isSyncing
                  ? 'border-amber-400/30 text-amber-500/50 cursor-not-allowed bg-slate-900/50'
                  : 'border-slate-900 dark:border-amber-500 text-amber-700 dark:text-amber-300 dark:bg-slate-900 bg-amber-50 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-sm">cloud_upload</span>
              <span>ÜRES DRIVE FÁJLOK JAVÍTÁSA</span>
            </button>
          </div>

          <div
            role="note"
            className="flex items-center gap-2 border-2 border-slate-500/50 dark:bg-slate-900/70 bg-slate-100 px-4 py-2 font-mono text-[10px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-300"
          >
            <span className="material-symbols-outlined text-sm text-neonCyan" aria-hidden="true">lock</span>
            <span>CMS CSAK OLVASHATÓ // SZERKESZTÉS: OBSIDIAN VAULT</span>
          </div>
        </div>
      </div>

      {/* Presentation profile filter: document schema remains unified. */}
      <div className="flex flex-wrap items-center gap-2 mb-6 font-mono text-xs">
        <span className="text-slate-500 font-bold uppercase mr-2">SZŰRÉS MEGJELENÍTÉSI PROFIL SZERINT:</span>
        <button
          onClick={() => setFilterType('all')}
          className={`px-3 py-1.5 border-2 font-bold uppercase transition-all ${
            filterType === 'all'
              ? 'border-neonCyan dark:bg-slate-900 bg-cyan-50 text-slate-950 dark:text-white shadow-[2px_2px_0_#0f172a]'
              : 'dark:border-white/10 border-slate-300 dark:bg-slate-950 bg-white text-slate-600 dark:text-slate-400 hover:border-slate-500'
          }`}
        >
          ÖSSZES TARTALOM ({blogsList.length})
        </button>
        <button
          onClick={() => setFilterType('knowledge')}
          className={`px-3 py-1.5 border-2 font-bold uppercase transition-all flex items-center gap-1.5 ${
            filterType === 'knowledge'
              ? 'border-plasmaGreen dark:bg-slate-900 bg-emerald-50 text-slate-950 dark:text-white shadow-[2px_2px_0_#0f172a]'
              : 'dark:border-white/10 border-slate-300 dark:bg-slate-950 bg-white text-slate-600 dark:text-slate-400 hover:border-slate-500'
          }`}
        >
          <span>📚 TUDÁSTÁR DOKUMENTUMOK ({blogsList.filter(b => presentationProfileOf(b) === 'knowledge').length})</span>
        </button>
        <button
          onClick={() => setFilterType('article')}
          className={`px-3 py-1.5 border-2 font-bold uppercase transition-all flex items-center gap-1.5 ${
            filterType === 'article'
              ? 'border-neonMagenta dark:bg-slate-900 bg-pink-50 text-slate-950 dark:text-white shadow-[2px_2px_0_#0f172a]'
              : 'dark:border-white/10 border-slate-300 dark:bg-slate-950 bg-white text-slate-600 dark:text-slate-400 hover:border-slate-500'
          }`}
        >
          <span>📰 CIKKEK & ESETTANULMÁNYOK ({blogsList.filter(b => presentationProfileOf(b) === 'article').length})</span>
        </button>
      </div>

      {/* Vault Sync / Cloud Recovery Result Panel */}
      {syncResult && (
        <div className="mb-6 p-4 dark:bg-slate-900/80 bg-white border-2 border-neonMagenta font-mono text-xs relative shadow-[4px_4px_0_#0f172a] dark:shadow-none">
          <button
            onClick={() => setSyncResult(null)}
            className="absolute top-2 right-3 dark:text-slate-500 text-slate-800 hover:text-neonMagenta font-bold text-sm"
          >✕</button>
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-neonMagenta text-base">
              {isCloudRecoveryResult ? 'cloud_done' : 'folder_open'}
            </span>
            <span className="text-neonMagenta font-black uppercase tracking-wider">
              {isCloudRecoveryResult
                ? (syncResult.dry_run ? 'ÜRES DRIVE JAVÍTÁS ELŐNÉZET — NINCS ÍRÁS' : 'ÜRES DRIVE FÁJLOK JAVÍTÁSA')
                : (syncResult.dry_run ? 'OBSIDIAN VAULT ELŐNÉZET — NINCS ÍRÁS' : 'VAULT → SQLITE/RAG EREDMÉNY')}
            </span>
            <span className="text-[10px] text-slate-900 dark:text-slate-400 px-2 py-0.5 dark:bg-black bg-slate-100 border-2 dark:border-white/10 border-slate-900 ml-auto font-bold">{syncResult.mode || syncResultSource}</span>
          </div>
          {!isCloudRecoveryResult && (
            <div className="mb-3 flex items-center gap-2 border border-neonCyan/40 bg-neonCyan/10 px-3 py-2 text-[10px] font-bold uppercase text-cyan-800 dark:text-neonCyan">
              <span className="material-symbols-outlined text-sm" aria-hidden="true">verified</span>
              <span>Elsődleges forrás: {syncResultSource}</span>
            </div>
          )}
          {isCloudRecoveryResult && (
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="text-center p-2 dark:bg-black/60 bg-amber-50 border-2 dark:border-amber-400/30 border-slate-900">
                <div className="text-2xl font-black text-amber-500">{syncResult.would_repair ?? syncResult.wouldRepair ?? 0}</div>
                <div className="text-[10px] dark:text-slate-400 text-slate-700 font-bold uppercase">Javítható</div>
              </div>
              <div className="text-center p-2 dark:bg-black/60 bg-emerald-50 border-2 dark:border-plasmaGreen/30 border-slate-900">
                <div className="text-2xl font-black text-plasmaGreen">{syncResult.repaired ?? 0}</div>
                <div className="text-[10px] dark:text-slate-400 text-slate-700 font-bold uppercase">Javítva</div>
              </div>
            </div>
          )}
          {!isCloudRecoveryResult && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
              <div className="text-center p-2 dark:bg-black/60 bg-slate-50 border-2 dark:border-white/10 border-slate-900">
                <div className="text-2xl font-black text-slate-900 dark:text-white">{syncResult.discovered ?? syncResult.synced ?? 0}</div>
                <div className="text-[10px] dark:text-slate-400 text-slate-700 font-bold uppercase">Felderítve</div>
              </div>
              <div className="text-center p-2 dark:bg-black/60 bg-slate-50 border-2 dark:border-white/10 border-slate-900">
                <div className="text-2xl font-black text-neonCyan">{syncResult.processed ?? syncResult.synced ?? 0}</div>
                <div className="text-[10px] dark:text-slate-400 text-slate-700 font-bold uppercase">Feldolgozva</div>
              </div>
              <div className="text-center p-2 dark:bg-black/60 bg-slate-50 border-2 dark:border-plasmaGreen/20 border-slate-900">
                <div className="text-2xl font-black text-plasmaGreen">{syncResult.created || 0}</div>
                <div className="text-[10px] dark:text-slate-400 text-slate-700 font-bold uppercase">Új rekord</div>
              </div>
              <div className="text-center p-2 dark:bg-black/60 bg-slate-50 border-2 dark:border-neonCyan/20 border-slate-900">
                <div className="text-2xl font-black text-neonCyan">{syncResult.updated || 0}</div>
                <div className="text-[10px] dark:text-slate-400 text-slate-700 font-bold uppercase">Frissített vetület</div>
              </div>
              <div className="text-center p-2 dark:bg-black/60 bg-slate-50 border-2 dark:border-amber-400/30 border-slate-900">
                <div className="text-2xl font-black text-amber-500">
                  {syncResult.skipped_count ?? (Array.isArray(syncResult.skipped) ? syncResult.skipped.length : (syncResult.skipped || 0))}
                </div>
                <div className="text-[10px] dark:text-slate-400 text-slate-700 font-bold uppercase">Kihagyva</div>
              </div>
            </div>
          )}
          {syncResult.files && syncResult.files.length > 0 && (
            <div className="space-y-1 max-h-32 overflow-y-auto font-medium">
              {syncResult.files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px]">
                  <span className={f.status?.includes('CREATE') || f.status === 'REPAIRED' ? 'text-plasmaGreen font-bold' : (f.status?.includes('SKIP') || f.status?.includes('REFUSED') ? 'text-amber-500 font-bold' : 'text-neonCyan font-bold')}>
                    {f.status?.includes('CREATE')
                      ? '+ NEW'
                      : (f.status === 'REPAIRED'
                          ? '✓ FIXED'
                          : (f.status?.includes('REPAIR')
                              ? '◇ REPAIR'
                              : (f.status?.includes('SKIP') || f.status?.includes('REFUSED') ? '○ SKIP' : '↑ UPD')))}
                  </span>
                  <span className="text-slate-800 dark:text-slate-300 font-bold">{f.file || f.fileName || f.path || (isCloudRecoveryResult ? 'Drive fájl' : 'Vault fájl')}</span>
                  {f.slug && <span className="text-slate-500 ml-auto">/{f.slug}</span>}
                </div>
              ))}
            </div>
          )}
          {syncResult.collisions && (Array.isArray(syncResult.collisions) ? syncResult.collisions.length > 0 : syncResult.collisions > 0) && (
            <div className="mt-2 text-amber-500 font-bold text-[10px]">
              ⚠ AZONOSÍTÓ ÜTKÖZÉSEK: {Array.isArray(syncResult.collisions) ? syncResult.collisions.length : syncResult.collisions} — manuális feloldás szükséges, nincs automatikus átnevezés
            </div>
          )}
          {syncResult.errors && syncResult.errors.length > 0 && (
            <div className="mt-2 space-y-1">
              {syncResult.errors.map((e, i) => (
                <div key={i} className="text-neonMagenta font-bold text-[10px]">
                  ⚠ {e.file || e.fileName || e.source_path || e.source || (isCloudRecoveryResult ? 'Drive' : 'Obsidian Vault')}: {e.error || e.code || e.message || 'UNKNOWN_ERROR'}
                  {e.slug ? ` [/${e.slug}]` : ''}
                  {Array.isArray(e.details?.source_paths) ? ` — ${e.details.source_paths.join(' ↔ ')}` : ''}
                </div>
              ))}
            </div>
          )}
          {syncResult.refused && syncResult.refused.length > 0 && (
            <div className="mt-2 space-y-1">
              {syncResult.refused.map((item, i) => (
                <div key={i} className="text-amber-500 font-bold text-[10px]">
                  ○ {item.file || item.fileName || item.source || (isCloudRecoveryResult ? 'Drive' : 'Obsidian Vault')}: {item.code || item.reason || item.message || 'SYNC_REFUSED'}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Document List */}
      <div className="space-y-3 font-mono text-xs">
        {filteredBlogs.map(blog => (
          <div key={blog.id} className="p-4 bg-surface-container-lowest border border-white/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-white/20 transition-all">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                {presentationProfileOf(blog) === 'knowledge' ? (
                  <span className="px-2 py-0.5 bg-emerald-500/20 border border-plasmaGreen/40 text-plasmaGreen text-[9px] font-bold">
                    📚 TUDÁSTÁR // RAG
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-purple-500/20 border border-purple-400/40 text-purple-400 text-[9px] font-bold">
                    📰 CIKK // ESETTANULMÁNY
                  </span>
                )}
                <span className="text-neonCyan font-bold">[{blog.category}]</span>
                {blog.project_id && (
                  <span className="text-slate-400 text-[10px]">@{blog.project_id}</span>
                )}
                {blog.visibility === 'private' ? (
                  <span className="px-1.5 py-0.5 bg-neonMagenta/20 border border-neonMagenta/50 text-neonMagenta text-[9px] font-bold">
                    🔒 PRIVÁT
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 bg-neonCyan/10 border border-neonCyan/30 text-neonCyan text-[9px]">
                    🌐 PUBLIKUS
                  </span>
                )}
                <span className="text-slate-500 text-[10px]">{blog.created_at}</span>
                <span className={`px-2 py-0.5 text-[9px] font-bold ${blog.published ? 'bg-plasmaGreen/10 text-plasmaGreen' : 'bg-neonMagenta/10 text-neonMagenta'}`}>
                  {blog.published ? 'PUBLISHED' : 'DRAFT'}
                </span>
              </div>
              <h4 className="font-headline font-bold text-white uppercase text-base">{blog.title}</h4>
              <p className="text-slate-400 text-xs mt-1 line-clamp-2">{blog.summary}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Link 
                to={presentationProfileOf(blog) === 'knowledge' ? `/knowledge/${blog.slug}` : `/blog/${blog.slug}`}
                className="text-slate-300 hover:text-white uppercase font-bold text-xs"
              >
                MEGNYITÁS ↗
              </Link>
              <span className="text-white/20">|</span>
              <span className="text-[10px] font-bold uppercase text-slate-500" title="A szerkesztés és törlés kizárólag a helyi Obsidian Vaultban végezhető.">
                CSAK OLVASHATÓ // OBSIDIAN
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Cheat Sheet Modal */}
      <MarkdownCheatSheetModal
        isOpen={showMarkdownCheatSheet}
        onClose={() => setShowMarkdownCheatSheet(false)}
      />
    </div>
  );
};

export default BlogPostsTab;
