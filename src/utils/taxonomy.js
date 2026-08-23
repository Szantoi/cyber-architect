// Pure taxonomy helpers live outside the React refresh boundary so they can be
// shared by the vault UI and focused unit tests without reloading components.
export const getMultiCategoriesForDoc = (item) => {
  if (!item) return ['Általános'];
  const categories = new Set();

  if (item.category) {
    item.category.split(',').forEach((category) => {
      const trimmed = category.trim();
      if (trimmed && !trimmed.startsWith('0')) categories.add(trimmed);
    });
  }

  const corpus = `${item.title || ''} ${item.slug || ''} ${item.summary || ''} ${item.category || ''} ${JSON.stringify(item.dimensions || {})}`.toLowerCase();

  if (/rag|ai|llm|vektor|embedding|hibrid|tudast/i.test(corpus)) {
    categories.add('AI & RAG RENDSZEREK');
  }
  if (/adatbiztonsag|biztonsag|titok|gdpr|air-gap|zart/i.test(corpus)) {
    categories.add('ADATBIZTONSÁG & GDPR');
  }
  if (/cad|autocad|dxf|dwg|mernok|cnc/i.test(corpus)) {
    categories.add('MÉRNÖKI & CAD/CAM');
  }
  if (/automatiz|excel|python|integracio|folyamat|\.net|csharp|c#/i.test(corpus)) {
    categories.add('KÓD-ALAPÚ AUTOMATIZÁLÁS');
  }
  if (/esettanulmany|bevezetes|eset|tapasztalat|0%|megvalositas/i.test(corpus)) {
    categories.add('ESETTANULMÁNYOK');
  }
  if (/specifikacio|architektura|rendszerterv|fts5|api/i.test(corpus)) {
    categories.add('ARCHITEKTÚRA & SPECIFIKÁCIÓ');
  }

  if (categories.size === 0) {
    categories.add(item.category || 'Általános');
  }

  return Array.from(categories);
};

const DRIVE_ROOT_DISPLAY_NAMES = {
  'zart-vallalati-rag': 'ZÁRT VÁLLALATI RAG',
  'ai-es-adatbiztonsag': 'AI ÉS ADATBIZTONSÁG',
  'cad-automatizacio': 'CAD AUTOMATIZÁCIÓ',
  'folyamatoptimalizalas-es-excel': 'FOLYAMATOPTIMALIZÁLÁS ÉS EXCEL',
  'belso-kutatasok-privat': 'BELSŐ KUTATÁSOK · PRIVÁT'
};

const canonicalizeDriveSegment = (value) => String(value || '')
  .normalize('NFC')
  .trim()
  .toLocaleLowerCase('hu-HU')
  .replace(/[_\s]+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^\d+-/, '');

const getDriveRootFolder = (item) => {
  const rawPath = String(item?.drive_path || item?.drive_folder || '').trim();
  if (!rawPath) return '';

  const segments = rawPath
    .normalize('NFC')
    .split(/[\\/]+/)
    .map(segment => segment.trim())
    .filter(Boolean);
  const rootSegment = segments.find(segment => !/^(content|knowledge|knowledgebase|blog)$/i.test(segment));
  if (!rootSegment) return '';

  const canonicalSegment = canonicalizeDriveSegment(rootSegment);
  if (DRIVE_ROOT_DISPLAY_NAMES[canonicalSegment]) {
    return DRIVE_ROOT_DISPLAY_NAMES[canonicalSegment];
  }

  return rootSegment
    .replace(/^\d+[_\-\s]*/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleUpperCase('hu-HU');
};

export const getTreeFolders = (item, pivotMode = 'drive') => {
  if (!item) return ['Általános'];

  if (pivotMode === 'drive') {
    // The Markdown package path is the canonical placement. `folder_path`
    // remains a read-only compatibility projection for records predating the
    // Vault-first model, so it is used only when no Vault source is known.
    const vaultCollection = getDriveRootFolder(item);
    if (vaultCollection) return [vaultCollection];

    const folderPath = String(item.folder_path || '').trim();
    if (folderPath) return [folderPath];

    return [(item.category || 'Általános').split(',')[0].trim()];
  }
  if (pivotMode === 'topic') {
    return getMultiCategoriesForDoc(item);
  }
  if (pivotMode === 'industry') {
    if (Array.isArray(item.dimensions?.iparag) && item.dimensions.iparag.length > 0) {
      return item.dimensions.iparag;
    }
    return ['Általános Iparág'];
  }
  if (pivotMode === 'tech') {
    if (Array.isArray(item.dimensions?.technologia) && item.dimensions.technologia.length > 0) {
      return item.dimensions.technologia;
    }
    return ['Kód & Algoritmusok'];
  }
  return ['Általános'];
};
