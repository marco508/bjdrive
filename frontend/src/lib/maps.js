// Chargeur de l'API Google Maps JavaScript (une seule fois) + calcul d'ETA via Directions.
// Si aucune clé n'est fournie, tout retombe sur une carte de secours (voir DeliveryMap.jsx).

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
export const mapsEnabled = Boolean(API_KEY)

let loadPromise = null

export function loadGoogleMaps() {
  if (!mapsEnabled) return Promise.reject(new Error('no-key'))
  if (window.google?.maps) return Promise.resolve(window.google)
  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve, reject) => {
    const cb = '__zemiMapsReady'
    window[cb] = () => resolve(window.google)
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=geometry&callback=${cb}&language=fr&region=BJ`
    s.async = true
    s.defer = true
    s.onerror = () => reject(new Error('maps-load-error'))
    document.head.appendChild(s)
  })
  return loadPromise
}

// ETA réelle via l'API Directions (retourne { seconds, meters, path[] }) ou null si indisponible.
export function directionsEta(google, origin, dest) {
  return new Promise((resolve) => {
    try {
      const svc = new google.maps.DirectionsService()
      svc.route(
        {
          origin,
          destination: dest,
          travelMode: google.maps.TravelMode.DRIVING,
        },
        (res, status) => {
          if (status === 'OK' && res.routes[0]) {
            const leg = res.routes[0].legs[0]
            resolve({
              seconds: leg.duration.value,
              meters: leg.distance.value,
              path: res.routes[0].overview_path.map((p) => ({ lat: p.lat(), lng: p.lng() })),
            })
          } else {
            resolve(null)
          }
        }
      )
    } catch {
      resolve(null)
    }
  })
}
