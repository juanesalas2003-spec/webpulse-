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

const app       = express()
const __dirname = dirname(fileURLToPath(import.meta.url))

app.use(express.json())
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  next()
})

// ─── Panel de administración ─────────────────────────────
app.get('/panel', (req, res) => {
  res.send(readFileSync(join(__dirname, 'panel.html'), 'utf8'))
})

// ─── Audit individual ────────────────────────────────────
app.post('/api/audit', async (req, res) => {
  const { url, sector = 'general', contact, channel = 'whatsapp' } = req.body
  if (!url) return res.status(400).json({ error: 'url requerida' })

  try {
    const domain = new URL(url).hostname

    // ── Buscar si el dominio ya existe ──
    const { data: existing } = await supabase
      .from('prospects')
      .select('id')
      .eq('domain', domain)
      .maybeSingle()

    let prospect
    if (existing) {
      // Reutilizar el prospect existente, resetear a pending
      await supabase.from('prospects')
        .update({ url, sector, status: 'pending' })
        .eq('id', existing.id)
      prospect = existing
    } else {
      // Insertar nuevo prospect
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

    let output = null
    if (product === 'P1') output = generateReport(url, combinedScore, flags, sector, entityDensity, rar)
    if (product === 'P2') output = generateJsonLD(extracted, sector, domain)

    if (output) {
      await supabase.from('outputs').insert({
        prospect_id: prospect.id,
        product,
        payload: typeof output === 'string' ? { jsonld: output } : output
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
      critical_count:   flags.filter(f => f.severity === 'critical').length
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
      const combinedScore    = parseFloat(((score + entityDensity.density_score) / 2).toFixed(2))
      const { product }      = routeProduct(combinedScore)

      // Buscar si el dominio ya existe
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
        prospect_id: prospect.id,
        flags,
        score: combinedScore,
        headings: extracted.headings,
        images_total: extracted.images_alt.length,
        images_no_alt: extracted.images_alt.filter(a => !a?.trim()).length
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
// ─── Servidor ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Orquestador corriendo en puerto ${PORT}`))