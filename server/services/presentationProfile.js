// server/services/presentationProfile.js
//
// A canonical document has one content schema.  Its presentation profile only
// selects a reader-facing view; it must never be inferred as a hard semantic
// document type from the folder in which the Markdown file happens to live.

const PROFILE_ALIASES = Object.freeze({
  knowledge: 'knowledge',
  article: 'article',
  // `blog` remains a supported authoring alias while the canonical name makes
  // its display-only role explicit.
  blog: 'article'
});

const LEGACY_CONTENT_TYPE_BY_PROFILE = Object.freeze({
  knowledge: 'knowledge',
  article: 'blog'
});

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function invalidProfile() {
  const error = new Error('INVALID_PRESENTATION_PROFILE: Expected knowledge or article.');
  error.code = 'INVALID_PRESENTATION_PROFILE';
  return error;
}

function invalidContentType() {
  const error = new Error('INVALID_CONTENT_TYPE: Expected blog or knowledge.');
  error.code = 'INVALID_CONTENT_TYPE';
  return error;
}

/**
 * Normalize the frontmatter-facing profile. `blog` is intentionally an alias
 * for the canonical `article` profile so new notes do not encode a separate
 * semantic content model just because the web portal renders them as a blog.
 */
export function normalizePresentationProfile(value) {
  const normalized = String(value || '').trim().toLowerCase();
  const profile = PROFILE_ALIASES[normalized];
  if (!profile) throw invalidProfile();
  return profile;
}

export function presentationProfileFromContentType(value) {
  const contentType = String(value || '').trim().toLowerCase();
  if (contentType === 'knowledge') return 'knowledge';
  if (contentType === 'blog') return 'article';
  throw invalidContentType();
}

export function contentTypeFromPresentationProfile(value) {
  return LEGACY_CONTENT_TYPE_BY_PROFILE[normalizePresentationProfile(value)];
}

/**
 * Resolve the canonical profile and the legacy portal projection together.
 * A document may provide either field. If it supplies both, they must describe
 * the same presentation intent; otherwise synchronization fails before DB
 * writes rather than quietly creating a split interpretation.
 */
export function resolveDocumentPresentation({
  presentationProfile,
  contentType,
  fallbackProfile = 'knowledge'
} = {}) {
  const hasPresentationProfile = hasValue(presentationProfile);
  const hasContentType = hasValue(contentType);
  const fallback = normalizePresentationProfile(fallbackProfile);
  const profile = hasPresentationProfile
    ? normalizePresentationProfile(presentationProfile)
    : (hasContentType ? presentationProfileFromContentType(contentType) : fallback);

  if (hasPresentationProfile && hasContentType) {
    const projectedFromLegacyType = presentationProfileFromContentType(contentType);
    if (projectedFromLegacyType !== profile) {
      const error = new Error('PRESENTATION_PROFILE_CONTENT_TYPE_CONFLICT');
      error.code = 'PRESENTATION_PROFILE_CONTENT_TYPE_CONFLICT';
      error.details = {
        presentation_profile: profile,
        content_type: String(contentType).trim().toLowerCase()
      };
      throw error;
    }
  }

  return {
    presentation_profile: profile,
    // Compatibility projection for current routes, clients, FTS and MCP
    // filters. New code should prefer presentation_profile.
    content_type: LEGACY_CONTENT_TYPE_BY_PROFILE[profile]
  };
}
