import { describe, expect, it } from 'vitest';
import {
  legacyContentTypeForPresentationProfile,
  presentationProfileLabel,
  presentationProfileOf
} from '../utils/presentationProfile.js';

describe('presentation profile UI adapter', () => {
  it('prefers the explicit profile and maps legacy blog data compatibly', () => {
    expect(presentationProfileOf({ presentation_profile: 'article', content_type: 'knowledge' })).toBe('article');
    expect(presentationProfileOf({ content_type: 'blog' })).toBe('article');
    expect(presentationProfileOf({ content_type: 'knowledge' })).toBe('knowledge');
  });

  it('keeps legacy route projections and reader labels deterministic', () => {
    expect(legacyContentTypeForPresentationProfile('article')).toBe('blog');
    expect(legacyContentTypeForPresentationProfile('knowledge')).toBe('knowledge');
    expect(presentationProfileLabel('article')).toBe('CIKK / ESETTANULMÁNY');
  });
});
