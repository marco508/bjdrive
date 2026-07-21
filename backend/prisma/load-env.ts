// Charge les variables depuis .env dans process.env (sans dépendance externe).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

try {
  const raw = readFileSync(join(__dirname, '..', '.env'), 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
} catch {
  /* pas de .env : on se rabat sur l'environnement courant */
}
