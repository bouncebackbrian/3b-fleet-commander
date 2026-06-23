// ============================================================
// Edge Function: spotify-playlist-generator
// Generates Spotify playlists based on driver's current context:
//   - Time of day (morning commute, night driving)
//   - Trip mood (long haul, short trip, tough conditions)
//   - Driver preference (genre, energy level)
//   - HOS status (alert vs tired)
//
// Called from: Music tab / AI co-pilot music requests
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

interface PlaylistRequest {
  userId: string
  spotifyToken?: string       // OAuth token from Spotify integration
  mood?: string               // 'energetic' | 'focused' | 'relaxed' | 'upbeat' | 'night_drive'
  genre?: string              // 'country' | 'rock' | 'hiphop' | 'electronic' | 'podcast' | 'audiobook'
  durationMinutes?: number    // Desired playlist length
  context?: {
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night'
    tripType?: 'short_haul' | 'long_haul' | 'local'
    weather?: 'clear' | 'rain' | 'snow' | 'fog'
    remainingHours?: number   // HOS remaining
  }
}

serve(async (req: Request) => {
  try {
    const { userId, spotifyToken, mood, genre, durationMinutes = 120, context }: PlaylistRequest = await req.json()

    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const spotifyClientId = Deno.env.get('SPOTIFY_CLIENT_ID')
    const spotifyClientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET')

    // ── Determine mood from context if not specified ─────────
    let effectiveMood = mood || 'upbeat'
    if (!mood && context) {
      if (context.timeOfDay === 'night' || context.timeOfDay === 'evening') {
        effectiveMood = 'focused'
      } else if (context.timeOfDay === 'morning') {
        effectiveMood = 'energetic'
      } else if (context.weather === 'rain' || context.weather === 'snow' || context.weather === 'fog') {
        effectiveMood = 'focused'
      } else if (context.tripType === 'long_haul') {
        effectiveMood = context.remainingHours && context.remainingHours < 2 ? 'energetic' : 'upbeat'
      }
    }

    // ── Spotify API token exchange ──────────────────────────
    let accessToken = spotifyToken
    if (!accessToken && spotifyClientId && spotifyClientSecret) {
      // Attempt client credentials flow (for public playlists)
      const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + btoa(`${spotifyClientId}:${spotifyClientSecret}`),
        },
        body: 'grant_type=client_credentials',
      })

      if (tokenResponse.ok) {
        const tokenData = await tokenResponse.json()
        accessToken = tokenData.access_token
      }
    }

    // ── Build seed parameters ───────────────────────────────
    const seedGenres = genre ? [genre] : getGenresForMood(effectiveMood)
    const targetAttributes = getTargetAttributes(effectiveMood)

    // ── Call Spotify Recommendations API ────────────────────
    let tracks: any[] = []

    if (accessToken) {
      const params = new URLSearchParams({
        seed_genres: seedGenres.join(','),
        limit: String(Math.min(Math.ceil(durationMinutes / 4), 50)),
        target_energy: String(targetAttributes.energy),
        target_tempo: String(targetAttributes.tempo),
        target_danceability: String(targetAttributes.danceability),
        target_acousticness: String(targetAttributes.acousticness),
        target_valence: String(targetAttributes.valence),
      })

      const recResponse = await fetch(
        `https://api.spotify.com/v1/recommendations?${params}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      )

      if (recResponse.ok) {
        const recData = await recResponse.json()
        tracks = recData.tracks.map((t: any) => ({
          id: t.id,
          name: t.name,
          artist: t.artists.map((a: any) => a.name).join(', '),
          album: t.album.name,
          albumArt: t.album.images?.[0]?.url,
          durationMs: t.duration_ms,
          previewUrl: t.preview_url,
          uri: t.uri,
        }))
      }
    }

    // ── Generate playlist name ──────────────────────────────
    const playlistName = generatePlaylistName(effectiveMood, context)

    // ── Return playlist ─────────────────────────────────────
    return new Response(JSON.stringify({
      success: true,
      playlist: {
        name: playlistName,
        tracks,
        trackCount: tracks.length,
        estimatedDurationMinutes: Math.round(tracks.reduce((sum: number, t: any) => sum + t.durationMs, 0) / 60000),
        mood: effectiveMood,
        genre: seedGenres[0],
      },
      recommendations: {
        seedGenres,
        targetAttributes,
      },
    }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Spotify playlist generator error:', error)
    return new Response(JSON.stringify({
      error: 'Failed to generate playlist',
      details: error instanceof Error ? error.message : String(error),
      fallback: getFallbackPlaylist('upbeat'),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
})

// ── Helper functions ─────────────────────────────────────────

function getGenresForMood(mood: string): string[] {
  const moodGenres: Record<string, string[]> = {
    energetic: ['rock', 'edm', 'dance', 'pop'],
    focused: ['electronic', 'ambient', 'classical', 'trip_hop'],
    relaxed: ['ambient', 'chill', 'acoustic', 'indie'],
    upbeat: ['pop', 'country', 'folk', 'rock'],
    night_drive: ['synthwave', 'electronic', 'rock', 'indie'],
  }
  return moodGenres[mood] || moodGenres.upbeat
}

function getTargetAttributes(mood: string) {
  const attributes: Record<string, { energy: number; tempo: number; danceability: number; acousticness: number; valence: number }> = {
    energetic: { energy: 0.85, tempo: 140, danceability: 0.6, acousticness: 0.05, valence: 0.7 },
    focused: { energy: 0.5, tempo: 105, danceability: 0.35, acousticness: 0.25, valence: 0.4 },
    relaxed: { energy: 0.3, tempo: 85, danceability: 0.35, acousticness: 0.7, valence: 0.5 },
    upbeat: { energy: 0.7, tempo: 120, danceability: 0.6, acousticness: 0.15, valence: 0.75 },
    night_drive: { energy: 0.65, tempo: 115, danceability: 0.4, acousticness: 0.2, valence: 0.45 },
  }
  return attributes[mood] || attributes.upbeat
}

function generatePlaylistName(mood: string, context?: PlaylistRequest['context']): string {
  const timeNames: Record<string, string> = {
    morning: 'Morning Miles',
    afternoon: 'Afternoon Haul',
    evening: 'Evening Run',
    night: 'Night Drive',
  }

  const moodNames: Record<string, string> = {
    energetic: 'Highway Energy',
    focused: 'Laser Focus',
    relaxed: 'Cruise Control',
    upbeat: 'Open Road Vibes',
    night_drive: 'Midnight Highway',
  }

  if (context?.timeOfDay && timeNames[context.timeOfDay]) {
    return `${timeNames[context.timeOfDay]} ${moodNames[mood] || ''}`.trim()
  }
  return `Fleet Commander — ${moodNames[mood] || 'Road Mix'}`
}

function getFallbackPlaylist(mood: string) {
  const fallbacks: Record<string, any> = {
    upbeat: {
      name: 'Open Road Vibes',
      tracks: [
        { name: 'Life is a Highway', artist: 'Rascal Flatts' },
        { name: 'East Bound and Down', artist: 'Jerry Reed' },
        { name: 'On the Road Again', artist: 'Willie Nelson' },
        { name: 'Drivin My Life Away', artist: 'Eddie Rabbitt' },
        { name: 'Truckin\'', artist: 'Grateful Dead' },
      ],
    },
  }
  return fallbacks[mood] || fallbacks.upbeat
}