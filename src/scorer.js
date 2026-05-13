export function scoreAudit(extracted, sector = 'general') {
  const flags = []
  let score = 0

  if (!extracted.schema_org || extracted.schema_org.length < 20) {
    flags.push({ code: 'no_schema_org', severity: 'critical', label: 'Sin datos estructurados schema.org' })
    score += 2
  }

  const sectorSchemas = {
    real_estate: 'RealEstateListing',
    health: 'MedicalBusiness',
    restaurant: 'Restaurant',
    hotel: 'LodgingBusiness',
    general: 'LocalBusiness'
  }
  const expectedSchema = sectorSchemas[sector] || 'LocalBusiness'
  if (!extracted.schema_org.includes(expectedSchema)) {
    flags.push({ code: 'no_sector_schema', severity: 'critical', label: `Sin schema ${expectedSchema}` })
    score += 1.5
  }

  if (!extracted.meta_title || extracted.meta_title.length < 10) {
    flags.push({ code: 'no_meta_title', severity: 'medium', label: 'Meta title ausente o muy corto' })
    score += 0.5
  }

  if (!extracted.meta_desc || extracted.meta_desc.length < 20) {
    flags.push({ code: 'no_meta_desc', severity: 'medium', label: 'Meta description ausente' })
    score += 0.5
  }

  if (!extracted.og_title) {
    flags.push({ code: 'no_og_title', severity: 'medium', label: 'Sin Open Graph title' })
    score += 0.5
  }

  if (!extracted.og_image) {
    flags.push({ code: 'no_og_image', severity: 'medium', label: 'Sin Open Graph image' })
    score += 0.5
  }

  const h1s = extracted.headings.filter(h => h.startsWith('H1:'))
  if (h1s.length === 0) {
    flags.push({ code: 'no_h1', severity: 'critical', label: 'Sin H1 en la pagina' })
    score += 1
  } else if (h1s.length > 1) {
    flags.push({ code: 'multiple_h1', severity: 'medium', label: `H1 duplicado (${h1s.length} encontrados)` })
    score += 0.5
  }

  const totalImgs = extracted.images_alt.length
  const imgsNoAlt = extracted.images_alt.filter(a => !a || a.trim() === '').length
  if (totalImgs > 0 && imgsNoAlt === totalImgs) {
    flags.push({ code: 'no_alt_text', severity: 'critical', label: `${imgsNoAlt} imagenes sin descripcion` })
    score += 1.5
  } else if (imgsNoAlt > 0) {
    flags.push({ code: 'partial_alt_text', severity: 'low', label: `${imgsNoAlt} de ${totalImgs} imagenes sin alt` })
    score += 0.5
  }

  const hasH2 = extracted.headings.some(h => h.startsWith('H2:'))
  if (!hasH2) {
    flags.push({ code: 'no_h2', severity: 'low', label: 'Sin estructura H2 en el contenido' })
    score += 0.5
  }

  if (extracted.meta_desc && extracted.meta_desc.length > 160) {
    flags.push({ code: 'meta_desc_long', severity: 'low', label: 'Meta description demasiado larga' })
    score += 0.5
  }

  return {
    score: parseFloat(Math.min(score, 10).toFixed(2)),
    flags,
    summary: flags.filter(f => f.severity === 'critical').length
  }
}