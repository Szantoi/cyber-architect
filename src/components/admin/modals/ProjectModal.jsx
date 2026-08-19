import React from 'react';

const ProjectModal = ({ editingProject, setEditingProject, onSave }) => {
  if (!editingProject) return null;

  return (
    <div className="mb-8 p-6 bg-[var(--surface-panel)] border-2 dark:border-neonCyan border-slate-900 relative shadow-[6px_6px_0_#0f172a] dark:shadow-2xl">
      <div className="corner-bracket-tl text-neonCyan"></div>
      <h3 className="font-headline text-lg font-black uppercase text-neonCyan mb-4">
        EDIT_PROJECT_RECORD [{editingProject.id}]
      </h3>
      <form onSubmit={onSave} className="space-y-4 font-mono text-xs">
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block dark:text-slate-400 text-slate-900 font-bold mb-1 uppercase">PROJECT_IDENTIFIER</label>
            <input
              type="text"
              required
              value={editingProject.id}
              onChange={(e) => setEditingProject({ ...editingProject, id: e.target.value })}
              className="w-full dark:bg-slate-900 bg-white border-2 dark:border-white/10 border-slate-900 p-2.5 text-neonCyan font-bold focus:border-neonCyan outline-none"
            />
          </div>
          <div>
            <label className="block dark:text-slate-400 text-slate-900 font-bold mb-1 uppercase">PROJECT_TITLE</label>
            <input
              type="text"
              required
              value={editingProject.title}
              onChange={(e) => setEditingProject({ ...editingProject, title: e.target.value })}
              className="w-full dark:bg-slate-900 bg-white border-2 dark:border-white/10 border-slate-900 p-2.5 dark:text-white text-slate-950 font-bold focus:border-neonCyan outline-none"
            />
          </div>
          <div>
            <label className="block dark:text-slate-400 text-slate-900 font-bold mb-1 uppercase">STATUS (ACTIVE/ARCHIVED/OPTIMIZED)</label>
            <input
              type="text"
              value={editingProject.status}
              onChange={(e) => setEditingProject({ ...editingProject, status: e.target.value })}
              className="w-full dark:bg-slate-900 bg-white border-2 dark:border-white/10 border-slate-900 p-2.5 dark:text-white text-slate-950 font-bold focus:border-neonCyan outline-none"
            />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block dark:text-slate-400 text-slate-900 font-bold mb-1 uppercase">COVER_IMAGE_URL</label>
            <input
              type="text"
              value={editingProject.img}
              onChange={(e) => setEditingProject({ ...editingProject, img: e.target.value })}
              className="w-full dark:bg-slate-900 bg-white border-2 dark:border-white/10 border-slate-900 p-2.5 dark:text-slate-300 text-slate-900 font-medium focus:border-neonCyan outline-none"
            />
          </div>
          <div>
            <label className="block dark:text-slate-400 text-slate-900 font-bold mb-1 uppercase">TAGS (COMMA SEPARATED)</label>
            <input
              type="text"
              value={Array.isArray(editingProject.tags) ? editingProject.tags.join(', ') : editingProject.tags}
              onChange={(e) => setEditingProject({ ...editingProject, tags: e.target.value.split(',').map(t => t.trim()) })}
              className="w-full dark:bg-slate-900 bg-white border-2 dark:border-white/10 border-slate-900 p-2.5 dark:text-slate-300 text-slate-900 font-medium focus:border-neonCyan outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block dark:text-slate-400 text-slate-900 font-bold mb-1 uppercase">DESCRIPTION</label>
          <textarea
            rows={2}
            value={editingProject.desc}
            onChange={(e) => setEditingProject({ ...editingProject, desc: e.target.value })}
            className="w-full dark:bg-slate-900 bg-white border-2 dark:border-white/10 border-slate-900 p-2.5 dark:text-slate-300 text-slate-900 font-medium focus:border-neonCyan outline-none leading-relaxed"
          />
        </div>

        <div className="flex gap-4">
          <button type="submit" className="dark:bg-neonCyan bg-cyan-700 text-white dark:text-black font-headline font-black italic px-6 py-2 uppercase border-2 border-slate-950 shadow-[3px_3px_0_#0f172a] hover:bg-slate-950 hover:text-white transition-all">
            CONFIRM_PROJECT_RECORD
          </button>
          <button type="button" onClick={() => setEditingProject(null)} className="border-2 dark:border-white/20 border-slate-900 px-6 py-2 uppercase dark:text-slate-300 text-slate-900 font-bold hover:bg-slate-900 hover:text-white transition-all">
            CANCEL
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProjectModal;
