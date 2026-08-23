import React from 'react';
import { TAXONOMY_ICON_COMPONENTS, normalizeTaxonomyIconKey } from '../../utils/taxonomyIcons.js';

export const TaxonomyIcon = ({ iconKey, fallback = 'tag', ...props }) => {
  const Icon = TAXONOMY_ICON_COMPONENTS[normalizeTaxonomyIconKey(iconKey, fallback)];
  return <Icon {...props} />;
};

export default TaxonomyIcon;
