/**
 * photoStamp.ts — burns a geotag/timestamp/map overlay onto a photo, client-side.
 *
 * Used by incident-scene photo capture (spec: driver takes a photo at an
 * accident scene and the coordinates, a small map, and the date/time are
 * etched into the image itself, not just stored as separate metadata).
 * Draws onto a <canvas> so it only runs in the browser. The map thumbnail
 * comes from /api/fleet/dump-truck/map-tile (same-origin proxy) rather than
 * tile.openstreetmap.org directly, so the canvas doesn't get cross-origin
 * tainted and toBlob() keeps working.
 */

export interface PhotoStampInfo {
  lat: number
  lng: number
  capturedAt: Date
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Could not load image: ${src}`))
    img.src = src
  })
}

/** Best-effort — if canvas/map compositing fails for any reason, returns the original file untouched. */
export async function stampPhotoWithGeoTag(file: File, info: PhotoStampInfo): Promise<File> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const photo = await loadImage(objectUrl)
    const canvas = document.createElement('canvas')
    canvas.width = photo.width
    canvas.height = photo.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(photo, 0, 0)

    const mapSize = Math.round(Math.min(220, Math.max(80, Math.min(photo.width, photo.height) * 0.22)))
    const pad = Math.round(Math.max(8, photo.width * 0.02))
    const bandHeight = mapSize + pad * 2

    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(0, photo.height - bandHeight, photo.width, bandHeight)

    let textX = pad * 2 + mapSize
    try {
      const mapImg = await loadImage(`/api/fleet/dump-truck/map-tile?lat=${info.lat}&lng=${info.lng}`)
      const mapX = pad
      const mapY = photo.height - bandHeight + pad
      ctx.drawImage(mapImg, mapX, mapY, mapSize, mapSize)
      ctx.strokeStyle = 'white'
      ctx.lineWidth = Math.max(2, mapSize * 0.015)
      ctx.strokeRect(mapX, mapY, mapSize, mapSize)
      ctx.fillStyle = '#e53e3e'
      ctx.beginPath()
      ctx.arc(mapX + mapSize / 2, mapY + mapSize / 2, mapSize * 0.05, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'white'
      ctx.lineWidth = Math.max(1, mapSize * 0.008)
      ctx.stroke()
    } catch {
      // Map tile unavailable (offline/etc) — text stamp below still applies, just start it at the left edge.
      textX = pad
    }

    const fontSize = Math.max(16, Math.round(photo.width * 0.03))
    ctx.fillStyle = 'white'
    ctx.font = `700 ${fontSize}px sans-serif`
    ctx.textBaseline = 'middle'
    const lineGap = fontSize * 1.35
    const centerY = photo.height - bandHeight / 2
    ctx.fillText(info.capturedAt.toLocaleString(), textX, centerY - lineGap / 2)
    ctx.fillText(`${info.lat.toFixed(6)}, ${info.lng.toFixed(6)}`, textX, centerY + lineGap / 2)

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not encode stamped photo'))), 'image/jpeg', 0.9)
    })
    return new File([blob], file.name, { type: 'image/jpeg' })
  } catch (err) {
    console.error('[photoStamp] stampPhotoWithGeoTag failed, using original photo:', err)
    return file
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
