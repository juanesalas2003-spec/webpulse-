// src/query-engine/parser.js

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function tokenize(text) {
  return text.split(/\s+/).filter(t => t.length > 0)
}

function normalize(text) {
  return text.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita tildes
    .trim()
}

function generateVariations(brand) {
  const variations = new Set()
  const norm = normalize(brand)

  // Sin espacios
  variations.add(norm.replace(/\s+/g, ''))

  // Palabras individuales > 3 chars
  norm.split(' ').filter(w => w.length > 3).forEach(w => variations.add(w))

  // Sin tilde
  variations.add(norm)

  // Elimina la marca original para no duplicar
  variations.delete(normalize(brand))

  return [...variations]
}

function findExactMentions(normalizedText, normalizedBrand) {
  const regex   = new RegExp(escapeRegex(normalizedBrand), 'g')
  const matches = [...normalizedText.matchAll(regex)]
  return {
    count:     matches.length,
    positions: matches.map(m => m.index)
  }
}

function findSemanticMentions(normalizedText, brand) {
  const variations = generateVariations(brand)
  let count = 0

  for (const variation of variations) {
    const regex = new RegExp(`\\b${escapeRegex(variation)}\\b`, 'g')
    count += [...normalizedText.matchAll(regex)].length
  }

  return { count }
}

function findUrlMentions(text, domain) {
  if (!domain) return { count: 0, urls: [] }
  const urlRegex  = /https?:\/\/[^\s)>\]"]+/gi
  const allUrls   = [...text.matchAll(urlRegex)].map(m => m[0])
  const brandUrls = allUrls.filter(url => url.includes(domain))
  return { count: brandUrls.length, urls: brandUrls }
}

function getFirstMentionPosition(normalizedText, normalizedBrand, totalTokens) {
  const idx = normalizedText.indexOf(normalizedBrand)
  if (idx === -1) return 'none'

  const tokensBefore = tokenize(normalizedText.substring(0, idx)).length
  const pct = totalTokens > 0 ? (tokensBefore / totalTokens) * 100 : 100

  if (pct < 25) return 'first'
  if (pct < 60) return 'middle'
  return 'late'
}

export function parseResponse(responseText, brand, domain = '') {
  if (!responseText || !brand) return nullResult()

  const normalizedText  = normalize(responseText)
  const normalizedBrand = normalize(brand)
  const tokens          = tokenize(responseText)
  const totalTokens     = tokens.length

  const exact    = findExactMentions(normalizedText, normalizedBrand)
  const semantic = findSemanticMentions(normalizedText, brand)
  const urls     = findUrlMentions(responseText, domain)

  const totalMentions = exact.count + semantic.count + urls.count
  const appears       = totalMentions > 0

  const firstPosition = getFirstMentionPosition(normalizedText, normalizedBrand, totalTokens)

  // Estima tokens asociados a la marca (ventana de contexto)
  const brandTokens = appears ? Math.min(80, Math.round(totalTokens * 0.15)) : 0
  const tokenShare  = totalTokens > 0 ? parseFloat(((brandTokens / totalTokens) * 100).toFixed(2)) : 0

  return {
    appears,
    total_mentions:    totalMentions,
    exact_mentions:    exact.count,
    semantic_mentions: semantic.count,
    url_mentions:      urls.count,
    is_first_mention:  firstPosition === 'first',
    first_position:    firstPosition,
    token_share:       tokenShare,
    brand_tokens:      brandTokens,
    total_tokens:      totalTokens,
    urls_cited:        urls.urls,
    mention_positions: exact.positions
  }
}

export function calculateASA(queryResults) {
  // queryResults = [{ intent, weight, token_share, appears }]
  if (!queryResults.length) return { asa: 0, level: 'Invisible', aar: 0 }

  let weightedSum  = 0
  let totalWeight  = 0
  let appearances  = 0

  for (const r of queryResults) {
    const weight = r.weight || 1
    weightedSum += (r.token_share || 0) * weight
    totalWeight += weight
    if (r.appears) appearances++
  }

  const asa = totalWeight > 0
    ? parseFloat((weightedSum / totalWeight).toFixed(2))
    : 0

  const aar = parseFloat(((appearances / queryResults.length) * 100).toFixed(1))

  return {
    asa,
    aar,
    level:      getLevel(asa),
    appearances,
    total:      queryResults.length
  }
}

export function getLevel(asa) {
  if (asa >= 15) return 'Dominante'
  if (asa >= 8)  return 'Visible'
  if (asa >= 3)  return 'Vulnerable'
  return 'Invisible'
}

function nullResult() {
  return {
    appears: false, total_mentions: 0, exact_mentions: 0,
    semantic_mentions: 0, url_mentions: 0, is_first_mention: false,
    first_position: 'none', token_share: 0, brand_tokens: 0,
    total_tokens: 0, urls_cited: [], mention_positions: []
  }
}