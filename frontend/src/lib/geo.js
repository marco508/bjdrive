// Utilitaires de géolocalisation, distance, ETA et formatage — sans dépendance.
// Réutilisables tels quels dans une future app React Native.

const R = 6371000 // rayon terrestre en mètres
const toRad = (d) => (d * Math.PI) / 180

// Distance à vol d'oiseau (Haversine) en mètres entre deux points {lat, lng}.
export function haversine(a, b) {
  if (!a || !b) return 0
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// ETA de secours (sans Directions API) : distance / vitesse moyenne d'un zémidjan en ville.
// Vitesse par défaut ~22 km/h en tenant compte du trafic urbain.
export function estimateEta(from, to, speedKmh = 22) {
  const meters = haversine(from, to)
  const speedMs = (speedKmh * 1000) / 3600
  const seconds = speedMs > 0 ? meters / speedMs : 0
  // marge de manœuvre (arrêts, feux) : +25%
  return { meters, seconds: seconds * 1.25 }
}

export function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}

export function formatDuration(seconds) {
  const min = Math.max(1, Math.round(seconds / 60))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

// Heure d'arrivée estimée à partir de maintenant.
export function arrivalTime(seconds, from = new Date()) {
  const d = new Date(from.getTime() + seconds * 1000)
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

// Interpolation linéaire entre deux points (pour animer le déplacement du livreur).
export function lerpPoint(a, b, t) {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }
}

// Format monétaire Franc CFA (XOF), la monnaie du Bénin.
export function formatFCFA(amount) {
  const n = Math.round(Number(amount) || 0)
  return `${n.toLocaleString('fr-FR')} FCFA`
}

// Centre approximatif du Bénin (fallback carte si la géoloc est indisponible).
// L'application couvre tout le pays, pas uniquement Cotonou.
export const BENIN_CENTER = { lat: 9.3, lng: 2.32 }

// Demande la position GPS de l'utilisateur (promesse).
export function getCurrentPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error("La géolocalisation n'est pas disponible sur cet appareil."))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0, ...options }
    )
  })
}
