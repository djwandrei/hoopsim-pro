// Collector pages share the DJHC buyer-safe catalog and read-only verified
// mapping adapter. This module performs no writes.
export {
  attachProductListing,
  browseCards,
  createEligiblePackCard,
  findPlayerMatches,
  getCatalogSourceLabel,
  isNbaCatalogProduct,
  loadNbaCatalog,
  suggestPlayers,
  verifyProductMappings,
} from '@/lib/cards/siteCatalog';
