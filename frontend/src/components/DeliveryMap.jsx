import { useEffect, useRef, useState } from 'react'
import { loadGoogleMaps, directionsEta, mapsEnabled } from '../lib/maps.js'
import { formatDuration, arrivalTime, formatDistance, haversine, estimateEta } from '../lib/geo.js'

// Carte de suivi de livraison.
// - Avec clé Google Maps : vraie carte + itinéraire + marqueurs mis à jour en direct.
// - Sans clé : carte de secours (SVG) qui positionne magasin / client / livreur et l'ETA à vol d'oiseau.
export default function DeliveryMap({ origin, destination, driver, etaSeconds, tall }) {
  const points = { origin, destination, driver }
  const eta = useLiveEta(points, etaSeconds)

  return (
    <div className={`map-wrap ${tall ? 'tall' : ''}`}>
      {eta != null && (
        <div className="eta-chip">
          🛵 Arrivée estimée <b>{arrivalTime(eta)}</b>
          <div className="muted" style={{ fontSize: 11 }}>
            dans {formatDuration(eta)}
            {driver && destination ? ` · ${formatDistance(haversine(driver, destination))}` : ''}
          </div>
        </div>
      )}
      {mapsEnabled ? (
        <GoogleMap origin={origin} destination={destination} driver={driver} />
      ) : (
        <FallbackMap origin={origin} destination={destination} driver={driver} />
      )}
    </div>
  )
}

// ETA : préfère la valeur fournie (Directions/simulateur), sinon estime à vol d'oiseau.
function useLiveEta(points, provided) {
  if (provided != null) return provided
  if (points.driver && points.destination) {
    return estimateEta(points.driver, points.destination).seconds
  }
  if (points.origin && points.destination) {
    return estimateEta(points.origin, points.destination).seconds
  }
  return null
}

// ---------------- Google Maps ----------------
function GoogleMap({ origin, destination, driver }) {
  const ref = useRef(null)
  const state = useRef({})
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadGoogleMaps()
      .then(async (google) => {
        if (cancelled || !ref.current) return
        const map = new google.maps.Map(ref.current, {
          center: destination || origin,
          zoom: 14,
          disableDefaultUI: true,
          zoomControl: true,
          styles: MAP_STYLE,
        })
        const mk = (pos, label, color) =>
          new google.maps.Marker({
            position: pos,
            map,
            label: { text: label, fontSize: '16px' },
            icon: pinIcon(google, color),
          })
        state.current.google = google
        state.current.map = map
        if (origin) state.current.storeMk = mk(origin, '🏪', '#1565c0')
        if (destination) state.current.destMk = mk(destination, '🏠', '#0a7d3c')
        if (driver) state.current.drvMk = mk(driver, '🛵', '#e8112d')

        // itinéraire
        if (origin && destination) {
          const res = await directionsEta(google, origin, destination)
          const path = res?.path || [origin, destination]
          state.current.line = new google.maps.Polyline({
            path,
            map,
            strokeColor: '#0a7d3c',
            strokeOpacity: 0.85,
            strokeWeight: 4,
          })
        }
        const b = new google.maps.LatLngBounds()
        ;[origin, destination, driver].filter(Boolean).forEach((p) => b.extend(p))
        if (!b.isEmpty()) map.fitBounds(b, 60)
      })
      .catch(() => setFailed(true))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // met à jour la position du livreur en direct
  useEffect(() => {
    const s = state.current
    if (s.google && driver) {
      if (s.drvMk) s.drvMk.setPosition(driver)
      else s.drvMk = new s.google.maps.Marker({ position: driver, map: s.map, icon: pinIcon(s.google, '#e8112d'), label: { text: '🛵', fontSize: '16px' } })
    }
  }, [driver?.lat, driver?.lng])

  if (failed) return <FallbackMap origin={origin} destination={destination} driver={driver} />
  return <div ref={ref} className="map-el" />
}

function pinIcon(google, color) {
  return {
    path: 'M12 2C7.6 2 4 5.6 4 10c0 5.4 8 12 8 12s8-6.6 8-12c0-4.4-3.6-8-8-8z',
    fillColor: color,
    fillOpacity: 1,
    strokeColor: '#fff',
    strokeWeight: 2,
    scale: 1.6,
    anchor: new google.maps.Point(12, 22),
    labelOrigin: new google.maps.Point(12, 9),
  }
}

// ---------------- Carte de secours (SVG) ----------------
function FallbackMap({ origin, destination, driver }) {
  const pts = [origin, destination, driver].filter(Boolean)
  if (pts.length === 0) return <div className="fallback-map" />

  const lats = pts.map((p) => p.lat)
  const lngs = pts.map((p) => p.lng)
  let minLat = Math.min(...lats), maxLat = Math.max(...lats)
  let minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  // marge
  const padLat = (maxLat - minLat || 0.01) * 0.4 + 0.002
  const padLng = (maxLng - minLng || 0.01) * 0.4 + 0.002
  minLat -= padLat; maxLat += padLat; minLng -= padLng; maxLng += padLng

  const W = 400, H = 300
  const x = (lng) => ((lng - minLng) / (maxLng - minLng)) * W
  const y = (lat) => H - ((lat - minLat) / (maxLat - minLat)) * H

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="fallback-map" preserveAspectRatio="xMidYMid slice">
      {/* fond quadrillé façon plan */}
      <defs>
        <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
          <path d="M28 0H0V28" fill="none" stroke="#cfe0d6" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="#e8f0ea" />
      <rect width={W} height={H} fill="url(#grid)" />
      {origin && destination && (
        <line x1={x(origin.lng)} y1={y(origin.lat)} x2={x(destination.lng)} y2={y(destination.lat)}
          stroke="#0a7d3c" strokeWidth="3" strokeDasharray="7 6" strokeLinecap="round" />
      )}
      {origin && <Marker x={x(origin.lng)} y={y(origin.lat)} color="#1565c0" emoji="🏪" />}
      {destination && <Marker x={x(destination.lng)} y={y(destination.lat)} color="#0a7d3c" emoji="🏠" />}
      {driver && <Marker x={x(driver.lng)} y={y(driver.lat)} color="#e8112d" emoji="🛵" pulse />}
    </svg>
  )
}

function Marker({ x, y, color, emoji, pulse }) {
  return (
    <g transform={`translate(${x},${y})`}>
      {pulse && <circle r="16" fill={color} opacity="0.25">
        <animate attributeName="r" values="10;20;10" dur="1.6s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.35;0;0.35" dur="1.6s" repeatCount="indefinite" />
      </circle>}
      <circle r="13" fill="#fff" stroke={color} strokeWidth="3" />
      <text textAnchor="middle" dominantBaseline="central" fontSize="14">{emoji}</text>
    </g>
  )
}

const MAP_STYLE = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
]
