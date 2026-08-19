import { useEffect } from 'react';

/**
 * CyberSEO Component
 * Handles dynamic page title, meta descriptions, OpenGraph, Twitter Cards,
 * and JSON-LD structured data injection without external dependencies.
 */
const CyberSEO = ({
  title = 'Szántói Gábor // Mérnöki Folyamatautomatizálás & AI Integráció',
  description = 'Mérnöki szemléletű folyamatfejlesztő és AI integrátor. Szigetrendszerek összekötése, manuális adminisztráció kiváltása és zárt belső AI megoldások.',
  type = 'website',
  url = typeof window !== 'undefined' ? window.location.href : 'https://szantoi.hu',
  image = 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=1000&auto=format&fit=crop',
  structuredData = null
}) => {
  useEffect(() => {
    // 1. Page Title
    const formattedTitle = title.includes('Szántói Gábor') ? title : `${title} | Szántói Gábor // AI`;
    document.title = formattedTitle;

    // Helper to create or update meta tags
    const setMetaTag = (attrName, attrValue, content) => {
      let element = document.querySelector(`meta[${attrName}="${attrValue}"]`);
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attrName, attrValue);
        document.head.appendChild(element);
      }
      element.setAttribute('content', content);
    };

    // 2. Standard Meta Tags
    setMetaTag('name', 'description', description);

    // 3. OpenGraph Tags
    setMetaTag('property', 'og:title', formattedTitle);
    setMetaTag('property', 'og:description', description);
    setMetaTag('property', 'og:type', type);
    setMetaTag('property', 'og:url', url);
    setMetaTag('property', 'og:image', image);

    // 4. Twitter Card Tags
    setMetaTag('name', 'twitter:card', 'summary_large_image');
    setMetaTag('name', 'twitter:title', formattedTitle);
    setMetaTag('name', 'twitter:description', description);
    setMetaTag('name', 'twitter:image', image);

    // 5. JSON-LD Structured Data
    const defaultStructuredData = {
      '@context': 'https://schema.org',
      '@type': type === 'article' ? 'TechArticle' : 'Person',
      'name': 'Szántói Gábor',
      'jobTitle': 'Mérnöki Folyamatfejlesztő & AI Integrátor',
      'url': url,
      'description': description
    };

    const schemaToInject = structuredData || defaultStructuredData;
    let jsonLdScript = document.getElementById('cyber-json-ld');
    if (!jsonLdScript) {
      jsonLdScript = document.createElement('script');
      jsonLdScript.id = 'cyber-json-ld';
      jsonLdScript.type = 'application/ld+json';
      document.head.appendChild(jsonLdScript);
    }
    jsonLdScript.textContent = JSON.stringify(schemaToInject);

    return () => {
      // Optional cleanup if unmounted
    };
  }, [title, description, type, url, image, structuredData]);

  return null;
};

export default CyberSEO;
