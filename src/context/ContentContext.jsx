import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ContentContext = createContext(null);

const DEFAULT_SETTINGS = {
  hero_status: 'RENDSZER: AKTÍV // AI & FOLYAMATAUTOMATIZÁCIÓ',
  hero_title: 'Szántói\nGábor.',
  hero_subtitle: 'Mérnöki szemléletű folyamatfejlesztő és AI integrátor. Szigetrendszerek összekötése, manuális adminisztráció kiváltása és biztonságos belső AI megoldások (RAG, API) bevezetése vállalati környezetben.',
  hero_btn_primary: 'KAPCSOLATFELVÉTEL',
  hero_btn_secondary: 'PROJEKTEK MEGTEKINTÉSE',
  diagnostics_title: 'Módszertan & Folyamat',
  diagnostics_subtitle: 'A technológia csak eszköz: először a vállalati működést és a szűk keresztmetszeteket vizsgáljuk meg, majd stabil, kód-alapú architektúrát építünk.',
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
        setContent(prev => ({
          settings: { ...prev.settings, ...data.settings },
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
