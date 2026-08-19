import React from 'react';
import SkillModal from '../modals/SkillModal';

const SkillsTab = ({ skills, editingSkill, setEditingSkill, onSaveSkill, onDeleteSkill }) => {
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-headline font-black italic uppercase text-on-surface">
          <span className="text-neonCyan">//</span> ARSENAL CAPABILITIES
        </h2>
        <button
          onClick={() => setEditingSkill({ name: '', icon: 'terminal', color: 'var(--neon-cyan)', level: '0.90', desc: '', sort_order: skills.length + 1 })}
          className="dark:bg-neonCyan bg-cyan-700 text-white dark:text-black font-headline font-black italic px-6 py-2 uppercase border-2 border-slate-950 shadow-[3px_3px_0_#0f172a] hover:bg-slate-950 hover:text-white transition-all"
        >
          + ADD_SKILL_MODULE
        </button>
      </div>

      {/* Skill Edit / Create Form */}
      <SkillModal
        editingSkill={editingSkill}
        setEditingSkill={setEditingSkill}
        onSave={onSaveSkill}
      />

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-xs">
        {skills.map(skill => (
          <div key={skill.id} className="p-5 bg-[var(--surface-panel)] border-2 dark:border-white/10 border-slate-900 shadow-[4px_4px_0_#0f172a] dark:shadow-none flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start mb-3">
                <span className="material-symbols-outlined text-2xl text-neonCyan">{skill.icon}</span>
                <span className="text-plasmaGreen font-black">{skill.level}</span>
              </div>
              <h4 className="font-headline font-bold text-on-surface uppercase text-base mb-1">{skill.name}</h4>
              <p className="dark:text-slate-400 text-slate-700 text-[11px] mb-4 leading-relaxed font-medium">{skill.desc}</p>
            </div>
            <div className="flex gap-2 border-t-2 dark:border-white/5 border-slate-900 pt-3">
              <button onClick={() => setEditingSkill(skill)} className="text-neonCyan font-bold hover:underline uppercase">EDIT</button>
              <span className="dark:text-white/20 text-slate-400">|</span>
              <button onClick={() => onDeleteSkill(skill.id)} className="text-neonMagenta font-bold hover:underline uppercase">PURGE</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SkillsTab;
