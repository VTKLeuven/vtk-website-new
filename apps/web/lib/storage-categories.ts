export type StorageFeatureDefinition = {
  id: string;
  prefix?: string;
  label: string;
  description: string;
};

/**
 * De gedeelde `images/`-prefix zegt op zichzelf niet welke feature een object
 * gebruikt. Deze categorieën worden daarom gekoppeld via de storage-key die in
 * de database staat. Alleen geaggregeerde aantallen en bytes verlaten de server.
 */
export const REFERENCED_STORAGE_FEATURES: readonly StorageFeatureDefinition[] = [
  {
    id: 'post-photos',
    label: 'Post photos',
    description: 'Photos shown for praesidium posts and working groups.',
  },
  {
    id: 'homepage-images',
    label: 'Homepage cards',
    description: 'Images on the homepage cards for VTK activities and services.',
  },
  {
    id: 'page-images',
    label: 'Page and navigation cards',
    description: 'Images linked to content pages and header navigation cards.',
  },
  {
    id: 'event-images',
    label: 'Event images',
    description: 'Artwork attached to calendar events.',
  },
  {
    id: 'form-images',
    label: 'Form question images',
    description: 'Illustrations embedded in form questions.',
  },
  {
    id: 'theokot-images',
    label: 'Theokot product photos',
    description: 'Photos for products and weekly offerings in Theokot.',
  },
  {
    id: 'shared-images',
    label: 'Images shared by features',
    description: 'Objects currently referenced by more than one application feature.',
  },
] as const;

/**
 * Prefixen worden bij upload gekozen en zijn daardoor de betrouwbaarste bron
 * voor de feature achter een object. Langere prefixen moeten vóór hun ouder
 * staan wanneer er later overlappende categorieën bijkomen.
 */
export const STORAGE_FEATURES: readonly StorageFeatureDefinition[] = [
  {
    id: 'expenses',
    prefix: 'bonnetjes/',
    label: 'Expense receipts',
    description: 'Receipts attached to reimbursement and bookkeeping submissions.',
  },
  {
    id: 'forms',
    prefix: 'forms/',
    label: 'Form submissions',
    description: 'Files uploaded by visitors through a form field.',
  },
  {
    id: 'rental-contracts',
    prefix: 'theokot/contracten/',
    label: 'Theokot rental contracts',
    description: 'PDF contract templates for Theokot rentals.',
  },
  {
    id: 'ticket-design',
    prefix: 'ticket-design/',
    label: 'Ticket artwork',
    description: 'Artwork and sponsor or event logos embedded in tickets.',
  },
  {
    id: 'avatars',
    prefix: 'avatars/',
    label: 'Profile photos',
    description: 'Uploaded member and POC profile photos.',
  },
  {
    id: 'publications',
    prefix: 'publications/',
    label: 'Magazines',
    description: "Uploaded issues of Het Bakske and Ir.Reëel on /media.",
  },
  {
    id: 'logistics',
    prefix: 'uitleen/',
    label: 'Logistics catalogue',
    description: 'Photos and downloadable documents for loanable materials.',
  },
  {
    id: 'dashboard',
    prefix: 'tiles/',
    label: 'Dashboard tile logos',
    description: 'Small custom icons for personal and shared dashboard tiles.',
  },
  {
    id: 'site-images',
    prefix: 'images/',
    label: 'Other website images',
    description: 'CMS images without a current structured database reference, including images embedded in Markdown.',
  },
  {
    id: 'logos',
    prefix: 'logos/',
    label: 'Partner and content logos',
    description: 'Partner logos and other transparent logos managed through the admin.',
  },
  {
    id: 'documents',
    prefix: 'pdfs/',
    label: 'CMS documents',
    description: 'PDF attachments uploaded through the page and content editors.',
  },
  {
    id: 'generic-files',
    prefix: 'files/',
    label: 'Generic CMS files',
    description: 'Non-image attachments uploaded through the generic admin uploader.',
  },
  {
    id: 'legacy-uploads',
    prefix: 'uploads/',
    label: 'Legacy uploads',
    description: 'Objects created before uploads received a feature-specific prefix.',
  },
  {
    id: 'legacy-gallery',
    prefix: 'photos/',
    label: 'Legacy photo gallery',
    description: 'Photos from the database-backed gallery that predates Immich.',
  },
  {
    id: 'legacy-thumbnails',
    prefix: 'thumbnails/',
    label: 'Legacy gallery thumbnails',
    description: 'Derived thumbnails from the database-backed gallery that predates Immich.',
  },
] as const;

export const UNKNOWN_STORAGE_FEATURE: StorageFeatureDefinition = {
  id: 'other',
  prefix: '',
  label: 'Other or unrecognised',
  description: 'Objects whose prefix is not owned by a currently known upload feature.',
};

const STORAGE_FEATURE_BY_ID = new Map(
  [...REFERENCED_STORAGE_FEATURES, ...STORAGE_FEATURES, UNKNOWN_STORAGE_FEATURE].map((feature) => [feature.id, feature]),
);

export function storageFeatureForKey(key: string, referencedFeatureId?: string): StorageFeatureDefinition {
  if (referencedFeatureId) {
    const referenced = STORAGE_FEATURE_BY_ID.get(referencedFeatureId);
    if (referenced) return referenced;
  }
  return STORAGE_FEATURES.find((feature) => feature.prefix && key.startsWith(feature.prefix)) ?? UNKNOWN_STORAGE_FEATURE;
}
