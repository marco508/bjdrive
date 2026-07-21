// Distances géographiques en JavaScript (sans aller-retour base) pour le calcul
// du tarif de livraison d'une tournée multi-enseignes.
export interface Point {
  lat: number
  lng: number
}

const R = 6371000
const toRad = (d: number) => (d * Math.PI) / 180

export function haversine(a: Point, b: Point): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Distance de la tournée : le livreur passe dans chaque enseigne (de la plus
// éloignée du client à la plus proche) puis livre le client. Retourne mètres +
// le point de départ (enseigne la plus éloignée) pour l'affichage carte.
export function tourDistance(stores: Point[], dest: Point): { meters: number; origin: Point | null } {
  if (stores.length === 0) return { meters: 0, origin: null }
  const ordered = [...stores].sort((a, b) => haversine(b, dest) - haversine(a, dest))
  let meters = 0
  for (let i = 0; i < ordered.length - 1; i++) meters += haversine(ordered[i], ordered[i + 1])
  meters += haversine(ordered[ordered.length - 1], dest)
  return { meters, origin: ordered[0] }
}
