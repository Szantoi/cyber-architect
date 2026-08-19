import React from 'react';

const HeroSettingsTab = ({ settingsForm, setSettingsForm, onSave }) => {
  return (
    <div className="bg-[var(--surface-panel)] p-8 border-2 dark:border-white/10 border-slate-900 relative shadow-[6px_6px_0_#0f172a] dark:shadow-none">
      <div className="corner-bracket-tl dark:text-white/10 text-slate-900"></div>
      <div className="corner-bracket-br dark:text-white/10 text-slate-900"></div>

      <h2 className="text-2xl font-headline font-black italic uppercase text-on-surface mb-6 flex items-center gap-3">
        <span className="text-neonCyan">//</span> HERO & GLOBAL PARAMETERS
      </h2>

      <form onSubmit={onSave} className="space-y-6 font-mono text-xs">
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block dark:text-slate-400 text-slate-900 font-bold uppercase mb-2">HERO_STATUS_TELEMETRY</label>
            <input
              type="text"
              value={settingsForm.hero_status || ''}
              onChange={(e) => setSettingsForm({ ...settingsForm, hero_status: e.target.value })}
              className="w-full dark:bg-slate-900 bg-white border-2 dark:border-white/10 border-slate-900 p-3 text-neonCyan font-bold focus:border-neonCyan outline-none"
            />
          </div>
          <div>
            <label className="block dark:text-slate-400 text-slate-900 font-bold uppercase mb-2">HERO_PRIMARY_BUTTON_LABEL</label>
            <input
              type="text"
              value={settingsForm.hero_btn_primary || ''}
              onChange={(e) => setSettingsForm({ ...settingsForm, hero_btn_primary: e.target.value })}
              className="w-full dark:bg-slate-900 bg-white border-2 dark:border-white/10 border-slate-900 p-3 dark:text-white text-slate-950 font-bold focus:border-neonCyan outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block dark:text-slate-400 text-slate-900 font-bold uppercase mb-2">HERO_TITLE (Supports Line Breaks)</label>
          <textarea
            rows={2}
            value={settingsForm.hero_title || ''}
            onChange={(e) => setSettingsForm({ ...settingsForm, hero_title: e.target.value })}
            className="w-full dark:bg-slate-900 bg-white border-2 dark:border-white/10 border-slate-900 p-3 dark:text-white text-slate-950 font-headline text-lg italic uppercase font-bold focus:border-neonCyan outline-none"
          />
        </div>

        <div>
          <label className="block dark:text-slate-400 text-slate-900 font-bold uppercase mb-2">HERO_SUBTITLE_DESCRIPTION</label>
          <textarea
            rows={3}
            value={settingsForm.hero_subtitle || ''}
            onChange={(e) => setSettingsForm({ ...settingsForm, hero_subtitle: e.target.value })}
            className="w-full dark:bg-slate-900 bg-white border-2 dark:border-white/10 border-slate-900 p-3 dark:text-slate-300 text-slate-900 font-body font-medium focus:border-neonCyan outline-none leading-relaxed"
          />
        </div>

        <div className="grid md:grid-cols-2 gap-6 pt-4 border-t-2 dark:border-white/10 border-slate-900">
          <div>
            <label className="block dark:text-slate-400 text-slate-900 font-bold uppercase mb-2">DIAGNOSTICS_SECTION_TITLE</label>
            <input
              type="text"
              value={settingsForm.diagnostics_title || ''}
              onChange={(e) => setSettingsForm({ ...settingsForm, diagnostics_title: e.target.value })}
              className="w-full dark:bg-slate-900 bg-white border-2 dark:border-white/10 border-slate-900 p-3 dark:text-white text-slate-950 font-bold focus:border-neonCyan outline-none"
            />
          </div>
          <div>
            <label className="block dark:text-slate-400 text-slate-900 font-bold uppercase mb-2">UPLINK_SECTION_TITLE</label>
            <input
              type="text"
              value={settingsForm.uplink_title || ''}
              onChange={(e) => setSettingsForm({ ...settingsForm, uplink_title: e.target.value })}
              className="w-full dark:bg-slate-900 bg-white border-2 dark:border-white/10 border-slate-900 p-3 dark:text-white text-slate-950 font-bold focus:border-neonCyan outline-none"
            />
          </div>
        </div>

        <div className="pt-6">
          <button
            type="submit"
            className="dark:bg-neonCyan bg-cyan-700 text-white dark:text-black font-headline font-black italic uppercase px-8 py-4 border-2 border-slate-950 shadow-[4px_4px_0_#0f172a] hover:bg-slate-950 hover:text-white transition-all duration-200"
          >
            SAVE_GLOBAL_SETTINGS
          </button>
        </div>
      </form>
    </div>
  );
};

export default HeroSettingsTab;
