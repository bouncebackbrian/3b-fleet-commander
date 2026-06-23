/**
 * Integrations — Barrel Exports
 *
 * All external API integration service modules in one place.
 */

// ── Google Maps Platform ─────────────────────────────────────────────────────
export {
  // Types
  type GeocodeResult,
  type PlaceResult,
  type PlaceResult as TruckStop,
  type SearchOptions,
  type TruckPlaceType,
  type TruckRoute,
  type TruckRouteLeg,
  // Constants
  TRUCK_PLACE_TYPES,
  // Functions
  geocodeAddress,
  getOsrmRoute,
  getPlaceDetails,
  getTruckRoute,
  reverseGeocode,
  searchNearby,
  searchTruckStops,
} from './google-maps'

// ── Spotify ──────────────────────────────────────────────────────────────────
export {
  // Types
  type AIPlaylistRequest,
  type AIPlaylistResponse,
  type PlaylistMood,
  type RecentlyPlayed,
  type SpotifyPlaylist,
  type SpotifyTrack,
  // Functions
  generateAIPlaylist,
  getFeaturedPlaylists,
  getPlaylistTracks,
  getRecentlyPlayed,
  getUserPlaylists,
  searchPlaylists,
  searchTracks,
} from './spotify'

// ── AI Co-Pilot ──────────────────────────────────────────────────────────────
export {
  // Types
  type CoPilotContext,
  type CoPilotQuery,
  type CoPilotResponse,
  // Functions
  checkFuel,
  checkHOS,
  checkWeather,
  queryCoPilot,
} from './ai-co-pilot'

// ── OCR ──────────────────────────────────────────────────────────────────────
export {
  // Types
  type BOLData,
  type BOLStop,
  type ComplianceDocData,
  type FuelReceiptData,
  type OCRResult,
  // Functions
  detectDocumentType,
  isOCRConfigured,
  // Instances
  ocr,
} from './ocr'

// ── Emergency Services ───────────────────────────────────────────────────────
export {
  // Types
  type EmergencyEvent,
  type EmergencySeverity,
  type EmergencyType,
  // Functions
  getEmergencyKit,
  getRoadsidePhone,
  // Instances
  emergency,
} from './emergency'

// ── Trucker Helpers ──────────────────────────────────────────────────────────
export {
  // Types
  type DriverType,
  type FMCSARegulation,
  type HOSRules,
  type HOSStatus,
  type IFTAFuelEntry,
  type IFTAReport,
  // Constants
  FMCSA_REGULATIONS,
  HOS_REGULATIONS,
  // Functions
  calculateHOSStatus,
  calculateIFTA,
  canCompleteTrip,
  estimateDriveTime,
  estimateOnDutyTime,
  getStateFuelTax,
  searchRegulations,
} from './trucker-helpers'