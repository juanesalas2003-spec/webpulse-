import express from 'express'
import 'dotenv/config'
import { scrapeUrl }          from './src/firecrawl.js'
import { scoreAudit }         from './src/scorer.js'
import { routeProduct }       from './src/router.js'
import { generateReport }     from './src/outputs/p1-report.js'
import { generateJsonLD }     from './src/outputs/p2-jsonld.js'
import { notifyJelou }        from './src/outputs/p4-jelou.js'
import { scoreEntityDensity } from './src/entity-density.js'
import { calculateRAR }       from './src/rar-calculator.js'
import { supabase }           from './src/db.js'

const app = express()
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  next()
}

app.post('/api/audit', async (req, res) => {
  const { url, sector = 'general', contact, channel = 'whatsapp' } = req.body
  if (!url) return res.status(400).json({ error: 'url requerida' })

  try {
    const domain = new URL(url).hostname

    const { data: prospect } = await supabase
      .from('prospects')
      .insert({ url, domain, sector, status: 'pending' })
      .select().single()

    console.log(`[audit] Scraping ${url}...`)
    const extracted = await scrapeUrl(url)

    const { score, flags }   = scoreAudit(extracted, sector)
    const entityDensity      = scoreEntityDensity(extracted.schema_org, sector)
    const rar                = calculateRAR(sector, score)

    const combinedScore = parseFloat(((score + entityDensity.density_score) / 2).toFixed(2))

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

app.get('/api/prospects', async (req, res) => {
  const { status, min_score } = req.query
  let query = supabase.from('prospects_summary').select('*')
  if (status)    query = query.eq('status', status)
  if (min_score) query = query.gte('score', parseFloat(min_score))
  const { data, error } = await query.limit(100)
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Orquestador corriendo en puerto ${PORT}`))