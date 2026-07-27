import { haversine, tourDistance } from './distance'

// Points réels à Cotonou (repères connus, ~4,2 km entre les deux).
const ETOILE_ROUGE = { lat: 6.3725, lng: 2.3931 }
const PORT = { lat: 6.3496, lng: 2.4283 }

describe('haversine', () => {
  it('distance nulle entre un point et lui-même', () => {
    expect(haversine(ETOILE_ROUGE, ETOILE_ROUGE)).toBe(0)
  })

  it('ordre de grandeur correct en ville (~4-5 km)', () => {
    const d = haversine(ETOILE_ROUGE, PORT)
    expect(d).toBeGreaterThan(3500)
    expect(d).toBeLessThan(5500)
  })

  it('symétrique', () => {
    expect(haversine(ETOILE_ROUGE, PORT)).toBeCloseTo(haversine(PORT, ETOILE_ROUGE), 6)
  })
})

describe('tourDistance', () => {
  const dest = { lat: 6.36, lng: 2.41 }

  it('sans enseigne → 0 et pas d’origine', () => {
    expect(tourDistance([], dest)).toEqual({ meters: 0, origin: null })
  })

  it('une enseigne → distance directe, origine = enseigne', () => {
    const r = tourDistance([ETOILE_ROUGE], dest)
    expect(r.origin).toEqual(ETOILE_ROUGE)
    expect(r.meters).toBeCloseTo(haversine(ETOILE_ROUGE, dest), 6)
  })

  it('plusieurs enseignes → part de la plus éloignée du client', () => {
    const far = { lat: 6.5, lng: 2.6 }
    const r = tourDistance([ETOILE_ROUGE, far], dest)
    expect(r.origin).toEqual(far)
    // La tournée complète est plus longue que le simple trajet enseigne proche → client.
    expect(r.meters).toBeGreaterThan(haversine(ETOILE_ROUGE, dest))
  })
})
