import React from 'react';
import MarkdownRenderer from '../../markdown/MarkdownRenderer';

const BlogPostModal = ({ editingBlog, setEditingBlog, onSave, onOpenCheatSheet }) => {
  if (!editingBlog) return null;

  return (
    <div className="mb-8 p-6 bg-[var(--surface-panel)] border-2 dark:border-neonCyan border-slate-900 relative shadow-[6px_6px_0_#0f172a] dark:shadow-2xl font-mono">
      <div className="corner-bracket-tl text-neonCyan"></div>
      <div className="corner-bracket-br text-neonMagenta"></div>

      <div className="flex items-center justify-between mb-4 pb-2 border-b-2 dark:border-white/10 border-slate-900">
        <h3 className="font-headline text-lg font-black uppercase text-on-surface flex items-center gap-2">
          <span>{editingBlog.id ? `DOKUMENTUM_SZERKESZTÉSE #${editingBlog.id}` : 'ÚJ_DOKUMENTUM_LÉTREHOZÁSA'}</span>
        </h3>
        <button
          type="button"
          onClick={onOpenCheatSheet}
          className="text-emerald-700 dark:text-plasmaGreen font-bold text-xs hover:underline flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-xs">info</span>
          Súgó & Szintaxis minta megnyitása
        </button>
      </div>

      <form onSubmit={onSave} className="space-y-4 font-mono text-xs">
        {/* Row 1: Title, Content Type, Project/Workspace, Visibility */}
        <div className="grid md:grid-cols-12 gap-4">
          <div className="md:col-span-5">
            <label className="block dark:text-slate-400 text-slate-900 mb-1 font-bold">CÍM (TITLE)</label>
            <input
              type="text"
              required
              value={editingBlog.title}
              onChange={(e) => setEditingBlog({ ...editingBlog, title: e.target.value })}
              placeholder="pl. Zárt Vállalati RAG Architektúra Bevezetése"
              className="w-full dark:bg-slate-900 bg-white border-2 dark:border-white/15 border-slate-900 p-2.5 text-on-surface font-bold focus:border-neonCyan outline-none"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block dark:text-slate-400 text-slate-900 mb-1 font-bold">TARTALOM TÍPUSA</label>
            <select
              value={editingBlog.content_type || 'knowledge'}
              onChange={(e) => setEditingBlog({ ...editingBlog, content_type: e.target.value })}
              className="w-full dark:bg-slate-900 bg-white border-2 dark:border-plasmaGreen/50 border-slate-900 p-2.5 text-plasmaGreen font-bold outline-none focus:border-plasmaGreen"
            >
              <option value="knowledge">📚 TUDÁSTÁR CIKK</option>
              <option value="blog">📰 BLOG / ESETTANULMÁNY</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="block dark:text-slate-400 text-slate-900 mb-1 font-bold">MUNKATÉR (WORKSPACE)</label>
            <select
              value={editingBlog.project_id || 'prj_rag_enterprise'}
              onChange={(e) => setEditingBlog({ ...editingBlog, project_id: e.target.value })}
              className="w-full dark:bg-slate-900 bg-white border-2 dark:border-white/15 border-slate-900 p-2.5 text-neonCyan font-bold outline-none focus:border-neonCyan"
            >
              <option value="prj_spaceos">SpaceOS Nexus</option>
              <option value="prj_cad_auto">CAD & Automatizáció</option>
              <option value="prj_cabinetbuilder">CabinetBilder</option>
              <option value="prj_doccapture">DocCapture</option>
              <option value="prj_joinerytech">JoineryTech</option>
              <option value="prj_rag_enterprise">Zárt Vállalati RAG</option>
              <option value="prj_internal_notes">🔒 Belső Kutatási Jegyzetek</option>
              <option value="prj_general">Általános Munkatér</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block dark:text-slate-400 text-slate-900 mb-1 font-bold">LÁTHATÓSÁG</label>
            <select
              value={editingBlog.visibility || 'public'}
              onChange={(e) => setEditingBlog({ ...editingBlog, visibility: e.target.value })}
              className={`w-full dark:bg-slate-900 bg-white border-2 p-2.5 outline-none font-bold ${
                editingBlog.visibility === 'private' ? 'border-neonMagenta text-neonMagenta' : 'border-slate-900 dark:border-neonCyan text-neonCyan'
              }`}
            >
              <option value="public">🌐 PUBLIKUS</option>
              <option value="private">🔒 PRIVÁT</option>
            </select>
          </div>
        </div>

        {/* Row 2: Category, Audio URL, Read Time */}
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block dark:text-slate-400 text-slate-900 mb-1 font-bold">KATEGÓRIA</label>
            <input
              type="text"
              value={editingBlog.category}
              onChange={(e) => setEditingBlog({ ...editingBlog, category: e.target.value })}
              placeholder="pl. ADATBIZTONSÁG, AUTOMATIZÁLÁS"
              className="w-full dark:bg-slate-900 bg-white border-2 dark:border-white/15 border-slate-900 p-2.5 text-on-surface font-bold focus:border-neonCyan outline-none"
            />
          </div>

          <div>
            <label className="block dark:text-slate-400 text-slate-900 mb-1 font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-xs text-neonMagenta">headphones</span>
              NOTEBOOKLM AUDIO URL (.MP3)
            </label>
            <input
              type="text"
              value={editingBlog.audio_url || ''}
              onChange={(e) => setEditingBlog({ ...editingBlog, audio_url: e.target.value })}
              placeholder="https://.../podcast_deep_dive.mp3"
              className="w-full dark:bg-slate-900 bg-white border-2 dark:border-white/15 border-slate-900 p-2.5 dark:text-slate-300 text-slate-900 font-bold focus:border-neonCyan outline-none text-[11px]"
            />
          </div>

          <div>
            <label className="block dark:text-slate-400 text-slate-900 mb-1 font-bold">BECSÜLT OLVASÁSI IDŐ</label>
            <input
              type="text"
              value={editingBlog.read_time}
              onChange={(e) => setEditingBlog({ ...editingBlog, read_time: e.target.value })}
              placeholder="pl. 4 PERC"
              className="w-full dark:bg-slate-900 bg-white border-2 dark:border-white/15 border-slate-900 p-2.5 text-on-surface font-bold focus:border-neonCyan outline-none"
            />
          </div>
        </div>

        {/* Row 3: Dimensions JSON / Inputs */}
        <div className="p-3 dark:bg-black/60 bg-slate-50 border-2 dark:border-white/10 border-slate-900">
          <div className="text-[10px] dark:text-slate-400 text-slate-900 uppercase font-bold tracking-wider mb-2 flex items-center gap-1">
            <span className="material-symbols-outlined text-xs text-neonCyan">hub</span>
            TÖBB-DIMENZIÓS SZŰRŐCÍMKÉK (VESSZŐVEL ELVÁLASZTVA):
          </div>
          <div className="grid md:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-[10px] dark:text-slate-500 text-slate-800 uppercase mb-1 font-bold">IPARÁGAK</label>
              <input
                type="text"
                value={Array.isArray(editingBlog.dimensions?.iparag) ? editingBlog.dimensions.iparag.join(', ') : ''}
                onChange={(e) => setEditingBlog({
                  ...editingBlog,
                  dimensions: {
                    ...editingBlog.dimensions,
                    iparag: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                  }
                })}
                placeholder="Gyártás, Építőipar, Logisztika"
                className="w-full dark:bg-slate-900 bg-white border-2 dark:border-white/10 border-slate-900 p-2 text-on-surface font-bold outline-none focus:border-neonCyan text-[11px]"
              />
            </div>
            <div>
              <label className="block text-[10px] dark:text-slate-500 text-slate-800 uppercase mb-1 font-bold">TECHNOLÓGIÁK</label>
              <input
                type="text"
                value={Array.isArray(editingBlog.dimensions?.technologia) ? editingBlog.dimensions.technologia.join(', ') : ''}
                onChange={(e) => setEditingBlog({
                  ...editingBlog,
                  dimensions: {
                    ...editingBlog.dimensions,
                    technologia: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                  }
                })}
                placeholder="Python, C# / .NET, AutoCAD, Local LLM"
                className="w-full dark:bg-slate-900 bg-white border-2 dark:border-white/10 border-slate-900 p-2 text-on-surface font-bold outline-none focus:border-neonCyan text-[11px]"
              />
            </div>
            <div>
              <label className="block text-[10px] dark:text-slate-500 text-slate-800 uppercase mb-1 font-bold">CÉLCSOPORT</label>
              <input
                type="text"
                value={Array.isArray(editingBlog.dimensions?.celcsoport) ? editingBlog.dimensions.celcsoport.join(', ') : ''}
                onChange={(e) => setEditingBlog({
                  ...editingBlog,
                  dimensions: {
                    ...editingBlog.dimensions,
                    celcsoport: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                  }
                })}
                placeholder="COO, IT Vezető, CEO"
                className="w-full dark:bg-slate-900 bg-white border-2 dark:border-white/10 border-slate-900 p-2 text-on-surface font-bold outline-none focus:border-neonCyan text-[11px]"
              />
            </div>
          </div>
        </div>

        {/* Summary */}
        <div>
          <label className="block dark:text-slate-400 text-slate-900 mb-1 font-bold">ÖSSZEFOGLALÓ / TEASER (KERESŐMOTORBAN ÉS KÁRTYÁN)</label>
          <textarea
            rows={2}
            value={editingBlog.summary}
            onChange={(e) => setEditingBlog({ ...editingBlog, summary: e.target.value })}
            placeholder="1-2 mondatos szakmai összefoglaló a cikk kulcsüzenetéről..."
            className="w-full dark:bg-slate-900 bg-white border-2 dark:border-white/15 border-slate-900 p-2.5 text-on-surface font-medium focus:border-neonCyan outline-none"
          />
        </div>

        {/* Markdown Editor & Live Preview Grid */}
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block dark:text-slate-400 text-slate-900 font-bold">MARKDOWN_SOURCE_CONTENT</label>
              <button
                type="button"
                onClick={onOpenCheatSheet}
                className="text-emerald-700 dark:text-plasmaGreen font-bold text-[10px] hover:underline"
              >
                + Szintaxis beillesztése
              </button>
            </div>
            <textarea
              rows={14}
              value={editingBlog.content}
              onChange={(e) => setEditingBlog({ ...editingBlog, content: e.target.value })}
              className="w-full bg-[var(--surface-panel)] border-2 dark:border-white/15 border-slate-900 p-4 text-on-surface font-mono focus:border-neonCyan outline-none text-xs leading-relaxed font-medium"
            />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className="block dark:text-slate-400 text-slate-900 font-bold">ÉLŐ ELŐNÉZET (PREVIEW)</label>
              <span className="font-mono text-[9px] text-neonCyan border-2 dark:border-neonCyan/30 border-slate-900 px-1.5 py-0.5 bg-neonCyan/5 font-bold">VÉGLEGES MEGJELENÉS</span>
            </div>
            <div className="h-[310px] overflow-y-auto bg-[var(--bg-main)] border-2 dark:border-neonCyan/20 border-slate-900 p-4 text-on-surface shadow-inner">
              <MarkdownRenderer content={editingBlog.content} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 py-2">
          <label className="flex items-center gap-2 dark:text-white text-slate-900 font-bold cursor-pointer">
            <input
              type="checkbox"
              checked={!!editingBlog.published}
              onChange={(e) => setEditingBlog({ ...editingBlog, published: e.target.checked ? 1 : 0 })}
              className="accent-neonCyan w-4 h-4"
            />
            <span>PUBLIKÁLT STÁTUSZ (PUBLISHED)</span>
          </label>
        </div>

        <div className="flex gap-4 pt-3 border-t-2 dark:border-white/10 border-slate-900">
          <button type="submit" className="dark:bg-neonCyan bg-cyan-700 text-white dark:text-black font-headline font-black italic px-8 py-2.5 uppercase border-2 border-slate-950 shadow-[3px_3px_0_#0f172a] hover:bg-slate-950 hover:text-white transition-all">
            MENTÉS_ÉS_PUBLIKÁLÁS 💾
          </button>
          <button type="button" onClick={() => setEditingBlog(null)} className="border-2 dark:border-white/20 border-slate-900 px-6 py-2.5 uppercase dark:text-slate-300 text-slate-900 font-bold hover:bg-slate-900 hover:text-white transition-colors shadow-[2px_2px_0_#0f172a] dark:shadow-none">
            MÉGSE
          </button>
        </div>
      </form>
    </div>
  );
};

export default BlogPostModal;
