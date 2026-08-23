// A document package is the same regardless of where it is rendered.  The
// historical `content_type` is only a compatibility projection for old APIs
// and routes; new UI code chooses its reader-facing view from this profile.

export const presentationProfileOf = (document = {}) => {
  const candidate = String(document.presentation_profile || '').trim().toLowerCase();
  if (candidate === 'article' || candidate === 'blog') return 'article';
  if (candidate === 'knowledge') return 'knowledge';
  return String(document.content_type || '').trim().toLowerCase() === 'blog'
    ? 'article'
    : 'knowledge';
};

export const legacyContentTypeForPresentationProfile = (profile) => (
  presentationProfileOf({ presentation_profile: profile }) === 'article' ? 'blog' : 'knowledge'
);

export const presentationProfileLabel = (profile) => (
  presentationProfileOf({ presentation_profile: profile }) === 'article'
    ? 'CIKK / ESETTANULMÁNY'
    : 'TUDÁSTÁR'
);
