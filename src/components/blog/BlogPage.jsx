import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  FileText,
  Search,
  X,
} from 'lucide-react';
import MarkdownRenderer from '../markdown/MarkdownRenderer.jsx';
import CyberSEO from '../common/CyberSEO.jsx';
import { useAdminPreview } from '../../context/AdminPreviewContext.jsx';

const ALL_CATEGORIES = 'all';

const normalizeSlug = (value = '') => String(value)
  .replace(/^blog\/?/, '')
  .replace(/^\/+|\/+$/g, '');

const postDate = (post) => post?.updated_at || post?.created_at;

const formatCategory = (value) => String(value || 'Szakmai cikk')
  .replace(/^\d+_/, '')
  .replaceAll('_', ' ')
  .trim();

const formatDate = (value) => {
  if (!value) return 'Dátum nélkül';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('hu-HU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
};

const sortByNewest = (posts) => [...posts].sort(
  (first, second) => new Date(postDate(second) || 0) - new Date(postDate(first) || 0),
);

const readFilters = (search = '') => {
  const params = new URLSearchParams(search);
  return {
    query: params.get('q') || '',
    category: params.get('category') || ALL_CATEGORIES,
  };
};

const responseDocuments = (payload) => (
  Array.isArray(payload) ? payload : payload?.documents || payload?.posts || []
);

const articleStructuredData = (post) => ({
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: post.title,
  description: post.summary || post.title,
  datePublished: post.created_at || undefined,
  dateModified: post.updated_at || post.created_at || undefined,
  author: { '@type': 'Person', name: 'Szántói Gábor' },
});

const ReadingMeta = ({ post, compact = false }) => (
  <div
    className={`flex flex-wrap items-center gap-x-3 gap-y-1 font-mono uppercase tracking-wide text-slate-500 dark:text-slate-400 ${
      compact ? 'text-[9px]' : 'text-[10px]'
    }`}
  >
    <span className="inline-flex items-center gap-1.5">
      <CalendarDays size={compact ? 11 : 13} aria-hidden="true" />
      {formatDate(postDate(post))}
    </span>
    <span aria-hidden="true" className="text-neonCyan/70">•</span>
    <span className="inline-flex items-center gap-1.5">
      <Clock3 size={compact ? 11 : 13} aria-hidden="true" />
      {post.read_time || '5 perc'}
    </span>
  </div>
);

const ArticleCard = ({ post, index, onOpen, featured = false }) => (
  <motion.button
    type="button"
    initial={{ opacity: 0, y: 18 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.32, delay: Math.min(index, 6) * 0.045, ease: 'easeOut' }}
    onClick={() => onOpen(post)}
    aria-label={`${post.title} megnyitása`}
    data-testid="blog-article-card"
    className={`group relative block w-full overflow-hidden border text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neonCyan focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--bg-main)] ${
      featured
        ? 'border-neonCyan/60 bg-[linear-gradient(135deg,rgba(0,251,251,0.11),transparent_52%),var(--surface-panel)] p-6 shadow-[0_0_30px_rgba(0,251,251,0.08)] sm:p-9'
        : 'border-slate-300 bg-[var(--surface-panel)] p-5 hover:border-neonCyan/70 dark:border-white/10 dark:hover:border-neonCyan/70'
    }`}
  >
    {featured && (
      <>
        <span className="pointer-events-none absolute right-0 top-0 h-16 w-16 border-b border-l border-neonCyan/40" />
        <span className="pointer-events-none absolute right-3 top-3 font-mono text-[9px] font-black tracking-[0.2em] text-neonCyan">
          KIEMELT
        </span>
      </>
    )}

    <div className="relative flex h-full flex-col">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <span className="border border-neonCyan/40 bg-neonCyan/10 px-2 py-1 font-mono text-[9px] font-black uppercase tracking-[0.14em] text-cyan-800 dark:text-neonCyan">
          {formatCategory(post.category)}
        </span>
        <span className="font-mono text-[10px] font-bold text-slate-400 dark:text-slate-500">
          {String(index + 1).padStart(2, '0')}
        </span>
      </div>

      <h2 className={`font-headline font-black tracking-tight text-slate-950 transition-colors group-hover:text-cyan-800 dark:text-white dark:group-hover:text-neonCyan ${
        featured ? 'max-w-3xl text-3xl leading-[1.05] sm:text-5xl' : 'text-xl leading-tight'
      }`}>
        {post.title}
      </h2>

      <p className={`mt-4 max-w-3xl font-body leading-relaxed text-slate-700 dark:text-slate-300 ${
        featured ? 'text-base sm:text-lg' : 'text-sm'
      }`}>
        {post.summary || 'Megnyitás a teljes szakmai anyaghoz.'}
      </p>

      <div className="mt-7 flex flex-wrap items-end justify-between gap-4 border-t border-slate-200 pt-4 dark:border-white/10">
        <ReadingMeta post={post} compact={!featured} />
        <span className="inline-flex items-center gap-2 font-mono text-[10px] font-black uppercase tracking-[0.12em] text-cyan-800 transition-transform group-hover:translate-x-1 dark:text-neonCyan">
          Elolvasom <ArrowRight size={14} aria-hidden="true" />
        </span>
      </div>
    </div>
  </motion.button>
);

const BlogArchive = ({ catalog, posts, isLoading, isSearching, filters, onOpen, onCategoryChange, onQueryChange, onClear }) => {
  const [draftQuery, setDraftQuery] = useState(filters.query);

  useEffect(() => {
    setDraftQuery(filters.query);
  }, [filters.query]);

  const categories = useMemo(() => {
    const counts = new Map();
    catalog.forEach((post) => {
      const category = String(post.category || 'Szakmai cikk').trim();
      counts.set(category, (counts.get(category) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((first, second) => first.name.localeCompare(second.name, 'hu'));
  }, [catalog]);

  const categoryPosts = useMemo(() => {
    const scopedPosts = filters.category === ALL_CATEGORIES
      ? catalog
      : catalog.filter((post) => post.category === filters.category);
    return sortByNewest(scopedPosts);
  }, [catalog, filters.category]);

  const hasArchiveFilter = Boolean(filters.query || filters.category !== ALL_CATEGORIES);
  const visiblePosts = filters.query ? posts : categoryPosts;
  const featuredPost = hasArchiveFilter ? null : visiblePosts[0];
  const remainingPosts = featuredPost ? visiblePosts.slice(1) : visiblePosts;
  const isPendingSearch = Boolean(filters.query) && isSearching && posts.length === 0;

  return (
    <>
      <CyberSEO
        title="Blog – mérnöki automatizálás és AI"
        description="Gyakorlati cikkek és esettanulmányok a mérnöki folyamatautomatizálásról, AI-ról és rendszerintegrációról."
      />
      <main className="min-h-screen bg-[var(--bg-main)] pb-20 pt-28 text-[var(--text-main)] sm:pt-32">
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
          <div className="grid gap-8 border-b border-slate-300 pb-10 dark:border-white/10 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-end">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 border border-neonCyan/35 bg-neonCyan/5 px-3 py-1.5 font-mono text-[10px] font-black uppercase tracking-[0.16em] text-cyan-800 dark:text-neonCyan">
                <BookOpen size={13} aria-hidden="true" />
                Szakmai blog
              </div>
              <h1 className="max-w-4xl font-headline text-4xl font-black leading-[0.98] tracking-tight text-slate-950 dark:text-white sm:text-6xl">
                Érthető gondolatok a bonyolult rendszerekről.
              </h1>
              <p className="mt-5 max-w-2xl font-body text-base leading-relaxed text-slate-700 dark:text-slate-300 sm:text-lg">
                Mérnöki automatizálás, zárt AI és valós üzemi tanulságok – sallang nélkül, egy helyen.
              </p>
            </div>
            <div className="border-l-2 border-neonCyan/60 pl-4 font-mono">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Archívum</p>
              <p className="mt-1 text-3xl font-black text-slate-950 dark:text-white">{catalog.length}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-cyan-800 dark:text-neonCyan">publikus szakmai cikk</p>
            </div>
          </div>

          <section aria-label="Blog kereső és témák" className="border-b border-slate-300 py-6 dark:border-white/10">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <label className="relative block w-full max-w-xl">
                <span className="sr-only">Keresés a blogcikkekben</span>
                <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-cyan-800 dark:text-neonCyan" size={18} aria-hidden="true" />
                <input
                  value={draftQuery}
                  onChange={(event) => {
                    const nextQuery = event.target.value;
                    setDraftQuery(nextQuery);
                    onQueryChange(nextQuery);
                  }}
                  type="search"
                  placeholder="Keresés a cikkekben…"
                  data-testid="blog-search-input"
                  className="h-12 w-full border border-slate-400 bg-[var(--surface-panel)] pl-11 pr-11 font-body text-sm text-slate-950 placeholder:text-slate-500 dark:border-white/15 dark:text-white dark:placeholder:text-slate-500"
                />
                {draftQuery && (
                  <button
                    type="button"
                    onClick={() => onQueryChange('')}
                    aria-label="Keresés törlése"
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 transition-colors hover:text-cyan-800 dark:hover:text-neonCyan"
                  >
                    <X size={17} aria-hidden="true" />
                  </button>
                )}
              </label>
              <p aria-live="polite" className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {isSearching ? 'Keresés folyamatban…' : `${visiblePosts.length} találat`}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2" aria-label="Téma szerinti szűrés">
              <button
                type="button"
                onClick={() => onCategoryChange(ALL_CATEGORIES)}
                aria-pressed={filters.category === ALL_CATEGORIES}
                data-testid="blog-category-filter"
                data-category={ALL_CATEGORIES}
                className={`border px-3 py-2 font-mono text-[10px] font-black uppercase tracking-wide transition-colors ${
                  filters.category === ALL_CATEGORIES
                    ? 'border-neonCyan bg-neonCyan text-black'
                    : 'border-slate-400 text-slate-700 hover:border-cyan-800 hover:text-cyan-800 dark:border-white/15 dark:text-slate-300 dark:hover:border-neonCyan dark:hover:text-neonCyan'
                }`}
              >
                Összes <span className="opacity-70">({catalog.length})</span>
              </button>
              {categories.map(({ name, count }) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => onCategoryChange(name)}
                  aria-pressed={filters.category === name}
                  data-testid="blog-category-filter"
                  data-category={name}
                  className={`border px-3 py-2 font-mono text-[10px] font-black uppercase tracking-wide transition-colors ${
                    filters.category === name
                      ? 'border-neonCyan bg-neonCyan text-black'
                      : 'border-slate-400 text-slate-700 hover:border-cyan-800 hover:text-cyan-800 dark:border-white/15 dark:text-slate-300 dark:hover:border-neonCyan dark:hover:text-neonCyan'
                  }`}
                >
                  {formatCategory(name)} <span className="opacity-70">({count})</span>
                </button>
              ))}
            </div>
          </section>

          <section className="py-10 sm:py-14" aria-live="polite">
            {isLoading || isPendingSearch ? (
              <div className="grid gap-5 md:grid-cols-2">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="h-60 animate-pulse border border-slate-300 bg-[var(--surface-panel)] dark:border-white/10" />
                ))}
              </div>
            ) : visiblePosts.length > 0 ? (
              <AnimatePresence mode="popLayout" initial={false}>
                {featuredPost && (
                  <div key={`featured-${featuredPost.slug}`} className="mb-6">
                    <ArticleCard post={featuredPost} index={0} onOpen={onOpen} featured />
                  </div>
                )}
                <div key="article-grid" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {remainingPosts.map((post, index) => (
                    <ArticleCard key={post.id || post.slug} post={post} index={featuredPost ? index + 1 : index} onOpen={onOpen} />
                  ))}
                </div>
              </AnimatePresence>
            ) : (
              <div className="border border-dashed border-slate-400 bg-[var(--surface-panel)] px-6 py-16 text-center dark:border-white/20">
                <FileText className="mx-auto text-cyan-800 dark:text-neonCyan" size={28} aria-hidden="true" />
                <h2 className="mt-4 font-headline text-2xl font-black text-slate-950 dark:text-white">Nincs egyező cikk.</h2>
                <p className="mx-auto mt-2 max-w-md font-body text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                  Próbálj más keresőkifejezést, vagy állítsd vissza a témaszűrőt.
                </p>
                <button
                  type="button"
                  onClick={onClear}
                  className="mt-6 border border-neonCyan bg-neonCyan px-4 py-2.5 font-mono text-[10px] font-black uppercase tracking-wide text-black transition-colors hover:bg-white"
                >
                  Szűrők törlése
                </button>
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
};

const BlogArticle = ({ post, status, onBack }) => {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  if (status === 'loading') {
    return (
      <main className="min-h-screen bg-[var(--bg-main)] pb-20 pt-28">
        <div className="mx-auto max-w-3xl animate-pulse px-5 sm:px-8">
          <div className="h-4 w-32 bg-slate-300 dark:bg-white/10" />
          <div className="mt-8 h-16 w-4/5 bg-slate-300 dark:bg-white/10" />
          <div className="mt-6 h-6 w-full bg-slate-300 dark:bg-white/10" />
        </div>
      </main>
    );
  }

  if (!post) {
    return (
      <main className="min-h-screen bg-[var(--bg-main)] pb-20 pt-28 text-[var(--text-main)]">
        <div className="mx-auto max-w-3xl px-5 text-center sm:px-8">
          <FileText className="mx-auto text-neonMagenta" size={34} aria-hidden="true" />
          <h1 className="mt-5 font-headline text-3xl font-black text-slate-950 dark:text-white">A cikk nem érhető el.</h1>
          <p className="mt-3 font-body text-slate-700 dark:text-slate-300">Lehet, hogy az anyag már nem publikus vagy más címen található.</p>
          <button type="button" onClick={onBack} className="mt-7 inline-flex items-center gap-2 border border-neonCyan px-4 py-2.5 font-mono text-[10px] font-black uppercase tracking-wide text-cyan-800 dark:text-neonCyan">
            <ArrowLeft size={14} aria-hidden="true" /> Vissza a bloghoz
          </button>
        </div>
      </main>
    );
  }

  return (
    <>
      <CyberSEO
        title={post.title}
        description={post.summary || post.title}
        type="article"
        structuredData={articleStructuredData(post)}
      />
      <main className="min-h-screen bg-[var(--bg-main)] pb-20 pt-28 text-[var(--text-main)] sm:pt-32">
        <article className="mx-auto max-w-3xl px-5 sm:px-8">
          <div className="flex items-center justify-between gap-4 border-b border-slate-300 pb-5 dark:border-white/10">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 font-mono text-[10px] font-black uppercase tracking-wide text-slate-600 transition-colors hover:text-cyan-800 dark:text-slate-300 dark:hover:text-neonCyan"
            >
              <ArrowLeft size={15} aria-hidden="true" /> Blog
            </button>
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-2 border border-slate-400 px-2.5 py-1.5 font-mono text-[9px] font-black uppercase tracking-wide text-slate-700 transition-colors hover:border-neonCyan hover:text-cyan-800 dark:border-white/15 dark:text-slate-300 dark:hover:text-neonCyan"
            >
              {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
              {copied ? 'Link kimásolva' : 'Megosztás'}
            </button>
          </div>

          <header className="border-b border-slate-300 py-10 dark:border-white/10 sm:py-14">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <span className="border border-neonCyan/40 bg-neonCyan/10 px-2 py-1 font-mono text-[9px] font-black uppercase tracking-[0.14em] text-cyan-800 dark:text-neonCyan">
                {formatCategory(post.category)}
              </span>
              <ReadingMeta post={post} />
            </div>
            <h1 className="font-headline text-4xl font-black leading-[1.01] tracking-tight text-slate-950 dark:text-white sm:text-6xl">
              {post.title}
            </h1>
            {post.summary && (
              <p className="mt-6 max-w-2xl font-body text-lg leading-relaxed text-slate-700 dark:text-slate-300 sm:text-xl">
                {post.summary}
              </p>
            )}
          </header>

          <div className="py-10 sm:py-14">
            <MarkdownRenderer content={post.content || ''} />
          </div>

          <footer className="flex items-center justify-between gap-4 border-t border-slate-300 py-7 dark:border-white/10">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 font-mono text-[10px] font-black uppercase tracking-wide text-cyan-800 transition-colors hover:gap-3 dark:text-neonCyan"
            >
              <ArrowLeft size={14} aria-hidden="true" /> Összes cikk
            </button>
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="inline-flex items-center gap-2 font-mono text-[10px] font-black uppercase tracking-wide text-slate-600 transition-colors hover:text-cyan-800 dark:text-slate-300 dark:hover:text-neonCyan"
            >
              Tetejére <ChevronRight size={14} aria-hidden="true" />
            </button>
          </footer>
        </article>
      </main>
    </>
  );
};

/**
 * A Blog is intentionally a reading-first editorial surface. It uses the
 * canonical document API, filtered to the `article` presentation profile.
 */
const BlogPage = () => {
  const { '*': rawSlug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { viewerFetch } = useAdminPreview();
  const [catalog, setCatalog] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [article, setArticle] = useState(null);
  const [articleStatus, setArticleStatus] = useState('idle');

  const filters = useMemo(() => readFilters(location.search), [location.search]);
  const slug = normalizeSlug(rawSlug);

  const updateFilters = useCallback((updates) => {
    const next = new URLSearchParams(location.search);
    const nextQuery = updates.query ?? filters.query;
    const nextCategory = updates.category ?? filters.category;

    if (nextQuery.trim()) next.set('q', nextQuery.trim());
    else next.delete('q');
    if (nextCategory && nextCategory !== ALL_CATEGORIES) next.set('category', nextCategory);
    else next.delete('category');

    const query = next.toString();
    navigate({ pathname: '/blog', search: query ? `?${query}` : '' }, { replace: true });
  }, [filters.category, filters.query, location.search, navigate]);

  const openPost = useCallback((post) => {
    navigate({ pathname: `/blog/${post.slug}`, search: location.search });
    window.scrollTo?.({ top: 0, behavior: 'smooth' });
  }, [location.search, navigate]);

  const closeArticle = useCallback(() => {
    navigate({ pathname: '/blog', search: location.search });
    window.scrollTo?.({ top: 0, behavior: 'smooth' });
  }, [location.search, navigate]);

  useEffect(() => {
    // A direct article link needs only its selected document. The archive is
    // loaded lazily when the reader returns to `/blog`.
    if (slug) {
      setIsLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    setIsLoading(true);

    viewerFetch('/api/documents?presentation_profile=article', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`BLOG_${response.status}`))))
      .then((payload) => {
        if (active) setCatalog(responseDocuments(payload));
      })
      .catch((error) => {
        if (error?.name !== 'AbortError' && active) setCatalog([]);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [slug, viewerFetch]);

  useEffect(() => {
    if (!filters.query) {
      setSearchResults([]);
      setIsSearching(false);
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    setSearchResults([]);
    setIsSearching(true);
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        q: filters.query,
        presentation_profile: 'article',
        limit: '250',
      });
      if (filters.category !== ALL_CATEGORIES) params.set('category', filters.category);

      viewerFetch(`/api/documents/search?${params.toString()}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`BLOG_SEARCH_${response.status}`))))
        .then((payload) => {
          if (active) setSearchResults(responseDocuments(payload));
        })
        .catch((error) => {
          if (error?.name !== 'AbortError' && active) setSearchResults([]);
        })
        .finally(() => {
          if (active) setIsSearching(false);
        });
    }, 220);

    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [filters.category, filters.query, viewerFetch]);

  useEffect(() => {
    if (!slug) {
      setArticle(null);
      setArticleStatus('idle');
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    setArticle(null);
    setArticleStatus('loading');

    viewerFetch(`/api/documents/${encodeURIComponent(slug)}?presentation_profile=article`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`BLOG_ARTICLE_${response.status}`))))
      .then((payload) => {
        if (!active) return;
        setArticle(payload);
        setArticleStatus('ready');
      })
      .catch((error) => {
        if (error?.name !== 'AbortError' && active) {
          setArticle(null);
          setArticleStatus('error');
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [slug, viewerFetch]);

  if (slug) {
    return <BlogArticle post={article} status={articleStatus} onBack={closeArticle} />;
  }

  return (
    <BlogArchive
      catalog={catalog}
      posts={filters.query ? searchResults : catalog}
      isLoading={isLoading}
      isSearching={isSearching}
      filters={filters}
      onOpen={openPost}
      onQueryChange={(query) => updateFilters({ query })}
      onCategoryChange={(category) => updateFilters({ category })}
      onClear={() => updateFilters({ query: '', category: ALL_CATEGORIES })}
    />
  );
};

export default BlogPage;
