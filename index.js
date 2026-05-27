import express from 'express'
import 'dotenv/config'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { scrapeUrl }          from './src/firecrawl.js'
import { scoreAudit }         from './src/scorer.js'
import { routeProduct }       from './src/router.js'
import { generateReport }     from './src/outputs/p1-report.js'
import { generateJsonLD }     from './src/outputs/p2-jsonld.js'
import { notifyJelou }        from './src/outputs/p4-jelou.js'
import { scoreEntityDensity } from './src/entity-density.js'
import { calculateRAR }       from './src/rar-calculator.js'
import { supabase }           from './src/db.js'
import { scorePulsia }        from './src/pulsia-scorer.js'
import { generateSemanticLayer } from './semantic-layer.js'

const app       = express()
const __dirname = dirname(fileURLToPath(import.meta.url))

app.use(express.json())
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  next()
})

// ─── Landing page ─────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'landing.html'), { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
})

app.get('/panel', (req, res) => {
  res.sendFile(join(__dirname, 'panel.html'), { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
})
// ─── Audit individual ────────────────────────────────────
app.post('/api/audit', async (req, res) => {
  const { url, sector = 'general', contact, channel = 'whatsapp' } = req.body
  if (!url) return res.status(400).json({ error: 'url requerida' })

  try {
    const domain = new URL(url).hostname

    const { data: existing } = await supabase
      .from('prospects')
      .select('id')
      .eq('domain', domain)
      .maybeSingle()

    let prospect
    if (existing) {
      await supabase.from('prospects')
        .update({ url, sector, status: 'pending' })
        .eq('id', existing.id)
      prospect = existing
    } else {
      const { data } = await supabase
        .from('prospects')
        .insert({ url, domain, sector, status: 'pending' })
        .select().single()
      prospect = data
    }

    console.log(`[audit] Scraping ${url}...`)
    const extracted = await scrapeUrl(url)

    const { score, flags } = scoreAudit(extracted, sector)
    const entityDensity    = scoreEntityDensity(extracted.schema_org, sector)
    const rar              = calculateRAR(sector, score)
    const combinedScore    = parseFloat(((score + entityDensity.density_score) / 2).toFixed(2))

    const pulsiaResult = scorePulsia({ ...extracted, url }, sector)

    await supabase.from('audits').insert({
      prospect_id:   prospect.id,
      headings:      extracted.headings,
      meta_tags:     { title: extracted.meta_title, description: extracted.meta_desc },
      schema_found:  { raw: extracted.schema_org },
      images_total:  extracted.images_alt.length,
      images_no_alt: extracted.images_alt.filter(a => !a || a.trim() === '').length,
      flags,
      score:         combinedScore
    })

    const { product } = routeProduct(combinedScore)

    await supabase.from('prospects')
      .update({ score: combinedScore, status: 'audited', product_assigned: product })
      .eq('id', prospect.id)

    const report = generateReport(url, combinedScore, flags, sector, entityDensity, rar)
    await supabase.from('outputs').insert({
      prospect_id: prospect.id,
      product:     'P1',
      payload:     report
    })

    if (product === 'P2') {
      const jsonld = generateJsonLD(extracted, sector, domain)
      await supabase.from('outputs').insert({
        prospect_id: prospect.id,
        product:     'P2',
        payload:     typeof jsonld === 'string' ? { jsonld } : jsonld
      })
    }

    if (contact && combinedScore >= 4) {
      await notifyJelou({ contact, channel, url, score: combinedScore, flags, sector, rar })
      await supabase.from('conversations').insert({
        prospect_id:     prospect.id,
        channel,
        webhook_payload: { contact, score: combinedScore, flags, rar }
      })
      await supabase.from('prospects')
        .update({ status: 'contacted' })
        .eq('id', prospect.id)
    }

    res.json({
      prospect_id:      prospect.id,
      url,
      score:            combinedScore,
      seo_score:        score,
      entity_score:     entityDensity.density_score,
      entity_density:   entityDensity,
      rar,
      product_assigned: product,
      flags_count:      flags.length,
      critical_count:   flags.filter(f => f.severity === 'critical').length,
      pulsia_score:     pulsiaResult.pulsia_score,
      badge_level:      pulsiaResult.badge_level,
      dimensions:       pulsiaResult.dimensions,
      top_priorities:   pulsiaResult.top_priorities
    })

  } catch (err) {
    console.error('[audit] Error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── Audit batch ─────────────────────────────────────────
app.post('/api/audit/batch', async (req, res) => {
  const { urls, sector = 'general' } = req.body
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: 'urls debe ser un array' })
  }
  res.json({ message: `Procesando ${urls.length} URLs...`, status: 'queued' })

  for (const url of urls) {
    try {
      await new Promise(r => setTimeout(r, 2000))
      const domain    = new URL(url).hostname
      const extracted = await scrapeUrl(url)
      const { score, flags } = scoreAudit(extracted, sector)
      const entityDensity    = scoreEntityDensity(extracted.schema_org, sector)
      const rar              = calculateRAR(sector, score)
      const combinedScore    = parseFloat(((score + entityDensity.density_score) / 2).toFixed(2))
      const { product }      = routeProduct(combinedScore)

      const { data: existing } = await supabase
        .from('prospects')
        .select('id')
        .eq('domain', domain)
        .maybeSingle()

      let prospect
      if (existing) {
        await supabase.from('prospects')
          .update({ url, sector, score: combinedScore, status: 'audited', product_assigned: product })
          .eq('id', existing.id)
        prospect = existing
      } else {
        const { data } = await supabase
          .from('prospects')
          .insert({ url, domain, sector, score: combinedScore, status: 'audited', product_assigned: product })
          .select().single()
        prospect = data
      }

      await supabase.from('audits').insert({
        prospect_id:   prospect.id,
        flags,
        score:         combinedScore,
        headings:      extracted.headings,
        images_total:  extracted.images_alt.length,
        images_no_alt: extracted.images_alt.filter(a => !a?.trim()).length
      })

      const report = generateReport(url, combinedScore, flags, sector, entityDensity, rar)
      await supabase.from('outputs').insert({
        prospect_id: prospect.id,
        product:     'P1',
        payload:     report
      })

      console.log(`[batch] ${url} → score: ${combinedScore} → producto: ${product}`)
    } catch (err) {
      console.error(`[batch] Error en ${url}:`, err.message)
    }
  }
})

// ─── Consultar prospectos ─────────────────────────────────
app.get('/api/prospects', async (req, res) => {
  const { status, min_score } = req.query
  let query = supabase.from('prospects_summary').select('*')
  if (status)    query = query.eq('status', status)
  if (min_score) query = query.gte('score', parseFloat(min_score))
  const { data, error } = await query.limit(100)
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── Obtener reporte de prospect ─────────────────────────
app.get('/api/prospects/:id/report', async (req, res) => {
  const { id } = req.params
  const { data, error } = await supabase
    .from('outputs')
    .select('*')
    .eq('prospect_id', id)
    .eq('product', 'P1')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  if (error) return res.status(404).json({ error: 'No hay reporte para este prospect' })
  res.json(data)
})

// ─── Actualizar estado de prospect ───────────────────────
app.patch('/api/prospects/:id/status', async (req, res) => {
  const { id } = req.params
  const { status } = req.body
  const valid = ['pending','audited','contacted','delivered']
  if (!valid.includes(status)) return res.status(400).json({ error: 'Estado inválido' })
  const { data, error } = await supabase
    .from('prospects')
    .update({ status })
    .eq('id', id)
    .select().single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── MercadoPago ──────────────────────────────────────────
app.post('/api/payment/create', async (req, res) => {
  const { product, email = 'cliente@pulsia.ai', url = '' } = req.body
  const products = {
    P1: { title: 'PulsIA P1 — Reporte de Auditoría IA', price: 49 },
    P2: { title: 'PulsIA P2 — Semantic Layer',           price: 99 },
    P3: { title: 'PulsIA P3 — Web Completa AI-Ready',    price: 499 },
    P4: { title: 'PulsIA P4 — Web + Automatización',     price: 2000 }
  }
  const item = products[product]
  if (!item) return res.status(400).json({ error: 'Producto inválido' })
  try {
    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}` },
      body: JSON.stringify({
        items: [{ title: item.title, quantity: 1, unit_price: item.price, currency_id: 'USD' }],
        payer: { email },
        back_urls: {
          success: `https://webpulse-kqgm.onrender.com/gracias?product=${product}&url=${encodeURIComponent(url)}`,
          failure: `https://webpulse-kqgm.onrender.com/#precios`,
          pending: `https://webpulse-kqgm.onrender.com/#precios`
        },
        auto_return: 'approved',
        statement_descriptor: 'PULSIA',
        external_reference: `${product}-${Date.now()}`
      })
    })
    const data = await response.json()
    if (!data.id) throw new Error(data.message || 'Error creando preferencia')
    res.json({ checkout_url: data.init_point, preference_id: data.id })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Página de gracias ────────────────────────────────────
app.get('/gracias', (req, res) => {
  const { product, url } = req.query
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>¡Pago exitoso! — PulsIA</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;background:#0f0f0f;color:#f0f0f0;display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:16px;padding:48px;text-align:center;max-width:480px}
h1{font-size:32px;margin-bottom:16px}p{color:#888;margin-bottom:24px;line-height:1.6}
.badge{display:inline-block;background:#1a3d2e;color:#69db7c;padding:6px 20px;border-radius:20px;font-size:14px;margin-bottom:24px}
a{background:#6c47ff;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block}</style>
</head>
<body><div class="card">
<div style="font-size:64px;margin-bottom:16px">✅</div>
<div class="badge">${product} activado</div>
<h1>¡Pago exitoso!</h1>
<p>Gracias por confiar en PulsIA. Recibirás tu entregable en menos de 24 horas.</p>
<p style="font-size:13px">Sitio auditado: <strong>${url || 'pendiente'}</strong></p>
<a href="https://webpulse-kqgm.onrender.com">← Volver al inicio</a>
</div></body></html>`)
})

// ─── Prospección automática ───────────────────────────────
app.post('/api/prospect/search', async (req, res) => {
  const { sector = 'general', city = 'Colombia', limit = 10 } = req.body
  const queries = {
    real_estate: `agencias inmobiliarias ${city} sitio web`,
    health:      `clinicas medicas ${city} sitio web`,
    restaurant:  `restaurantes ${city} sitio web`,
    hotel:       `hoteles ${city} sitio web`,
    general:     `empresas ${city} sitio web`
  }
  const query = queries[sector] || queries.general
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}` },
      body: JSON.stringify({ query, limit })
    })
    const data = await response.json()
    if (!data.success) {
      return res.status(402).json({ error: 'Sin créditos Firecrawl', message: 'Recarga créditos en firecrawl.dev' })
    }
    const urls = (data.data || []).map(r => r.url).filter(u => u && u.startsWith('http'))
    res.json({ urls, query, total: urls.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── AI Presence Scan ─────────────────────────────────────
app.post('/api/ai-scan', async (req, res) => {
  const { domain, brand, sector = 'general', city = 'Colombia', query_limit = 20 } = req.body
  if (!domain) return res.status(400).json({ error: 'domain requerido' })
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
  const send = (data) => { res.write(`data: ${JSON.stringify(data)}\n\n`) }
  try {
    const { runScan } = await import('./src/query-engine/scanner.js')
    send({ type: 'start', message: `Iniciando scan de ${domain}...` })
    const result = await runScan({
      domain,
      brand:      brand || domain.replace(/^www\./, '').split('.')[0],
      sector, city,
      queryLimit: parseInt(query_limit),
      engines:    ['gemini'],
      onProgress: (progress) => { send({ type: 'progress', ...progress }) }
    })
    send({ type: 'complete', result })
  } catch (err) {
    console.error('[ai-scan] Error:', err.message)
    send({ type: 'error', message: err.message })
  } finally {
    res.end()
  }
})

// ─── Historial AI scans ───────────────────────────────────
app.get('/api/ai-scan/:domain', async (req, res) => {
  const domain = req.params.domain
  try {
    const { data: brand } = await supabase.from('ai_brands').select('id, name, sector, city').eq('domain', domain).maybeSingle()
    if (!brand) return res.status(404).json({ error: 'Marca no encontrada' })
    const { data: snapshots } = await supabase.from('ai_snapshots')
      .select('id, month, year, asa, aar, level, appearances, total_queries, created_at')
      .eq('brand_id', brand.id).order('year', { ascending: false }).order('month', { ascending: false }).limit(12)
    res.json({ brand, snapshots: snapshots || [] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Semantic Layer Generator ─────────────────────────────
app.post('/api/semantic-layer', async (req, res) => {
  const { url, sector = 'general' } = req.body
  if (!url) return res.status(400).json({ error: 'url requerida' })
  try {
    const domain    = new URL(url).hostname
    const extracted = await scrapeUrl(url)
    const layer     = generateSemanticLayer(extracted, sector, domain)
    res.json({ domain, sector, json: layer.json, txt: layer.txt, xml: layer.xml })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
// ─── Rankings públicos ────────────────────────────────────
app.get('/rankings', (req, res) => {
  res.sendFile(join(__dirname, 'rankings.html'), { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
})

app.get('/api/rankings', async (req, res) => {
  const { industry, city, limit = 10 } = req.query
  try {
    let query = supabase.from('pulsia_rankings').select('*').order('pulsia_score', { ascending: false })
    if (industry) query = query.eq('industry', industry)
    if (city)     query = query.eq('city', city)
    query = query.limit(parseInt(limit))
    const { data, error } = await query
    if (error) throw error
    res.json(data || [])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/rankings/update', async (req, res) => {
  const { prospect_id } = req.body
  try {
    const { data: prospect } = await supabase
      .from('prospects_summary').select('*').eq('id', prospect_id).single()
    if (!prospect) return res.status(404).json({ error: 'Prospect no encontrado' })

    const { data: output } = await supabase
      .from('outputs').select('payload').eq('prospect_id', prospect_id)
      .eq('product', 'P1').order('created_at', { ascending: false }).limit(1).single()

    const pulsiaScore = prospect.pulsia_score || 0
    const badgeLevel  = prospect.badge_level  || 'none'

    await supabase.from('pulsia_rankings').upsert({
      prospect_id:  prospect.id,
      company_name: prospect.domain,
      domain:       prospect.domain,
      industry:     prospect.sector || 'general',
      city:         'Colombia',
      pulsia_score: pulsiaScore,
      seo_score:    prospect.score || 0,
      badge_level:  badgeLevel,
      last_updated: new Date().toISOString()
    }, { onConflict: 'prospect_id' })

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
// ─── Servidor ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Orquestador corriendo en puerto ${PORT}`))
