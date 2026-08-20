import React from 'react';
import { Link } from 'react-router-dom';
import BlogPostModal from '../modals/BlogPostModal';
import MarkdownCheatSheetModal from '../modals/MarkdownCheatSheetModal';

const BlogPostsTab = ({
  blogsList,
  editingBlog,
  setEditingBlog,
  onSaveBlog,
  onDeleteBlog,
  showMarkdownCheatSheet,
  setShowMarkdownCheatSheet,
  onDriveSync,
  onEmptyDriveRepair,
  onDriveReconnect,
  isSyncing,
  syncResult,
  setSyncResult
}) => {
  const [filterType, setFilterType] = React.useState('all');

  const filteredBlogs = blogsList.filter(b => {
    if (filterType === 'knowledge') return b.content_type === 'knowledge';
    if (filterType === 'blog') return b.content_type === 'blog' || !b.content_type;
    return true;
  });

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 pb-4 border-b-2 dark:border-white/10 border-slate-900">
        <div>
          <h2 className="text-2xl font-headline font-black italic uppercase text-on-surface flex items-center gap-3">
            <span className="text-neonCyan">//</span> TUDÁSTÁR & ESETTANULMÁNY KEZELŐ (CMS)
          </h2>
          <p className="text-xs dark:text-slate-400 text-slate-700 font-medium mt-1">
            Munkaterekbe rendezett esettanulmányok, RAG tudásanyagok, többdimenziós címkék és privát jegyzetek.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowMarkdownCheatSheet(true)}
            className="px-4 py-2 dark:bg-slate-900 bg-slate-100 border-2 dark:border-plasmaGreen/40 border-slate-900 text-plasmaGreen dark:text-plasmaGreen hover:bg-slate-900 hover:text-white uppercase text-xs font-bold flex items-center gap-2 transition-all shadow-[2px_2px_0_#0f172a] dark:shadow-none"
          >
            <span className="material-symbols-outlined text-sm">help</span>
            <span>? SÚGÓ & CHEAT SHEET</span>
          </button>

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
            onClick={() => onDriveSync(true)}
            disabled={isSyncing}
            className={`px-4 py-2 border-2 uppercase text-xs font-bold flex items-center gap-2 transition-all shadow-[2px_2px_0_#0f172a] dark:shadow-none ${
              isSyncing
                ? 'border-neonMagenta/30 text-neonMagenta/50 cursor-not-allowed bg-slate-900/50'
                : 'border-slate-900 dark:border-neonCyan/50 text-neonCyan dark:bg-slate-900 bg-slate-100 hover:bg-slate-900 hover:text-white'
            }`}
          >
            <span className={`material-symbols-outlined text-sm ${isSyncing ? 'animate-spin' : ''}`}>
              {isSyncing ? 'sync' : 'preview'}
            </span>
            <span>{isSyncing ? 'ELLENŐRZÉS...' : 'DRIVE ELŐNÉZET'}</span>
          </button>

          <button
            type="button"
            onClick={() => onDriveSync(false)}
            disabled={isSyncing}
            className={`px-4 py-2 border-2 uppercase text-xs font-bold flex items-center gap-2 transition-all shadow-[2px_2px_0_#0f172a] dark:shadow-none ${
              isSyncing
                ? 'border-neonMagenta/30 text-neonMagenta/50 cursor-not-allowed bg-slate-900/50'
                : 'border-slate-900 dark:border-neonMagenta/50 text-neonMagenta dark:bg-slate-900 bg-slate-100 hover:bg-slate-900 hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-sm">cloud_download</span>
            <span>DRIVE → DB ALKALMAZÁS</span>
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

          <button
            onClick={() => setEditingBlog({
              title: '',
              slug: '',
              content_type: 'knowledge',
              project_id: 'prj_spaceos',
              summary: '',
              content: '# Új Tudástári Dokumentum\n\nÍrd ide a dokumentum tartalmát Markdown formátumban...',
              category: 'ZÁRT VÁLLALATI RAG',
              visibility: 'public',
              audio_url: '',
              dimensions: { iparag: ['Gyártás'], technologia: ['React', 'SQLite'], celcsoport: ['Mérnökök'] },
              read_time: '5 PERC',
              published: 1
            })}
            className="dark:bg-neonCyan bg-cyan-700 text-white dark:text-black font-headline font-black italic px-6 py-2 uppercase border-2 border-slate-950 shadow-[3px_3px_0_#0f172a] hover:bg-slate-950 hover:text-white transition-all flex items-center gap-2 text-xs"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            + ÚJ_DOKUMENTUM
          </button>
        </div>
      </div>

      {/* Content Type Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 mb-6 font-mono text-xs">
        <span className="text-slate-500 font-bold uppercase mr-2">SZŰRÉS TÍPUS SZERINT:</span>
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
          <span>📚 TUDÁSTÁR CIKKEK ({blogsList.filter(b => b.content_type === 'knowledge').length})</span>
        </button>
        <button
          onClick={() => setFilterType('blog')}
          className={`px-3 py-1.5 border-2 font-bold uppercase transition-all flex items-center gap-1.5 ${
            filterType === 'blog'
              ? 'border-neonMagenta dark:bg-slate-900 bg-pink-50 text-slate-950 dark:text-white shadow-[2px_2px_0_#0f172a]'
              : 'dark:border-white/10 border-slate-300 dark:bg-slate-950 bg-white text-slate-600 dark:text-slate-400 hover:border-slate-500'
          }`}
        >
          <span>📰 BLOG & ESETTANULMÁNYOK ({blogsList.filter(b => b.content_type === 'blog' || !b.content_type).length})</span>
        </button>
      </div>

      {/* Drive Sync Result Panel */}
      {syncResult && (
        <div className="mb-6 p-4 dark:bg-slate-900/80 bg-white border-2 border-neonMagenta font-mono text-xs relative shadow-[4px_4px_0_#0f172a] dark:shadow-none">
          <button
            onClick={() => setSyncResult(null)}
            className="absolute top-2 right-3 dark:text-slate-500 text-slate-800 hover:text-neonMagenta font-bold text-sm"
          >✕</button>
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-neonMagenta text-base">cloud_done</span>
            <span className="text-neonMagenta font-black uppercase tracking-wider">
              {syncResult.operation === 'EMPTY_DRIVE_REPAIR'
                ? (syncResult.dry_run ? 'ÜRES DRIVE JAVÍTÁS ELŐNÉZET — NINCS ÍRÁS' : 'ÜRES DRIVE FÁJLOK JAVÍTÁSA')
                : (syncResult.dry_run ? 'DRIVE ELŐNÉZET — NINCS ÍRÁS' : 'DRIVE PULL EREDMÉNY')}
            </span>
            <span className="text-[10px] text-slate-900 dark:text-slate-400 px-2 py-0.5 dark:bg-black bg-slate-100 border-2 dark:border-white/10 border-slate-900 ml-auto font-bold">{syncResult.mode}</span>
          </div>
          {syncResult.operation === 'EMPTY_DRIVE_REPAIR' && (
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
          {syncResult.operation !== 'EMPTY_DRIVE_REPAIR' && (
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
                <div className="text-[10px] dark:text-slate-400 text-slate-700 font-bold uppercase">Új fájl</div>
              </div>
              <div className="text-center p-2 dark:bg-black/60 bg-slate-50 border-2 dark:border-neonCyan/20 border-slate-900">
                <div className="text-2xl font-black text-neonCyan">{syncResult.updated || 0}</div>
                <div className="text-[10px] dark:text-slate-400 text-slate-700 font-bold uppercase">Frissítve</div>
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
                  <span className="text-slate-800 dark:text-slate-300 font-bold">{f.file || f.fileName || f.path || 'Drive file'}</span>
                  {f.slug && <span className="text-slate-500 ml-auto">/{f.slug}</span>}
                </div>
              ))}
            </div>
          )}
          {syncResult.collisions && (Array.isArray(syncResult.collisions) ? syncResult.collisions.length > 0 : syncResult.collisions > 0) && (
            <div className="mt-2 text-amber-500 font-bold text-[10px]">
              ⚠ SLUG ÜTKÖZÉSEK: {Array.isArray(syncResult.collisions) ? syncResult.collisions.length : syncResult.collisions} — stabil, egyedi URL-re átnevezve
            </div>
          )}
          {syncResult.errors && syncResult.errors.length > 0 && (
            <div className="mt-2 space-y-1">
              {syncResult.errors.map((e, i) => (
                <div key={i} className="text-neonMagenta font-bold text-[10px]">
                  ⚠ {e.file || e.fileName || e.source || 'Drive'}: {e.error || e.code || e.message || 'UNKNOWN_ERROR'}
                </div>
              ))}
            </div>
          )}
          {syncResult.refused && syncResult.refused.length > 0 && (
            <div className="mt-2 space-y-1">
              {syncResult.refused.map((item, i) => (
                <div key={i} className="text-amber-500 font-bold text-[10px]">
                  ○ {item.file || item.fileName || item.source || 'Drive'}: {item.code || item.reason || item.message || 'REPAIR_REFUSED'}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Blog Post Editor Modal / Form */}
      <BlogPostModal
        editingBlog={editingBlog}
        setEditingBlog={setEditingBlog}
        onSave={onSaveBlog}
        onOpenCheatSheet={() => setShowMarkdownCheatSheet(true)}
      />

      {/* Document List */}
      <div className="space-y-3 font-mono text-xs">
        {filteredBlogs.map(blog => (
          <div key={blog.id} className="p-4 bg-surface-container-lowest border border-white/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-white/20 transition-all">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                {blog.content_type === 'knowledge' ? (
                  <span className="px-2 py-0.5 bg-emerald-500/20 border border-plasmaGreen/40 text-plasmaGreen text-[9px] font-bold">
                    📚 TUDÁSTÁR // RAG
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-purple-500/20 border border-purple-400/40 text-purple-400 text-[9px] font-bold">
                    📰 BLOG // ESETTANULMÁNY
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
                to={blog.content_type === 'knowledge' ? `/knowledge/${blog.slug}` : `/blog/${blog.slug}`} 
                className="text-slate-300 hover:text-white uppercase font-bold text-xs"
              >
                MEGNYITÁS ↗
              </Link>
              <span className="text-white/20">|</span>
              <button onClick={() => setEditingBlog(blog)} className="text-neonCyan hover:underline uppercase font-bold text-xs">SZERKESZTÉS</button>
              <span className="text-white/20">|</span>
              <button onClick={() => onDeleteBlog(blog.id)} className="text-neonMagenta hover:underline uppercase font-bold text-xs">TÖRLÉS</button>
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
