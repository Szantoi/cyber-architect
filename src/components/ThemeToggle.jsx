import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { Sun, Moon } from 'lucide-react';

const ThemeToggle = ({ className = '' }) => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`
        group relative flex items-center gap-2 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-all duration-200 rounded-none cursor-pointer select-none
        ${isDark 
          ? 'bg-slate-900/80 border border-neonCyan/40 text-neonCyan hover:bg-neonCyan hover:text-black hover:shadow-[0_0_15px_rgba(0,251,251,0.4)]' 
          : 'bg-[#cad4e2] border-2 border-slate-900 text-slate-900 shadow-[2px_2px_0_#0f172a] hover:bg-slate-900 hover:text-white font-bold'
        }
        ${className}
      `}
      title={isDark ? 'Váltás világos módra (Daylight Tactical Slate)' : 'Váltás sötét módra (Void Dark Archive)'}
      aria-label="Témaváltó"
    >
      <span className="flex items-center gap-1.5">
        {isDark ? (
          <>
            <Moon size={12} className="text-neonCyan group-hover:text-black transition-colors" />
            <span className="hidden sm:inline font-bold">VOID_DARK</span>
          </>
        ) : (
          <>
            <Sun size={12} className="text-amber-600 group-hover:text-amber-300 transition-colors" />
            <span className="hidden sm:inline font-black">DAYLIGHT</span>
          </>
        )}
      </span>
      <span className={`w-2 h-2 inline-block ${isDark ? 'bg-plasmaGreen' : 'bg-cyan-700'} group-hover:bg-current`}></span>
    </button>
  );
};

export default ThemeToggle;
