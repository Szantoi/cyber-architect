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

        {/* Structured Diagnostics Steps Editor */}
        <div className="pt-6 border-t-2 dark:border-white/10 border-slate-900">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-headline font-black text-base uppercase text-neonCyan flex items-center gap-2">
                <span>//</span> MÓDSZERTAN & FOLYAMAT LÉPÉSEK (DIAGNOSTICS STEPS + RAG)
              </h3>
              <p className="text-[11px] dark:text-slate-400 text-slate-600 font-medium mt-0.5">
                A kezdőlapi módszertan kártyák, leírások és a hozzájuk rendelt RAG keresési kulcsszavak szerkesztése.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {(() => {
              let steps = [];
              try {
                steps = typeof settingsForm.diagnostics_steps === 'string'
                  ? JSON.parse(settingsForm.diagnostics_steps)
                  : (settingsForm.diagnostics_steps || []);
              } catch {
                steps = [];
              }

              const handleStepChange = (index, field, value) => {
                const updated = [...steps];
                updated[index] = { ...updated[index], [field]: value };
                setSettingsForm({
                  ...settingsForm,
                  diagnostics_steps: JSON.stringify(updated)
                });
              };

              return steps.map((step, idx) => (
                <div key={step.id || idx} className="p-4 dark:bg-slate-950/70 bg-slate-100 border-2 dark:border-white/10 border-slate-900 space-y-3">
                  <div className="flex items-center justify-between border-b dark:border-white/10 border-slate-300 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-neonCyan"></span>
                      <span className="font-bold text-neonCyan">LÉPÉS #{step.id || `0${idx + 1}`}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-slate-400 font-bold uppercase">KIEMELŐ SZÍN:</label>
                      <input 
                        type="text" 
                        value={step.color || '#00FFFF'}
                        onChange={(e) => handleStepChange(idx, 'color', e.target.value)}
                        className="dark:bg-slate-900 bg-white border border-slate-700 px-2 py-0.5 text-xs text-neonCyan w-24 font-bold"
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">LÉPÉS CÍME</label>
                      <input 
                        type="text"
                        value={step.title || ''}
                        onChange={(e) => handleStepChange(idx, 'title', e.target.value)}
                        className="w-full dark:bg-slate-900 bg-white border dark:border-white/10 border-slate-900 p-2 font-bold dark:text-white text-slate-950 outline-none focus:border-neonCyan"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">RAG BIZONYÍTÉK GOMB FELIRAT / TIPP</label>
                      <input 
                        type="text"
                        value={step.blogHint || ''}
                        onChange={(e) => handleStepChange(idx, 'blogHint', e.target.value)}
                        className="w-full dark:bg-slate-900 bg-white border dark:border-white/10 border-slate-900 p-2 font-bold dark:text-white text-slate-950 outline-none focus:border-neonCyan"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">LÉPÉS LEÍRÁSA</label>
                    <textarea 
                      rows={2}
                      value={step.text || ''}
                      onChange={(e) => handleStepChange(idx, 'text', e.target.value)}
                      className="w-full dark:bg-slate-900 bg-white border dark:border-white/10 border-slate-900 p-2 font-medium dark:text-slate-300 text-slate-900 outline-none focus:border-neonCyan leading-relaxed"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">
                      RAG KERESÉSI KULCSSZAVAK (Automatikus cikk és esettanulmány illesztéshez)
                    </label>
                    <input 
                      type="text"
                      value={step.query || ''}
                      onChange={(e) => handleStepChange(idx, 'query', e.target.value)}
                      placeholder="pl. szigetrendszerek excel folyamatautomatizálás"
                      className="w-full dark:bg-slate-900 bg-white border dark:border-white/10 border-slate-900 p-2 font-bold text-neonCyan outline-none focus:border-neonCyan"
                    />
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>

        <div className="pt-6">
          <button
            type="submit"
            className="dark:bg-neonCyan bg-cyan-700 text-white dark:text-black font-headline font-black italic uppercase px-8 py-4 border-2 border-slate-950 shadow-[4px_4px_0_#0f172a] hover:bg-slate-950 hover:text-white transition-all duration-200 cursor-pointer"
          >
            SAVE_GLOBAL_SETTINGS
          </button>
        </div>
      </form>
    </div>
  );
};

export default HeroSettingsTab;
