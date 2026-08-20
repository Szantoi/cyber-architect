import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useContent } from '../context/ContentContext';

// Submit button component using useFormStatus for pending states
const TransmitButton = () => {
  const { pending } = useFormStatus();
  
  return (
    <button 
      type="submit" 
      disabled={pending}
      className={`dark:bg-neonCyan bg-cyan-700 text-white dark:text-black px-12 py-4 font-black italic transition-all duration-200 flex items-center gap-3 rounded-none border-2 border-slate-950 shadow-[4px_4px_0_#0f172a] hover:bg-slate-950 hover:text-cyan-300 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none uppercase ${pending ? 'opacity-50 cursor-wait' : ''}`}
    >
      {pending ? 'KÜLDÉS FOLYAMATBAN...' : 'ÜZENET KÜLDÉSE'}
      <span className={`material-symbols-outlined shrink-0 text-xl font-bold ${pending ? 'animate-spin' : ''}`}>
        {pending ? 'sync' : 'send'}
      </span>
    </button>
  );
};

// Real database transmission action via API with Honeypot Trap
const transmitDataAction = async (prevState, formData) => {
  const identity = formData.get('identity');
  const subject = formData.get('subject');
  const message = formData.get('message');
  const website = formData.get('website'); // Honeypot field
  
  if (!identity || !subject) {
    return { success: false, message: 'HIBA: KÉRJÜK TÖLTSD KI A NÉV ÉS TÉMA MEZŐKET!' };
  }

  try {
    const res = await fetch('/api/uplink', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity, subject, message, website })
    });

    const data = await res.json();
    if (res.ok) {
      return { success: true, message: data.message || 'ÜZENET SIKERESEN TOVÁBBÍTVA. HAMAROSAN VÁLASZOLOK!' };
    }
    return { success: false, message: data.error || 'A SZERVER ELUTASÍTOTTA AZ ÜZENETET.' };
  } catch (err) {
    return { success: false, message: 'HÁLÓZATI IDŐTÚLLÉPÉS: AZ ÜZENET KÜLDÉSE SIKERTELEN VOLT.' };
  }
};

const Uplink = () => {
  const [state, formAction] = useActionState(transmitDataAction, null);
  const { settings } = useContent();

  const title = settings.uplink_title || 'Kapcsolat.';
  const subtitle = settings.uplink_subtitle || 'Konzultáljunk a vállalati folyamatok automatizálásáról vagy egy zárt AI pilot indításáról.';

  return (
    <section className="py-24 relative overflow-hidden bg-background scroll-mt-24" id="uplink">
      <div className="absolute inset-0 wireframe-grid opacity-10 pointer-events-none"></div>
      <div className="container mx-auto px-6 relative z-10">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="max-w-full break-words text-5xl sm:text-6xl md:text-8xl font-headline font-black italic uppercase text-on-surface glitch-text">
              {title}
            </h2>
            <p className="max-w-full break-words font-mono text-secondary-fixed mt-4 tracking-[0.12em] sm:tracking-widest uppercase">
              {subtitle}
            </p>
          </div>
          
          <form action={formAction} className="bg-[var(--surface-panel)] p-5 sm:p-8 md:p-12 border-2 dark:border-white/10 border-slate-900 rounded-none relative group shadow-[6px_6px_0_#0f172a] dark:shadow-none">
            <div className="absolute top-0 right-0 w-8 h-8 bg-secondary-fixed"></div>
            
            {/* Honeypot Trap field for spam bots (invisible to real humans) */}
            <div className="hidden" aria-hidden="true" style={{ display: 'none' }}>
              <label htmlFor="website">Website / URL Confirm</label>
              <input
                id="website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                placeholder="Do not fill this field"
              />
            </div>

            <div className="space-y-8 font-mono">
              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-4 relative">
                <span className="self-start dark:text-slate-500 text-slate-900 sm:shrink-0 font-black">NÉV_ÉS_EMAIL:~$</span>
                <input 
                  name="identity"
                  maxLength={120}
                  className="min-w-0 bg-transparent border-b-2 dark:border-white/10 border-slate-900 focus:border-cyan-600 focus:ring-0 text-on-surface dark:placeholder:text-slate-600 placeholder:text-slate-500 w-full font-mono py-2 outline-none transition-all duration-300 peer font-bold"
                  placeholder="Kovács Péter (peter@ceg.hu)" 
                  type="text"
                  required
                />
              </div>
              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-4 relative">
                <span className="self-start dark:text-slate-500 text-slate-900 sm:shrink-0 font-black">TÉMA:~$</span>
                <input 
                  name="subject"
                  maxLength={120}
                  className="min-w-0 bg-transparent border-b-2 dark:border-white/10 border-slate-900 focus:border-cyan-600 focus:ring-0 text-on-surface dark:placeholder:text-slate-600 placeholder:text-slate-500 w-full font-mono py-2 outline-none transition-all duration-300 peer font-bold"
                  placeholder="pl. Belső céges AI tudásbázis építése" 
                  type="text"
                  required
                />
              </div>
              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-start sm:gap-4 relative">
                <span className="self-start dark:text-slate-500 text-slate-900 sm:shrink-0 sm:pt-2 font-black">ÜZENET:~$</span>
                <textarea 
                  name="message"
                  rows={4}
                  maxLength={1000}
                  className="min-w-0 bg-transparent border-b-2 dark:border-white/10 border-slate-900 focus:border-cyan-600 focus:ring-0 text-on-surface dark:placeholder:text-slate-600 placeholder:text-slate-500 w-full font-mono py-2 outline-none transition-all duration-300 peer resize-none font-bold"
                  placeholder="Rövid leírás a feladatról..."
                ></textarea>
              </div>

              {state?.message && (
                <div className="font-mono text-xs">
                  <span className={state.success ? 'text-tertiary font-bold' : 'text-neonMagenta animate-pulse font-bold'}>
                    [{state.success ? 'SIKERES' : 'HIBA'}] {state.message}
                  </span>
                </div>
              )}

              <div className="pt-4 flex justify-end">
                <TransmitButton />
              </div>
            </div>
          </form>

          {/* AI Agent / MCP Connection Callout */}
          <div className="mt-8 p-6 border-2 border-neonCyan dark:bg-slate-950/80 bg-cyan-50/50 shadow-[4px_4px_0_#0f172a] flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <div className="p-3 bg-neonCyan/10 border border-neonCyan text-neonCyan shrink-0">
                <span className="material-symbols-outlined text-2xl font-black">smart_toy</span>
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-mono text-neonCyan font-black uppercase tracking-widest block">
                  AGENTIC FIRST // MODEL CONTEXT PROTOCOL
                </span>
                <h4 className="text-base font-headline font-black uppercase dark:text-white text-slate-950">
                  AI Ágensként vagy LLM Klienssel csatlakoznál?
                </h4>
                <p className="text-xs dark:text-slate-300 text-slate-700 font-body">
                  1-kattintásos MCP konfiguráció Claude Desktophoz, Cursorhoz, CLI-hez és egyedi ágensekhez.
                </p>
              </div>
            </div>

            <a
              href="/mcp"
              className="px-6 py-3 bg-neonCyan text-black font-headline font-black text-xs uppercase tracking-wider hover:bg-white transition-colors shrink-0 shadow-[2px_2px_0_#0f172a] flex items-center gap-2"
            >
              <span>MCP CSATLAKOZÁS</span>
              <span>→</span>
            </a>
          </div>

          <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { label: 'linkedin', value: '/in/gaborszantoi', href: 'https://www.linkedin.com/in/gaborszantoi/', hoverClass: 'group-hover:text-secondary-fixed' },
              { label: 'github', value: 'github.com/Szantoi', href: 'https://github.com/Szantoi', hoverClass: 'group-hover:text-[#00ffff]' },
              { label: 'email', value: 'szantoi.gabor@gmail.com', href: 'mailto:szantoi.gabor@gmail.com', hoverClass: 'group-hover:text-tertiary' },
              { label: 'helyszín', value: 'Budapest // Hibrid', href: '#', hoverClass: 'group-hover:text-white' }
            ].map((social) => (
              <a key={social.label} className="group" href={social.href} target={social.href.startsWith('http') ? '_blank' : '_self'} rel="noreferrer">
                <span className="block text-slate-500 font-mono text-[10px] mb-1 uppercase tracking-tighter">{social.label}</span>
                <span className={`block break-words font-headline font-bold text-on-surface ${social.hoverClass} transition-colors`}>{social.value}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Uplink;
