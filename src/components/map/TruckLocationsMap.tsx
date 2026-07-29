'use client'
/**
 * TruckLocationsMap — plain marker map of every truck with a known GPS
 * position (fleet_equipment.current_lat/current_lng). No route/geocoding —
 * just plots what's already in the database. See RouteMap.tsx for the
 * fuller route-planning map this borrows its Leaflet setup from.
 */
import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const truckIcon = L.divIcon({
  className: '',
  iconAnchor: [14, 28],
  popupAnchor: [0, -28],
  html: `<svg width="28" height="28" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22S28 23.333 28 14C28 6.268 21.732 0 14 0z" fill="#00e8b0" stroke="white" stroke-width="2"/>
    <circle cx="14" cy="14" r="5" fill="white"/>
  </svg>`,
})

export interface TruckLocation {
  id: string
  unitNumber: string
  currentLat: number
  currentLng: number
  locationUpdatedAt: string | null
}

function staleness(updatedAt: string | null): string {
  if (!updatedAt) return 'unknown'
  const minutes = Math.round((Date.now() - new Date(updatedAt).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return `${hours}h ago`
}

function FitBounds({ trucks }: { trucks: TruckLocation[] }) {
  const map = useMap()
  useEffect(() => {
    if (trucks.length > 0) {
      map.fitBounds(L.latLngBounds(trucks.map(t => [t.currentLat, t.currentLng] as [number, number])), { padding: [32, 32] })
    }
  }, [map, trucks])
  return null
}

export default function TruckLocationsMap({ trucks }: { trucks: TruckLocation[] }) {
  const center: [number, number] = trucks.length > 0 ? [trucks[0].currentLat, trucks[0].currentLng] : [39.5, -98.35]

  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)' }}>
      <MapContainer center={center} zoom={7} style={{ height: 360, width: '100%' }} scrollWheelZoom>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        {trucks.map(t => (
          <Marker key={t.id} position={[t.currentLat, t.currentLng]} icon={truckIcon}>
            <Popup>
              <div style={{ minWidth: 140 }}>
                <div style={{ fontWeight: 800, fontSize: 13 }}>🚛 {t.unitNumber}</div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Updated {staleness(t.locationUpdatedAt)}</div>
              </div>
            </Popup>
          </Marker>
        ))}
        <FitBounds trucks={trucks} />
      </MapContainer>
    </div>
  )
}
