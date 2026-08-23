// server/services/embeddingService.js
// Dense Semantic Vectorizer & Cosine Similarity Engine for Cyber-Architect RAG

/**
 * Hungarian & English Stopwords for high-accuracy semantic vectorization
 */
const STOPWORDS = new Set([
  'a', 'az', 'egy', 'és', 'hogy', 'nem', 'van', 'volt', 'lesz', 'vagy', 'mint',
  'is', 'csak', 'mert', 'ha', 'de', 'már', 'még', 'kell', 'után', 'alatt',
  'felett', 'között', 'nélkül', 'miatt', 'által', 'szerint', 'lehet', 'meg',
  'the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'in', 'to', 'for', 'of',
  'with', 'as', 'by', 'this', 'that', 'it', 'from', 'are', 'be', 'or'
]);

/**
 * Tokenize and normalize text into semantic n-grams and stemmed stems
 */
function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove Hungarian accents for robust matching
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Hash a term to a specific vector dimension (Feature Hashing Trick)
 * Yields a dense, deterministic semantic embedding vector
 */
function hashTerm(term, vectorSize) {
  let hash = 5381;
  for (let i = 0; i < term.length; i++) {
    hash = ((hash << 5) + hash) + term.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash) % vectorSize;
}

const embeddingService = {
  VECTOR_SIZE: 128,

  /**
   * Generate a dense, normalized semantic embedding vector from text
   * @param {string} text - Title, summary, content or query
   * @returns {number[]} - Normalized 128-dimensional dense float vector
   */
  generateEmbedding(text) {
    const vector = new Array(this.VECTOR_SIZE).fill(0);
    const tokens = tokenize(text);

    if (tokens.length === 0) return vector;

    // 1. Term Frequencies (TF) with positional & title weighting
    const tf = {};
    tokens.forEach((token, index) => {
      // Give higher weight to early tokens (titles, summaries)
      const weight = index < 10 ? 2.5 : 1.0;
      tf[token] = (tf[token] || 0) + weight;
    });

    // 2. Bigrams for contextual semantics (e.g., "zart rag", "dwg csharp")
    for (let i = 0; i < tokens.length - 1; i++) {
      const bigram = `${tokens[i]}_${tokens[i + 1]}`;
      tf[bigram] = (tf[bigram] || 0) + 1.8;
    }

    // 3. Project into fixed-size dense embedding space via Feature Hashing
    for (const [term, freq] of Object.entries(tf)) {
      const idx = hashTerm(term, this.VECTOR_SIZE);
      const sign = (hashTerm(term + '_sign', 2) === 0 ? 1 : -1);
      vector[idx] += sign * Math.log(1 + freq);
    }

    // 4. L2-Normalize vector to unit length for fast Cosine Similarity
    let norm = 0;
    for (let i = 0; i < this.VECTOR_SIZE; i++) {
      norm += vector[i] * vector[i];
    }
    norm = Math.sqrt(norm);

    if (norm > 0) {
      for (let i = 0; i < this.VECTOR_SIZE; i++) {
        vector[i] = Number((vector[i] / norm).toFixed(6));
      }
    }

    return vector;
  },

  /**
   * Calculate Cosine Similarity between two normalized vectors
   * @param {number[]} vecA - Document vector
   * @param {number[]} vecB - Query vector
   * @returns {number} - Cosine similarity score between -1.0 and 1.0 (typically 0.0 to 1.0)
   */
  cosineSimilarity(vecA, vecB) {
    if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length === 0 || vecB.length === 0) {
      return 0;
    }
    const len = Math.min(vecA.length, vecB.length);
    let dotProduct = 0;
    for (let i = 0; i < len; i++) {
      dotProduct += vecA[i] * vecB[i];
    }
    // Clamp to [0, 1] range for intuitive ranking
    return Math.max(0, Math.min(1, dotProduct));
  },

  /**
   * Build Full Document Semantic Representation
   */
  generateDocumentEmbedding(doc, tuning = {}) {
    const title = doc.title || '';
    const summary = doc.summary || '';
    const category = doc.category || '';
    const resolvePositiveInteger = (value, fallback) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric) : fallback;
    };
    const titleWeight = resolvePositiveInteger(tuning.embedding_title_weight, 2);
    const summaryWeight = resolvePositiveInteger(tuning.embedding_summary_weight, 2);
    const contentCharLimit = resolvePositiveInteger(tuning.embedding_content_char_limit, 3000);
    const content = (doc.content || '').slice(0, contentCharLimit);
    const dims = typeof doc.dimensions === 'string' ? doc.dimensions : JSON.stringify(doc.dimensions || {});
    const repeatForWeight = (text, weight) => Array.from({ length: weight }, () => text).join(' ');

    // Weighted composite text: title and summary multipliers are configurable.
    const compositeText = [
      repeatForWeight(title, titleWeight),
      repeatForWeight(summary, summaryWeight),
      category,
      dims,
      content
    ].join(' ');
    return this.generateEmbedding(compositeText);
  }
};

export default embeddingService;
