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
  const { data: snapshot } = await supabase
    .from('ai_snapshots')
    .insert({
      brand_id:      brandId,
      month,
      year,
      asa:           asaResult.asa,
      aar:           asaResult.aar,
      level:         asaResult.level,
      appearances:   asaResult.appearances,
      total_queries: asaResult.total,
      raw_results:   queryResults
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

  const brandRecord = await getOrCreateBrand(domain, sector, city)
  const brandName   = brand || brandRecord.name

  const queries = generateQueries({ brand: brandName, sector, city, limit: queryLimit })
  console.log(`[scanner] ${queries.length} queries generadas`)
  console.log(`[scanner] Engines: ${engines.join(', ')}`)
  console.log(`[scanner] Primera query: ${queries[0]?.text}`)

  const queryResults = []
  let processed = 0

  for (const query of queries) {
    console.log(`[scanner] Ejecutando query ${processed+1}/${queries.length}: "${query.text}"`)
    try {
      const responses = await executeQuery(query.text, engines)
      console.log(`[scanner] Respuestas recibidas: ${responses.length}`)

      for (const response of responses) {
        console.log(`[scanner] Engine ${response.engine}: success=${response.success} error=${response.error||'ninguno'}`)
        if (!response.success || !response.response) continue

        const parsed = parseResponse(response.response, brandName, domain)
        console.log(`[scanner] Parsed: appears=${parsed.appears} mentions=${parsed.total_mentions}`)

        queryResults.push({
          query_text:        query.text,
          intent:            query.intent,
          weight:            query.weight,
          engine:            response.engine,
          appears:           parsed.appears,
          token_share:       parsed.token_share,
          exact_mentions:    parsed.exact_mentions,
          semantic_mentions: parsed.semantic_mentions,
          is_first_mention:  parsed.is_first_mention,
          first_position:    parsed.first_position,
          total_tokens:      parsed.total_tokens,
          urls_cited:        parsed.urls_cited
        })
      }

      processed++

      if (onProgress) {
        onProgress({
          processed,
          total:   queries.length,
          pct:     Math.round((processed / queries.length) * 100),
          current: query.text,
          found:   queryResults.filter(r => r.appears).length
        })
      }

      await new Promise(r => setTimeout(r, 800))

    } catch (err) {
      console.error(`[scanner] Error en query "${query.text}":`, err.message)
      console.error(err.stack)
      processed++
    }
  }

  console.log(`[scanner] Total queryResults: ${queryResults.length}`)
  const asaResult = calculateASA(queryResults)
  console.log(`[scanner] Completado — ASA: ${asaResult.asa}% | Nivel: ${asaResult.level}`)

  const snapshot = await saveScanResults(brandRecord.id, queryResults, asaResult, month, year)

  return {
    brand_id:      brandRecord.id,
    domain,
    brand:         brandName,
    sector,
    city,
    asa:           asaResult.asa,
    aar:           asaResult.aar,
    level:         asaResult.level,
    appearances:   asaResult.appearances,
    total_queries: queryResults.length,
    snapshot_id:   snapshot?.id,
    month,
    year,
    query_results: queryResults
  }
}