// Vérifie que les champs/relations Prisma référencés dans include/select/orderBy/_count
// existent bien dans schema.prisma. Complète le type-check (dont le stub Prisma est permissif).
// N'exécute rien : analyse statique pure (aucun moteur Prisma requis).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8')

// --- Parse des modèles et de leurs champs ---
const models = {}
const modelRe = /model\s+(\w+)\s*\{([\s\S]*?)\}/g
let m
while ((m = modelRe.exec(schema))) {
  const [, name, body] = m
  const fields = new Set()
  for (const line of body.split('\n')) {
    const fm = line.trim().match(/^(\w+)\s+\S/)
    if (fm && !['@@index', '@@unique', '@@map', '@@id'].some((k) => line.includes(k) && line.trim().startsWith('@@'))) {
      if (!line.trim().startsWith('@@')) fields.add(fm[1])
    }
  }
  models[name] = fields
}
const allFields = new Set(Object.values(models).flatMap((s) => [...s]))

// Mots-clés Prisma autorisés dans include/select/orderBy/where
const KEYWORDS = new Set([
  'select', 'include', 'where', 'orderBy', 'take', 'skip', 'cursor', 'distinct', 'by', 'having',
  '_count', '_sum', '_avg', '_min', '_max', 'some', 'every', 'none', 'is', 'isNot',
  'AND', 'OR', 'NOT', 'in', 'notIn', 'lt', 'lte', 'gt', 'gte', 'not', 'equals',
  'contains', 'startsWith', 'endsWith', 'mode', 'asc', 'desc', 'true', 'false',
])

// --- Collecte des fichiers .ts ---
function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []
  })
}
const files = walk(join(root, 'src'))

// --- Extrait les blocs include:/select:/orderBy: et vérifie leurs clés ---
const problems = []
const blockRe = /(include|select|orderBy)\s*:\s*\{/g

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  let b
  while ((b = blockRe.exec(src))) {
    // extrait le contenu du bloc { ... } avec équilibrage des accolades
    let i = blockRe.lastIndex
    let depth = 1
    const start = i
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++
      else if (src[i] === '}') depth--
      i++
    }
    const block = src.slice(start, i - 1)
    // clés de premier niveau (identifiants suivis de :) — approximation volontairement prudente
    const keyRe = /(^|[,{]\s*)(\w+)\s*:/g
    let k
    while ((k = keyRe.exec(block))) {
      const key = k[2]
      if (!allFields.has(key) && !KEYWORDS.has(key)) {
        const line = src.slice(0, start + k.index).split('\n').length
        problems.push(`${file.replace(root, '')}:${line}  clé inconnue « ${key} » (ni champ du schéma, ni mot-clé Prisma)`)
      }
    }
  }
}

console.log(`Modèles: ${Object.keys(models).join(', ')}`)
console.log(`Champs distincts au schéma: ${allFields.size}`)
if (problems.length === 0) {
  console.log('\n✅ Aucune clé include/select/orderBy inconnue. Champs/relations cohérents avec le schéma.')
} else {
  console.log(`\n⚠️  ${problems.length} clé(s) à vérifier :`)
  problems.forEach((p) => console.log('   ' + p))
  process.exit(1)
}
