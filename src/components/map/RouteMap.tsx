'use client'
import { useEffect, useState, useRef } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// ── Fix Leaflet default marker icons in webpack ───────────────────────────────
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// ── Custom coloured markers ───────────────────────────────────────────────────
function colorIcon(color: string, size = 28) {
  return L.divIcon({
    className: '',
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
    html: `<svg width="${size}" height="${size}" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22S28 23.333 28 14C28 6.268 21.732 0 14 0z" fill="${color}" stroke="white" stroke-width="2"/>
      <circle cx="14" cy="14" r="5" fill="white"/>
    </svg>`,
  })
}

const ICONS = {
  origin:   colorIcon('#00e8b0'),
  delivery: colorIcon('#28c048'),
  fuel:     colorIcon('#f5c200'),
  rest:     colorIcon('#e84000'),
  break:    colorIcon('#ff7a4a'),
  loves:    colorIcon('#e00000', 22),
  default:  colorIcon('#4ac4ff'),
}

// ── Types ─────────────────────────────────────────────────────────────────────
export type MapStop = {
  type: string
  label: string
  location: string
  address?: string
  mi: number
  eta: string
}

export type LovesStore = {
  name: string
  city: string
  state: string
  miles: number | null
  diesel: number | null
  lat?: number
  lng?: number
}

type LatLng = [number, number]

// ── Geocode a place string → [lat, lng] ───────────────────────────────────────
async function geocode(query: string): Promise<LatLng | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=us`
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } })
    const data = await res.json()
    if (data[0]) return [parseFloat(data[0].lat), parseFloat(data[0].lon)]
  } catch { /* ignore */ }
  return null
}

// ── Get route geometry from OSRM ──────────────────────────────────────────────
async function getRoute(coords: LatLng[]): Promise<LatLng[]> {
  if (coords.length < 2) return coords
  try {
    const waypoints = coords.map(([lat, lng]) => `${lng},${lat}`).join(';')
    const url = `https://router.project-osrm.org/route/v1/driving/${waypoints}?overview=full&geometries=geojson`
    const res = await fetch(url)
    const data = await res.json()
    if (data.code === 'Ok' && data.routes?.[0]?.geometry?.coordinates) {
      return data.routes[0].geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng] as LatLng)
    }
  } catch { /* ignore */ }
  return coords
}

// ── Fetch Love's along route (within ~200 mi of midpoint) ────────────────────
async function fetchLovesAlongRoute(midLat: number, midLng: number): Promise<LovesStore[]> {
  try {
    const res = await fetch(`/api/loves-fuel?lat=${midLat}&lng=${midLng}`)
    const data = await res.json()
    if (!Array.isArray(data)) return []
    // filter to stores within 200 miles and with a diesel price
    return data
      .filter((s: LovesStore) => s.diesel != null && (s.miles == null || s.miles <= 200))
      .slice(0, 10)
  } catch { return [] }
}

// ── Re-fit map bounds when route changes ─────────────────────────────────────
function FitBounds({ coords }: { coords: LatLng[] }) {
  const map = useMap()
  useEffect(() => {
    if (coords.length > 1) {
      map.fitBounds(L.latLngBounds(coords), { padding: [32, 32] })
    }
  }, [map, coords])
  return null
}

// ── Main component ─────────────────────────────────────────────────────────────
interface Props {
  origin: string
  dest: string
  stops: MapStop[]
  totalMiles: number
}

export default function RouteMap({ origin, dest, stops, totalMiles }: Props) {
  const [routeLine,  setRouteLine]  = useState<LatLng[]>([])
  const [markers,    setMarkers]    = useState<{ pos: LatLng; stop: MapStop; icon: L.DivIcon }[]>([])
  const [lovesStops, setLovesStops] = useState<LovesStore[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const didFetch = useRef(false)

  useEffect(() => {
    if (didFetch.current) return
    didFetch.current = true

    async function build() {
      setLoading(true); setError('')
      try {
        // Geocode key stops (origin, fuel stops with addresses, delivery)
        const keyStops: MapStop[] = [
          { type: 'origin',   label: 'Pickup / Start', location: origin,   mi: 0,   eta: '' },
          ...stops.filter(s => ['fuel','delivery','rest10'].includes(s.type)).slice(0, 6),
          { type: 'delivery', label: 'Delivery',       location: dest,     mi: 9999, eta: '' },
        ]

        const geocoded = await Promise.all(
          keyStops.map(s => geocode(s.address ?? s.location))
        )

        const validCoords: LatLng[] = []
        const newMarkers: typeof markers = []

        geocoded.forEach((pos, i) => {
          if (!pos) return
          validCoords.push(pos)
          const s = keyStops[i]
          const icon = s.type === 'origin'   ? ICONS.origin
                     : s.type === 'delivery' ? ICONS.delivery
                     : s.type === 'fuel'     ? ICONS.fuel
                     : s.type === 'rest10'   ? ICONS.rest
                     : ICONS.default
          newMarkers.push({ pos, stop: s as MapStop, icon })
        })

        setMarkers(newMarkers)

        // Fetch OSRM route
        if (validCoords.length >= 2) {
          const line = await getRoute(validCoords)
          setRouteLine(line)

          // Fetch Love's near the midpoint of the route
          const mid = line[Math.floor(line.length / 2)]
          if (mid) {
            const loves = await fetchLovesAlongRoute(mid[0], mid[1])
            // Geocode Love's stores (max 6) to get lat/lng
            const withCoords = await Promise.all(
              loves.slice(0, 6).map(async s => {
                const pos = await geocode(`${s.name}, ${s.city}, ${s.state}`)
                return pos ? { ...s, lat: pos[0], lng: pos[1] } : s
              })
            )
            setLovesStops(withCoords.filter(s => s.lat && s.lng))
          }
        }
      } catch (e) {
        setError('Map could not load route. Check your connection.')
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    build()
  }, [origin, dest, stops, totalMiles]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <div style={{ height: 420, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, color: 'var(--muted)' }}>
      <div style={{ fontSize: '2rem' }}>🗺</div>
      <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>Building route map…</div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--faint)' }}>Geocoding stops · fetching route · finding Love's nearby</div>
    </div>
  )

  if (error) return (
    <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, color: 'var(--muted)', fontSize: 'var(--text-xs)', padding: '1rem', textAlign: 'center' }}>
      {error}
    </div>
  )

  const center: LatLng = routeLine.length > 0
    ? routeLine[Math.floor(routeLine.length / 2)]
    : [39.5, -98.35] // continental US center

  return (
    <div style={{ borderRadius: 18, overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,.3)' }}>
      {/* Legend */}
      <div style={{ background: 'var(--surface)', padding: '.6rem 1rem', display: 'flex', flexWrap: 'wrap', gap: '.5rem', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: '.62rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', marginRight: 4 }}>Legend</span>
        {[
          ['#00e8b0', 'Pickup'],
          ['#28c048', 'Delivery'],
          ['#f5c200', 'Fuel stop'],
          ['#e84000', 'Rest (10h)'],
          ['#e00000', "Love's"],
        ].map(([c, l]) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: c, flexShrink: 0 }} />
            <span style={{ fontSize: '.6rem', color: 'var(--muted)', fontWeight: 600 }}>{l}</span>
          </div>
        ))}
        {lovesStops.length > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: '.6rem', color: 'var(--primary)', fontWeight: 700 }}>
            ⛽ {lovesStops.length} Love's nearby
          </span>
        )}
      </div>

      <MapContainer
        center={center}
        zoom={6}
        style={{ height: 420, width: '100%' }}
        scrollWheelZoom
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        {/* Route line */}
        {routeLine.length > 1 && (
          <Polyline
            positions={routeLine}
            pathOptions={{ color: '#00e8b0', weight: 4, opacity: 0.85 }}
          />
        )}

        {/* Stop markers */}
        {markers.map((m, i) => (
          <Marker key={i} position={m.pos} icon={m.icon}>
            <Popup>
              <div style={{ minWidth: 160 }}>
                <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>{m.stop.label}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>{m.stop.location}</div>
                {m.stop.eta && <div style={{ fontSize: 11, marginTop: 4 }}>ETA: <strong>{m.stop.eta}</strong></div>}
                {m.stop.mi > 0 && <div style={{ fontSize: 11 }}>Mile {m.stop.mi}</div>}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Love's markers along route */}
        {lovesStops.map((s, i) => s.lat && s.lng && (
          <Marker key={`loves-${i}`} position={[s.lat!, s.lng!]} icon={ICONS.loves}>
            <Popup>
              <div style={{ minWidth: 160 }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: '#e00000', marginBottom: 4 }}>⛽ {s.name}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>{s.city}, {s.state}</div>
                {s.diesel != null && <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>Diesel: <span style={{ color: '#15803d' }}>${s.diesel.toFixed(3)}</span></div>}
                {s.miles != null && <div style={{ fontSize: 11, color: '#6b7280' }}>{s.miles.toFixed(1)} mi from midpoint</div>}
              </div>
            </Popup>
          </Marker>
        ))}

        <FitBounds coords={routeLine.length > 1 ? routeLine : markers.map(m => m.pos)} />
      </MapContainer>
    </div>
  )
}
