/**
 * Spotify — Integration Service Module
 *
 * Extends the client-side useSpotify hook with server-side capabilities:
 *   - Playlist fetching (user playlists, recently played, featured/driving mixes)
 *   - AI Playlist Generator (takes mood/route/time-of-day → curated recommendations)
 *   - Spotify search (tracks, albums, playlists)
 *
 * Client-side OAuth flow and playback control is handled by:
 *   - lib/spotify.ts — token management
 *   - hooks/useSpotify.ts — player state polling and controls
 *   - api/spotify/callback & api/spotify/refresh — server-side token exchange
 */

import { logger } from '@/lib/logger'

// ── Types ────────────────────────────────────────────────────────────────────

export interface SpotifyPlaylist {
  id: string
  name: string
  description: string
  imageUrl: string | null
  ownerName: string
  trackCount: number
  public: boolean
  snapshotId: string
  uri: string
  /** External URL to open in Spotify app */
  externalUrl: string
}

export interface SpotifyTrack {
  id: string
  name: string
  artistName: string
  albumName: string
  albumArt: string | null
  durationMs: number
  uri: string
  explicit: boolean
  popularity: number
  previewUrl: string | null
}

export interface RecentlyPlayed {
  track: SpotifyTrack
  playedAt: string
  context: { type: string; uri: string } | null
}

export type PlaylistMood = 'energetic' | 'focused' | 'relaxed' | 'night_drive' | 'coffee_break' | 'long_haul' | 'custom'

export interface AIPlaylistRequest {
  mood: PlaylistMood
  /** Optional custom mood description for 'custom' mood */
  customMood?: string
  /** Route info for context (e.g., "Chicago to Atlanta via I-65") */
  routeContext?: string
  /** Time of day: 'morning' | 'afternoon' | 'evening' | 'night' */
  timeOfDay?: string
  /** Approximate trip duration in hours */
  tripDurationHrs?: number
  /** Optional genre/category preference */
  genre?: string
}

export interface AIPlaylistResponse {
  name: string
  description: string
  tracks: SpotifyTrack[]
  explanation: string
}

// ── Constants ────────────────────────────────────────────────────────────────

const SPOTIFY_API = 'https://api.spotify.com/v1'

const DRIVING_PLAYLIST_QUERIES: Record<PlaylistMood, string> = {
  energetic: 'driving energetic road trip party',
  focused: 'focus driving instrumental',
  relaxed: 'chill driving road trip',
  night_drive: 'night driving synthwave',
  coffee_break: 'morning coffee acoustic',
  long_haul: 'long drive country rock',
  custom: '',
}

// ── Auth helpers ─────────────────────────────────────────────────────────────

function getAccessToken(): string {
  // In server context, we need to get token from the request or session.
  // This is a utility for API routes that receive the token.
  return ''
}

/**
 * Fetch wrapper for Spotify API with auth header.
 */
async function spotifyFetch<T>(
  path: string,
  accessToken: string,
  options: RequestInit = {},
): Promise<T | null> {
  try {
    const res = await fetch(`${SPOTIFY_API}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
    })

    if (!res.ok) {
      if (res.status === 401) {
        logger.warn('[Spotify] Token expired — caller should refresh')
      } else if (res.status === 403) {
        logger.warn('[Spotify] Premium required for this operation')
      } else {
        logger.error(`[Spotify] API error: ${res.status} for ${path}`)
      }
      return null
    }

    if (res.status === 204) return null
    return (await res.json()) as T
  } catch (err) {
    logger.error('[Spotify] Network error:', err)
    return null
  }
}

// ── Playlist fetching ────────────────────────────────────────────────────────

/**
 * Fetch current user's playlists.
 */
export async function getUserPlaylists(
  accessToken: string,
  limit = 20,
  offset = 0,
): Promise<SpotifyPlaylist[]> {
  const data = await spotifyFetch<{
    items: Array<{
      id: string
      name: string
      description: string
      images: Array<{ url: string }>
      owner: { display_name: string }
      tracks: { total: number }
      public: boolean
      snapshot_id: string
      uri: string
      external_urls: { spotify: string }
    }>
  }>(`/me/playlists?limit=${limit}&offset=${offset}`, accessToken)

  if (!data?.items) return []

  return data.items.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description ?? '',
    imageUrl: p.images?.[0]?.url ?? null,
    ownerName: p.owner?.display_name ?? 'Unknown',
    trackCount: p.tracks?.total ?? 0,
    public: p.public,
    snapshotId: p.snapshot_id,
    uri: p.uri,
    externalUrl: p.external_urls?.spotify ?? '',
  }))
}

/**
 * Fetch tracks from a specific playlist.
 */
export async function getPlaylistTracks(
  accessToken: string,
  playlistId: string,
  limit = 50,
): Promise<SpotifyTrack[]> {
  const data = await spotifyFetch<{
    items: Array<{
      track: {
        id: string
        name: string
        artists: Array<{ name: string }>
        album: { name: string; images: Array<{ url: string }> }
        duration_ms: number
        uri: string
        explicit: boolean
        popularity: number
        preview_url: string | null
      } | null
    }>
  }>(`/playlists/${playlistId}/tracks?limit=${limit}`, accessToken)

  if (!data?.items) return []

  return data.items
    .filter(item => item.track != null)
    .map(item => {
      const t = item.track!
      return {
        id: t.id,
        name: t.name,
        artistName: t.artists?.map(a => a.name).join(', ') ?? '',
        albumName: t.album?.name ?? '',
        albumArt: t.album?.images?.[0]?.url ?? null,
        durationMs: t.duration_ms,
        uri: t.uri,
        explicit: t.explicit,
        popularity: t.popularity,
        previewUrl: t.preview_url,
      }
    })
}

/**
 * Fetch recently played tracks.
 */
export async function getRecentlyPlayed(
  accessToken: string,
  limit = 20,
): Promise<RecentlyPlayed[]> {
  const data = await spotifyFetch<{
    items: Array<{
      track: {
        id: string
        name: string
        artists: Array<{ name: string }>
        album: { name: string; images: Array<{ url: string }> }
        duration_ms: number
        uri: string
        explicit: boolean
        popularity: number
        preview_url: string | null
      }
      played_at: string
      context: { type: string; uri: string } | null
    }>
  }>(`/me/player/recently-played?limit=${limit}`, accessToken)

  if (!data?.items) return []

  return data.items.map(item => ({
    track: {
      id: item.track.id,
      name: item.track.name,
      artistName: item.track.artists?.map(a => a.name).join(', ') ?? '',
      albumName: item.track.album?.name ?? '',
      albumArt: item.track.album?.images?.[0]?.url ?? null,
      durationMs: item.track.duration_ms,
      uri: item.track.uri,
      explicit: item.track.explicit,
      popularity: item.track.popularity,
      previewUrl: item.track.preview_url,
    },
    playedAt: item.played_at,
    context: item.context,
  }))
}

/**
 * Fetch featured playlists / driving mixes from Spotify.
 */
export async function getFeaturedPlaylists(accessToken: string): Promise<SpotifyPlaylist[]> {
  const data = await spotifyFetch<{
    playlists: {
      items: Array<{
        id: string
        name: string
        description: string
        images: Array<{ url: string }>
        owner: { display_name: string }
        tracks: { total: number }
        public: boolean
        snapshot_id: string
        uri: string
        external_urls: { spotify: string }
      }>
    }
  }>('/browse/featured-playlists', accessToken)

  if (!data?.playlists?.items) return []

  return data.playlists.items.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description ?? '',
    imageUrl: p.images?.[0]?.url ?? null,
    ownerName: p.owner?.display_name ?? 'Spotify',
    trackCount: p.tracks?.total ?? 0,
    public: p.public,
    snapshotId: p.snapshot_id,
    uri: p.uri,
    externalUrl: p.external_urls?.spotify ?? '',
  }))
}

// ── Search ────────────────────────────────────────────────────────────────────

/**
 * Search for tracks on Spotify.
 */
export async function searchTracks(
  accessToken: string,
  query: string,
  limit = 10,
): Promise<SpotifyTrack[]> {
  const data = await spotifyFetch<{
    tracks: {
      items: Array<{
        id: string
        name: string
        artists: Array<{ name: string }>
        album: { name: string; images: Array<{ url: string }> }
        duration_ms: number
        uri: string
        explicit: boolean
        popularity: number
        preview_url: string | null
      }>
    }
  }>(
    `/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`,
    accessToken,
  )

  if (!data?.tracks?.items) return []

  return data.tracks.items.map(t => ({
    id: t.id,
    name: t.name,
    artistName: t.artists?.map(a => a.name).join(', ') ?? '',
    albumName: t.album?.name ?? '',
    albumArt: t.album?.images?.[0]?.url ?? null,
    durationMs: t.duration_ms,
    uri: t.uri,
    explicit: t.explicit,
    popularity: t.popularity,
    previewUrl: t.preview_url,
  }))
}

/**
 * Search for playlists on Spotify.
 */
export async function searchPlaylists(
  accessToken: string,
  query: string,
  limit = 10,
): Promise<SpotifyPlaylist[]> {
  const data = await spotifyFetch<{
    playlists: {
      items: Array<{
        id: string
        name: string
        description: string
        images: Array<{ url: string }>
        owner: { display_name: string }
        tracks: { total: number }
        public: boolean
        snapshot_id: string
        uri: string
        external_urls: { spotify: string }
      }>
    }
  }>(
    `/search?q=${encodeURIComponent(query)}&type=playlist&limit=${limit}`,
    accessToken,
  )

  if (!data?.playlists?.items) return []

  return data.playlists.items.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description ?? '',
    imageUrl: p.images?.[0]?.url ?? null,
    ownerName: p.owner?.display_name ?? 'Spotify',
    trackCount: p.tracks?.total ?? 0,
    public: p.public,
    snapshotId: p.snapshot_id,
    uri: p.uri,
    externalUrl: p.external_urls?.spotify ?? '',
  }))
}

// ── AI Playlist Generator ────────────────────────────────────────────────────

/**
 * Generate a contextual playlist using AI + Spotify search.
 *
 * Takes mood, route context, time of day, and trip duration and returns
 * a curated playlist. Uses the Spotify search API with curated query terms
 * and optionally the Anthropic/OpenAI API for more sophisticated generation.
 *
 * This function should be called from a server API route.
 */
export async function generateAIPlaylist(
  request: AIPlaylistRequest,
  accessToken: string,
): Promise<AIPlaylistResponse> {
  const { mood, customMood, routeContext, timeOfDay, tripDurationHrs, genre } = request

  // Build search query based on mood + context
  let searchQuery = ''

  if (mood === 'custom' && customMood) {
    searchQuery = customMood
  } else {
    const baseQuery = DRIVING_PLAYLIST_QUERIES[mood] ?? 'driving music'
    const timeContext = timeOfDay ? ` ${timeOfDay}` : ''
    const genreContext = genre ? ` ${genre}` : ''
    searchQuery = `${baseQuery}${timeContext}${genreContext}`
  }

  // Search for tracks that match the mood
  const tracks = await searchTracks(accessToken, searchQuery, 20)

  // If we have Anthropic API key, use AI to curate the playlist
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (anthropicKey && tracks.length > 0 && mood !== 'custom') {
    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      const client = new Anthropic({ apiKey: anthropicKey })

      const trackList = tracks
        .map(t => `"${t.name}" by ${t.artistName}`)
        .join('\n')

      const prompt = `You're creating a driving playlist for a truck driver.

Mood: ${mood}
Route: ${routeContext ?? 'Not specified'}
Time of day: ${timeOfDay ?? 'Not specified'}
Trip duration: ${tripDurationHrs ? `${tripDurationHrs} hours` : 'Not specified'}

Available tracks to choose from:
${trackList}

Select 10-15 tracks that best fit this driving scenario. Return ONLY a JSON object:
{
  "name": "Playlist name",
  "description": "Short description (max 2 sentences)",
  "trackIndices": [0, 3, 5, ...] (indices into the list above, 0-based),
  "explanation": "Brief explanation of why these tracks were chosen"
}`

      const message = await client.messages.create({
        model: 'claude-opus-4-7',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      })

      const text = message.content
        .filter(b => b.type === 'text')
        .map(b => (b as { type: 'text'; text: string }).text)
        .join('')
        .trim()

      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
      const curated = JSON.parse(cleaned)

      const selectedTracks = (curated.trackIndices as number[])
        .filter((i: number) => i >= 0 && i < tracks.length)
        .map((i: number) => tracks[i])

      if (selectedTracks.length > 0) {
        return {
          name: curated.name ?? `${mood} Drive Mix`,
          description: curated.description ?? `Perfect for ${mood} driving`,
          tracks: selectedTracks,
          explanation: curated.explanation ?? 'AI-curated from your available music',
        }
      }
    } catch (err) {
      logger.warn('[Spotify] AI playlist curation failed, using direct search results:', err)
    }
  }

  // Fallback: return all search results as the playlist
  return {
    name: `${mood.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())} Drive Mix`,
    description: routeContext
      ? `Tracks for your drive${routeContext ? ` from ${routeContext}` : ''}`
      : 'AI-generated driving playlist',
    tracks: tracks.slice(0, 15),
    explanation: 'Curated from Spotify search based on your mood',
  }
}