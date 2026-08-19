// src/utils/semanticHighlighter.js
// Kétlépcsős Keresőszó & Szemantikai Mondat Elemző (Dual-Layer RAG Highlighter)

const STOPWORDS = new Set([
  'a', 'az', 'egy', 'és', 'hogy', 'nem', 'van', 'volt', 'lesz', 'vagy', 'mint',
  'is', 'csak', 'mert', 'ha', 'de', 'már', 'még', 'kell', 'után', 'alatt',
  'felett', 'között', 'nélkül', 'miatt', 'által', 'szerint', 'lehet', 'meg',
  'hogyan', 'mikent', 'miert', 'milyen', 'mikor', 'melyik', 'honnan', 'hova',
  'the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'in', 'to', 'for', 'of',
  'with', 'as', 'by', 'this', 'that', 'it', 'from', 'are', 'be', 'or', 'how', 'why', 'what'
]);

function normalizeStr(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .trim();
}

function getStem(word) {
  if (!word || word.length < 4) return word;
  // Egyszerűsített magyar toldaléktalanítás a leggyakoribb ragokra
  return word
    .replace(/(ot|at|et|ot|hoz|hez|hoz|val|vel|ban|ben|bol|bel|rol|rol|nak|nek|t|k|ba|be|ra|re|ig|ul|ul|as|es|os|hatom|hetem|hatjuk|hetjuk|unk|unk|tek|tok)$/, '')
    .trim() || word;
}

function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  const norm = normalizeStr(text);
  return norm
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(getStem);
}

function hashTerm(term, vectorSize) {
  let hash = 5381;
  for (let i = 0; i < term.length; i++) {
    hash = (hash << 5) + hash + term.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash) % vectorSize;
}

const VECTOR_SIZE = 128;

export function generateEmbedding(text) {
  const vector = new Array(VECTOR_SIZE).fill(0);
  const tokens = tokenize(text);
  if (tokens.length === 0) return vector;

  const tf = {};
  tokens.forEach((token) => {
    tf[token] = (tf[token] || 0) + 1.0;
  });

  for (let i = 0; i < tokens.length - 1; i++) {
    const bigram = `${tokens[i]}_${tokens[i + 1]}`;
    tf[bigram] = (tf[bigram] || 0) + 2.0;
  }

  for (const [term, freq] of Object.entries(tf)) {
    const idx = hashTerm(term, VECTOR_SIZE);
    const sign = hashTerm(term + '_sign', 2) === 0 ? 1 : -1;
    vector[idx] += sign * Math.log(1 + freq);
  }

  let norm = 0;
  for (let i = 0; i < VECTOR_SIZE; i++) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm);

  if (norm > 0) {
    for (let i = 0; i < VECTOR_SIZE; i++) {
      vector[i] = vector[i] / norm;
    }
  }

  return vector;
}

export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
  }
  return Math.max(0, Math.min(1.0, dotProduct));
}

/**
 * Szövegrészletek és mondatok elemzése:
 * Megállapítja a mondat/bekezdés szemantikai relevanciáját és a kulcsszavas egyezéseket
 */
export function analyzeSentenceRelevance(sentence, query) {
  if (!sentence || !query || query.trim().length < 2) {
    return { isSemanticMatch: false, semanticScore: 0, matchedKeywords: [] };
  }

  const normSentence = normalizeStr(sentence);
  const normQuery = normalizeStr(query);

  const queryVector = generateEmbedding(query);
  const sentenceVector = generateEmbedding(sentence);
  const cosScore = cosineSimilarity(sentenceVector, queryVector);

  const qWords = normQuery
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));

  const matchedKeywords = [];
  for (const w of qWords) {
    const stem = getStem(w);
    // Pontos egyezés vagy szótő egyezés (ha a szótő legalább 3 karakter)
    if (normSentence.includes(w) || (stem.length >= 3 && normSentence.includes(stem))) {
      matchedKeywords.push(w);
    }
  }

  // Kulcsszavas relevancia arány
  const keywordRatio = qWords.length > 0 ? (matchedKeywords.length / qWords.length) : 0;

  // Hibrid relevancia számítás (Vektor + Kulcsszó fúzió)
  const hybridScore = Math.min(1.0, (cosScore * 0.6) + (keywordRatio * 0.4));
  const semanticScore = Math.round(Math.max(cosScore, hybridScore) * 100);

  // Szemantikai egyezés, ha:
  // 1. A koszinusz hasonlóság >= 0.18
  // 2. Vagy a lényeges kulcsszavak legalább 35%-a megtalálható
  const isSemanticMatch = cosScore >= 0.18 || keywordRatio >= 0.35;

  return {
    isSemanticMatch,
    semanticScore: Math.max(semanticScore, Math.round(hybridScore * 100)),
    matchedKeywords
  };
}
