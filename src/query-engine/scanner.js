// src/query-engine/scanner.js

import { generateQueries }            from './generator.js'
import { executeQuery }               from './executor.js'
import { parseResponse, calculateASA } from './parser.js'
import { supabase }                   from '../db.js'

async function getOrCreateBrand(domain, sector, city) {
  const { data: existing } = await supabase
    .from('ai_brands')
    .select('id, name, domain')
    .eq('domain', domain)
    .maybeSingle()

  if (existing) return existing

  const name = domain.replace(/^www\./, '').split('.')[0]
  const { data } = await supabase
    .from('ai_brands')
    .insert({ domain, name, sector, city })
    .select().single()

  return data
}

async function saveScanResults(brandId, queryResults, asaResult, month, year) {
  // Guardar snapshot mensual
  const { data: snapshot } = await supabase
    .from('ai_snapshots')
    .insert({
      brand_id:   brandId,
      month,
      year,
      asa:        asaResult.asa,
      aar:        asaResult.aar,
      level:      asaResult.level,
      appearances: asaResult.appearances,
      total_queries: asaResult.total,
      raw_results: queryResults
    })
    .select().single()

  return snapshot
}

export async function runScan({
  domain,
  brand,
  sector      = 'general',
  city        = 'Colombia',
  queryLimit  = 30,
  engines     = ['gpt4o-mini', 'gemini'],
  onProgress  = null
}) {
  console.log(`[scanner] Iniciando scan: ${domain} | ${sector} | ${city}`)

  const now   = new Date()
  const month = now.getMonth() + 1
  const year  = now.getFullYear()

  // 1. Obtener o crear marca en BD
  const brandRecord = await getOrCreateBrand(domain, sector, city)
  const brandName   = brand || brandRecord.name

  // 2. Generar queries
  const queries = generateQueries({ brand: brandName, sector, city, limit: queryLimit })
  console.log(`[scanner] ${queries.length} queries generadas`)

  // 3. Ejecutar queries y parsear respuestas
  const queryResults = []
  let processed = 0
console.log(`[scanner] Ejecutando con engines: ${engines.join(', ')}`)
console.log(`[scanner] Primera query: ${queries[0]?.text}`)
  for (const query of queries) {
    try {
      // Ejecutar en los engines seleccionados
      const responses = await executeQuery(query.text, engines)

      // Parsear cada respuesta
      for (const response of responses) {
        if (!response.success || !response.response) continue

        const parsed = parseResponse(response.response, brandName, domain)

        queryResults.push({
          query_text:   query.text,
          intent:       query.intent,
          weight:       query.weight,
          engine:       response.engine,
          appears:      parsed.appears,
          token_share:  parsed.token_share,
          exact_mentions:    parsed.exact_mentions,
          semantic_mentions: parsed.semantic_mentions,
          is_first_mention:  parsed.is_first_mention,
          first_position:    parsed.first_position,
          total_tokens:      parsed.total_tokens,
          urls_cited:        parsed.urls_cited
        })
      }

      processed++

      // Callback de progreso para streaming al frontend
      if (onProgress) {
        onProgress({
          processed,
          total:   queries.length,
          pct:     Math.round((processed / queries.length) * 100),
          current: query.text,
          found:   queryResults.filter(r => r.appears).length
        })
      }

      // Rate limiting entre queries
      await new Promise(r => setTimeout(r, 800))

    }} catch (err) {
  console.error(`[scanner] Error en query "${query.text}":`, err.message, err.stack)
}

  // 4. Calcular métricas finales
  const asaResult = calculateASA(queryResults)

  console.log(`[scanner] Completado — ASA: ${asaResult.asa}% | Nivel: ${asaResult.level}`)

  // 5. Guardar en BD
  const snapshot = await saveScanResults(
    brandRecord.id,
    queryResults,
    asaResult,
    month,
    year
  )

  return {
    brand_id:     brandRecord.id,
    domain,
    brand:        brandName,
    sector,
    city,
    asa:          asaResult.asa,
    aar:          asaResult.aar,
    level:        asaResult.level,
    appearances:  asaResult.appearances,
    total_queries: queryResults.length,
    snapshot_id:  snapshot?.id,
    month,
    year,
    query_results: queryResults
  }
}