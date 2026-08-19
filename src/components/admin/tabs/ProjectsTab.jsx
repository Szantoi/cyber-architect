import React from 'react';
import ProjectModal from '../modals/ProjectModal';

const ProjectsTab = ({ projects, editingProject, setEditingProject, onSaveProject, onDeleteProject }) => {
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-headline font-black italic uppercase text-on-surface">
          <span className="text-neonCyan">//</span> GRID PROJECT ARCHIVE
        </h2>
        <button
          onClick={() => setEditingProject({ id: `PRJ_${Math.floor(Math.random()*900+100)}`, title: '', desc: '', img: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=1000&auto=format&fit=crop', tags: ['REACT 19'], status: 'ARCHIVED', addr: '0xFA', sec_auth: 'OMEGA' })}
          className="dark:bg-neonCyan bg-cyan-700 text-white dark:text-black font-headline font-black italic px-6 py-2 uppercase border-2 border-slate-950 shadow-[3px_3px_0_#0f172a] hover:bg-slate-950 hover:text-white transition-all"
        >
          + ADD_PROJECT_RECORD
        </button>
      </div>

      {/* Project Edit / Create Form */}
      <ProjectModal
        editingProject={editingProject}
        setEditingProject={setEditingProject}
        onSave={onSaveProject}
      />

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 font-mono text-xs">
        {projects.map(proj => (
          <div key={proj.id} className="bg-[var(--surface-panel)] border-2 dark:border-white/10 border-slate-900 shadow-[4px_4px_0_#0f172a] dark:shadow-none p-4 flex flex-col justify-between">
            <div>
              <div className="aspect-video w-full mb-3 dark:bg-slate-900 bg-slate-200 border-2 dark:border-white/5 border-slate-900 overflow-hidden relative">
                <img src={proj.img} alt={proj.title} className="w-full h-full object-cover opacity-75 grayscale hover:grayscale-0 transition-all" />
                <span className="absolute top-2 left-2 bg-black/80 px-2 py-0.5 text-[9px] text-neonCyan font-bold border border-neonCyan/30">
                  [{proj.id}]
                </span>
              </div>
              <div className="flex justify-between items-center mb-1">
                <h4 className="font-headline font-black text-on-surface uppercase text-base">{proj.title}</h4>
                <span className="text-[10px] text-plasmaGreen font-bold">{proj.status}</span>
              </div>
              <p className="dark:text-slate-400 text-slate-700 text-xs mb-3 leading-relaxed font-medium">{proj.desc}</p>
            </div>
            <div className="flex gap-2 border-t-2 dark:border-white/5 border-slate-900 pt-3">
              <button onClick={() => setEditingProject(proj)} className="text-neonCyan font-bold hover:underline uppercase">EDIT</button>
              <span className="dark:text-white/20 text-slate-400">|</span>
              <button onClick={() => onDeleteProject(proj.id)} className="text-neonMagenta font-bold hover:underline uppercase">PURGE</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProjectsTab;
