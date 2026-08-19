import React from 'react';

const SkillModal = ({ editingSkill, setEditingSkill, onSave }) => {
  if (!editingSkill) return null;

  return (
    <div className="mb-8 p-6 bg-[var(--surface-panel)] border-2 dark:border-neonCyan border-slate-900 relative shadow-[6px_6px_0_#0f172a] dark:shadow-2xl">
      <div className="corner-bracket-tl text-neonCyan"></div>
      <h3 className="font-headline text-lg font-black uppercase text-neonCyan mb-4">
        {editingSkill.id ? `EDIT_SKILL_MODULE #${editingSkill.id}` : 'NEW_SKILL_MODULE'}
      </h3>
      <form onSubmit={onSave} className="space-y-4 font-mono text-xs">
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block dark:text-slate-400 text-slate-900 font-bold mb-1 uppercase">SKILL_NAME</label>
            <input
              type="text"
              required
              value={editingSkill.name}
              onChange={(e) => setEditingSkill({ ...editingSkill, name: e.target.value })}
              className="w-full dark:bg-slate-900 bg-white border-2 dark:border-white/10 border-slate-900 p-2.5 dark:text-white text-slate-950 font-bold focus:border-neonCyan outline-none"
            />
          </div>
          <div>
            <label className="block dark:text-slate-400 text-slate-900 font-bold mb-1 uppercase">MATERIAL_ICON_NAME</label>
            <input
              type="text"
              value={editingSkill.icon}
              onChange={(e) => setEditingSkill({ ...editingSkill, icon: e.target.value })}
              placeholder="e.g. terminal, cloud_sync"
              className="w-full dark:bg-slate-900 bg-white border-2 dark:border-white/10 border-slate-900 p-2.5 dark:text-white text-slate-950 font-bold focus:border-neonCyan outline-none"
            />
          </div>
          <div>
            <label className="block dark:text-slate-400 text-slate-900 font-bold mb-1 uppercase">PROFICIENCY_SIGNAL (0.00 - 1.00)</label>
            <input
              type="text"
              value={editingSkill.level}
              onChange={(e) => setEditingSkill({ ...editingSkill, level: e.target.value })}
              className="w-full dark:bg-slate-900 bg-white border-2 dark:border-white/10 border-slate-900 p-2.5 text-plasmaGreen font-bold focus:border-neonCyan outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block dark:text-slate-400 text-slate-900 font-bold mb-1 uppercase">DESCRIPTION</label>
          <textarea
            rows={2}
            value={editingSkill.desc || ''}
            onChange={(e) => setEditingSkill({ ...editingSkill, desc: e.target.value })}
            className="w-full dark:bg-slate-900 bg-white border-2 dark:border-white/10 border-slate-900 p-2.5 dark:text-slate-300 text-slate-900 font-medium focus:border-neonCyan outline-none leading-relaxed"
          />
        </div>

        <div>
          <label className="block dark:text-slate-400 text-slate-900 font-bold mb-1 uppercase">
            RAG_EVIDENCE_SEARCH_QUERY (Automatikus hibrid keresési kulcsszavak ehhez a modulhoz)
          </label>
          <input
            type="text"
            value={editingSkill.query || ''}
            placeholder="pl. zárt vállalati RAG vektoros keresés embeddings"
            onChange={(e) => setEditingSkill({ ...editingSkill, query: e.target.value })}
            className="w-full dark:bg-slate-900 bg-white border-2 dark:border-white/10 border-slate-900 p-2.5 text-neonCyan font-bold focus:border-neonCyan outline-none"
          />
        </div>

        <div className="flex gap-4">
          <button type="submit" className="dark:bg-neonCyan bg-cyan-700 text-white dark:text-black font-headline font-black italic px-6 py-2 uppercase border-2 border-slate-950 shadow-[3px_3px_0_#0f172a] hover:bg-slate-950 hover:text-white transition-all">
            CONFIRM_SAVE
          </button>
          <button type="button" onClick={() => setEditingSkill(null)} className="border-2 dark:border-white/20 border-slate-900 px-6 py-2 uppercase dark:text-slate-300 text-slate-900 font-bold hover:bg-slate-900 hover:text-white transition-all">
            CANCEL
          </button>
        </div>
      </form>
    </div>
  );
};

export default SkillModal;
