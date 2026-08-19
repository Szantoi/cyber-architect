import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ContentContext = createContext(null);

const DEFAULT_DIAGNOSTICS_STEPS = [
  { 
    id: '01', 
    title: 'Megértés & Folyamatvizsgálat', 
    color: '#00FFFF', 
    query: 'szigetrendszerek excel folyamatautomatizálás',
    blogHint: 'Szigetrendszerek & Excel kiváltása',
    docHint: 'Folyamatoptimalizálás Esettanulmány',
    text: 'Nem kezdek el vakon kódolni. Először feltárjuk a céges működés szűk keresztmetszeteit, a manuális feladatokat és az összekapcsolandó rendszereket.' 
  },
  { 
    id: '02', 
    title: 'Biztonságos Tervezés & Kód', 
    color: '#FF00FF', 
    query: 'zárt vállalati RAG adatbiztonság vektoros',
    blogHint: 'Vállalati AI & Adatbiztonság RAG',
    docHint: 'Hibrid RAG Vektoros Keresés & XAI',
    text: 'Python és .NET alapú megbízható megoldásokat és zárt belső AI-t építünk, így az üzleti adatok garantáltan a cégen belül maradnak.', 
    offset: 'ml-0 md:ml-6' 
  },
  { 
    id: '03', 
    title: 'Gyakorlati Bevezetés & Oktatás', 
    color: '#80FF00', 
    query: 'AutoCAD adatkinyerés automatizáció oktatás',
    blogHint: 'CAD automatizáció mérnöki szemmel',
    docHint: 'AutoCAD .NET C# Adatkinyerés',
    text: 'Nem hagyom magára a csapatot az új szoftverrel. A rendszert beüzemeljük, a munkatársakat betanítjuk, és biztosítjuk a zökkenőmentes használatot.', 
    offset: 'ml-0 md:ml-12' 
  }
];

const DEFAULT_SETTINGS = {
  hero_status: 'RENDSZER: AKTÍV // AI & FOLYAMATAUTOMATIZÁCIÓ',
  hero_title: 'Szántói\nGábor.',
  hero_subtitle: 'Mérnöki szemléletű folyamatfejlesztő és AI integrátor. Szigetrendszerek összekötése, manuális adminisztráció kiváltása és biztonságos belső AI megoldások (RAG, API) bevezetése vállalati környezetben.',
  hero_btn_primary: 'KAPCSOLATFELVÉTEL',
  hero_btn_secondary: 'PROJEKTEK MEGTEKINTÉSE',
  diagnostics_title: 'Módszertan & Folyamat',
  diagnostics_subtitle: 'A technológia csak eszköz: először a vállalati működést és a szűk keresztmetszeteket vizsgáljuk meg, majd stabil, kód-alapú architektúrát építünk.',
  diagnostics_steps: DEFAULT_DIAGNOSTICS_STEPS,
  uplink_title: 'Kapcsolat.',
  uplink_subtitle: 'Konzultáljunk a vállalati folyamatok automatizálásáról vagy egy zárt AI pilot indításáról.'
};

export const ContentProvider = ({ children }) => {
  const [content, setContent] = useState({
    settings: DEFAULT_SETTINGS,
    skills: [],
    projects: [],
    recentBlogs: []
  });
  const [isLoading, setIsLoading] = useState(true);

  const fetchContent = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/content');
      if (res.ok) {
        const data = await res.json();
        let parsedSteps = DEFAULT_DIAGNOSTICS_STEPS;
        if (data.settings?.diagnostics_steps) {
          try {
            parsedSteps = typeof data.settings.diagnostics_steps === 'string'
              ? JSON.parse(data.settings.diagnostics_steps)
              : data.settings.diagnostics_steps;
          } catch {
            parsedSteps = DEFAULT_DIAGNOSTICS_STEPS;
          }
        }

        setContent(prev => ({
          settings: { 
            ...prev.settings, 
            ...data.settings,
            diagnostics_steps: parsedSteps
          },
          skills: data.skills || [],
          projects: data.projects || [],
          recentBlogs: data.recentBlogs || []
        }));
      }
    } catch (err) {
      console.warn('[ContentContext] Backend API unreachable, falling back to local defaults:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  return (
    <ContentContext.Provider value={{
      ...content,
      isLoading,
      refreshContent: fetchContent
    }}>
      {children}
    </ContentContext.Provider>
  );
};

export const useContent = () => {
  const ctx = useContext(ContentContext);
  if (!ctx) {
    throw new Error('useContent must be used within a ContentProvider');
  }
  return ctx;
};
