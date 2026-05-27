// ============================================
// PULSIA SCORER — Score multicapa 5 dimensiones
// ============================================

import { scoreAudit }         from './scorer.js'
import { scoreEntityDensity } from './entity-density.js'

// ════════ PESOS POR SECTOR ════════════════════════════════
const SECTOR_WEIGHTS = {
  health:      { semantic: 0.30, authority: 0.25, technical: 0.20, conversation: 0.15, trust: 0.10 },
  real_estate: { semantic: 0.28, authority: 0.27, technical: 0.20, conversation: 0.13, trust: 0.12 },
  restaurant:  { semantic: 0.25, authority: 0.20, technical: 0.20, conversation: 0.20, trust: 0.15 },
  hotel:       { semantic: 0.25, authority: 0.22, technical: 0.20, conversation: 0.18, trust: 0.15 },
  general:     { semantic: 0.30, authority: 0.25, technical: 0.20, conversation: 0.15, trust: 0.10 }
}

// ════════ DIMENSIÓN 1: SEMÁNTICA ══════════════════════════
function scoreSemantica(extracted, sector) {
  const ed = scoreEntityDensity(extracted.schema_org, sector)
  const ratio = ed.entities_present / Math.max(ed.entities_total, 1)

  let score = parseFloat((ratio * 10).toFixed(2))

  // Bonus por schema.org presente y rico
  const schema = extracted.schema_org || ''
  if (schema.length > 500) score = Math.min(10, score + 1)
  if (schema.includes('@context')) score = Math.min(10, score + 0.5)
  if (schema.includes('description')) score = Math.min(10, score + 0.5)

  // Bonus por meta tags completos
  if (extracted.meta_title && extracted.meta_title.length > 20) score = Math.min(10, score + 0.5)
  if (extracted.meta_desc && extracted.meta_desc.length > 50) score = Math.min(10, score + 0.5)
  if (extracted.meta_desc && extracted.meta_desc.length > 120) score = Math.min(10, score + 0.5)

  // Bonus Open Graph
  if (extracted.og_title) score = Math.min(10, score + 0.3)
  if (extracted.og_image) score = Math.min(10, score + 0.3)
  if (extracted.og_description) score = Math.min(10, score + 0.2)

  return {
    score: parseFloat(Math.min(score, 10).toFixed(2)),
    details: { entities_present: ed.entities_present, entities_total: ed.entities_total },
    label: score >= 7 ? 'Buena' : score >= 4 ? 'Media' : 'Crítica'
  }
}

// ════════ DIMENSIÓN 2: AUTORIDAD ══════════════════════════
function scoreAutoridad(extracted) {
  let score = 0
  const flags = []

  const schema = extracted.schema_org || ''
  const text   = (extracted.meta_desc || '') + ' ' +
                 (extracted.headings || []).join(' ') + ' ' +
                 (extracted.meta_title || '')
  const textLow = text.toLowerCase()

  // AggregateRating
  if (schema.includes('AggregateRating') || schema.includes('aggregateRating')) {
    score += 2.5
  } else {
    flags.push({ label: 'Sin AggregateRating en schema', severity: 'critical' })
  }

  // ratingValue
  if (schema.includes('ratingValue')) {
    score += 1.5
  } else {
    flags.push({ label: 'Sin ratingValue declarado', severity: 'high' })
  }

  // sameAs (perfiles sociales)
  const sameAsCount = (schema.match(/sameAs/g) || []).length
  if (sameAsCount >= 3) {
    score += 2
  } else if (sameAsCount >= 1) {
    score += 1
    flags.push({ label: `Solo ${sameAsCount} perfil social (recomienda 3+)`, severity: 'medium' })
  } else {
    flags.push({ label: 'Sin perfiles sociales declarados (sameAs)', severity: 'high' })
  }

  // Menciones de premios, certificaciones
  const trustWords = ['premio', 'certificado', 'reconocido', 'award', 'certified', 'acreditado', 'años de experiencia', 'fundado en']
  const trustFound = trustWords.filter(w => textLow.includes(w))
  if (trustFound.length >= 2) {
    score += 2
  } else if (trustFound.length === 1) {
    score += 1
    flags.push({ label: 'Pocas señales de autoridad en el texto', severity: 'medium' })
  } else {
    flags.push({ label: 'Sin señales de autoridad (premios, años, certificaciones)', severity: 'medium' })
  }

  // reviewCount
  if (schema.includes('reviewCount')) {
    score += 2
  } else {
    flags.push({ label: 'Sin reviewCount declarado', severity: 'medium' })
  }

  return {
    score: parseFloat(Math.min(score, 10).toFixed(2)),
    flags,
    label: score >= 7 ? 'Alta' : score >= 4 ? 'Media' : 'Baja'
  }
}

// ════════ DIMENSIÓN 3: TÉCNICA ════════════════════════════
function scoreTecnica(extracted, sector) {
  const { score: rawScore, flags } = scoreAudit(extracted, sector)
  // rawScore 0-10: más alto = menos problemas
  // Convertir a escala positiva directa
  let techScore = parseFloat(rawScore.toFixed(2))

  // Bonus por estructura de headings
  const headings = extracted.headings || []
  if (headings.length >= 5) techScore = Math.min(10, techScore + 1)
  else if (headings.length >= 2) techScore = Math.min(10, techScore + 0.5)

  // Bonus por imágenes con alt
  const imagesAlt = extracted.images_alt || []
  const imagesWithAlt = imagesAlt.filter(a => a && a.trim() !== '').length
  const altRatio = imagesAlt.length > 0 ? imagesWithAlt / imagesAlt.length : 0
  if (altRatio >= 0.8) techScore = Math.min(10, techScore + 1)
  else if (altRatio >= 0.5) techScore = Math.min(10, techScore + 0.5)
  else if (imagesAlt.length > 0) techScore = Math.max(0, techScore - 0.5)

  // Bonus por cantidad de contenido (headings como proxy)
  if (headings.length >= 10) techScore = Math.min(10, techScore + 0.5)

  return {
    score: parseFloat(Math.min(techScore, 10).toFixed(2)),
    flags,
    label: techScore >= 7 ? 'Buena' : techScore >= 4 ? 'Media' : 'Crítica'
  }
}

// ════════ DIMENSIÓN 4: CONVERSACIONAL ════════════════════
function scoreConversacional(extracted, sector) {
  let score = 0
  const flags = []

  const schema  = extracted.schema_org || ''
  const text    = (extracted.meta_desc || '') + ' ' +
                  (extracted.headings || []).join(' ') + ' ' +
                  (extracted.meta_title || '')
  const textLow = text.toLowerCase()

  // FAQ schema
  if (schema.includes('FAQPage') || schema.includes('Question')) {
    score += 3
  } else {
    flags.push({ label: 'Sin FAQPage en schema — las IAs no pueden citar preguntas frecuentes', severity: 'critical' })
  }

  // HowTo schema
  if (schema.includes('HowTo')) {
    score += 1.5
  } else {
    flags.push({ label: 'Sin HowTo schema — útil para consultas procedimentales', severity: 'low' })
  }

  // Precio mencionado
  if (schema.includes('price') || schema.includes('priceRange') || textLow.includes('precio') || textLow.includes('tarifa') || textLow.includes('costo') || textLow.includes('desde $')) {
    score += 1.5
  } else {
    flags.push({ label: 'Sin información de precios — pregunta frecuente de usuarios', severity: 'high' })
  }

  // Ubicación / cómo llegar
  if (schema.includes('GeoCoordinates') || textLow.includes('dirección') || textLow.includes('ubicación') || textLow.includes('cómo llegar') || textLow.includes('address')) {
    score += 1.5
  } else {
    flags.push({ label: 'Sin información de ubicación estructurada', severity: 'medium' })
  }

  // Horarios
  if (schema.includes('openingHours') || schema.includes('OpeningHoursSpecification')) {
    score += 1.5
  } else {
    flags.push({ label: 'Sin horarios declarados — pregunta frecuente de usuarios', severity: 'high' })
  }

  // Contacto estructurado
  if (schema.includes('telephone') || schema.includes('email') || textLow.includes('contacto') || textLow.includes('whatsapp')) {
    score += 1
  } else {
    flags.push({ label: 'Sin información de contacto estructurada', severity: 'medium' })
  }

  return {
    score: parseFloat(Math.min(score, 10).toFixed(2)),
    flags,
    label: score >= 7 ? 'Buena' : score >= 4 ? 'Media' : 'Crítica'
  }
}

// ════════ DIMENSIÓN 5: CONFIANZA ══════════════════════════
function scoreConfianza(extracted, sector) {
  let score = 0
  const flags = []

  const schema  = extracted.schema_org || ''
  const text    = (extracted.meta_desc || '') + ' ' +
                  (extracted.headings || []).join(' ') + ' ' +
                  (extracted.meta_title || '')
  const textLow = text.toLowerCase()

  // Person/author declarado
  if (schema.includes('Person') || schema.includes('author') || schema.includes('founder')) {
    score += 2
  } else {
    flags.push({ label: 'Sin autor/persona declarada en schema', severity: 'medium' })
  }

  // Organization declarada
  if (schema.includes('Organization') || schema.includes('LocalBusiness') || schema.includes('Corporation')) {
    score += 2
  } else {
    flags.push({ label: 'Sin Organization/LocalBusiness en schema', severity: 'critical' })
  }

  // Política de privacidad / términos
  if (textLow.includes('privacidad') || textLow.includes('términos') || textLow.includes('política') || textLow.includes('privacy')) {
    score += 1.5
  } else {
    flags.push({ label: 'Sin menciones de política de privacidad o términos', severity: 'medium' })
  }

  // Certificaciones o licencias
  if (textLow.includes('licencia') || textLow.includes('registro') || textLow.includes('certificación') || textLow.includes('habilitado') || textLow.includes('autorizado')) {
    score += 1.5
  } else {
    flags.push({ label: 'Sin certificaciones o licencias mencionadas', severity: 'low' })
  }

  // Fecha de fundación o antigüedad
  if (schema.includes('foundingDate') || textLow.includes('fundad') || textLow.includes('desde 19') || textLow.includes('desde 20')) {
    score += 1.5
  } else {
    flags.push({ label: 'Sin fecha de fundación o antigüedad declarada', severity: 'low' })
  }

  // NIT / RUT (empresas colombianas)
  if (textLow.includes('nit') || textLow.includes('rut') || textLow.includes('cámara de comercio')) {
    score += 1.5
  } else {
    flags.push({ label: 'Sin NIT/RUT visible — señal de confianza para Colombia', severity: 'medium' })
  }

  return {
    score: parseFloat(Math.min(score, 10).toFixed(2)),
    flags,
    label: score >= 7 ? 'Alta' : score >= 4 ? 'Media' : 'Baja'
  }
}

// ════════ BADGE LEVEL ═════════════════════════════════════
function getBadgeLevel(globalScore) {
  if (globalScore >= 90) return 'platinum'
  if (globalScore >= 75) return 'gold'
  if (globalScore >= 60) return 'silver'
  if (globalScore >= 45) return 'bronze'
  return 'none'
}

// ════════ FUNCIÓN PRINCIPAL ═══════════════════════════════
export function scorePulsia(extracted, sector = 'general') {
  const weights = SECTOR_WEIGHTS[sector] || SECTOR_WEIGHTS.general

  const semantica      = scoreSemantica(extracted, sector)
  const autoridad      = scoreAutoridad(extracted)
  const tecnica        = scoreTecnica(extracted, sector)
  const conversacional = scoreConversacional(extracted, sector)
  const confianza      = scoreConfianza(extracted, sector)

  // Score global ponderado (0-100)
  const globalRaw =
    semantica.score      * weights.semantic      * 10 +
    autoridad.score      * weights.authority     * 10 +
    tecnica.score        * weights.technical     * 10 +
    conversacional.score * weights.conversation  * 10 +
    confianza.score      * weights.trust         * 10

  const globalScore = parseFloat(Math.min(100, Math.max(0, globalRaw)).toFixed(1))

  const allFlags = [
    ...(autoridad.flags      || []),
    ...(conversacional.flags || []),
    ...(confianza.flags      || []),
    ...(tecnica.flags        || [])
  ]

  const topPriorities = allFlags
    .filter(f => f.severity === 'critical' || f.severity === 'high')
    .slice(0, 5)

  return {
    pulsia_score: globalScore,
    badge_level:  getBadgeLevel(globalScore),

    dimensions: {
      semantica:      { score: semantica.score,      label: semantica.label,      weight: `${Math.round(weights.semantic * 100)}%` },
      autoridad:      { score: autoridad.score,      label: autoridad.label,      weight: `${Math.round(weights.authority * 100)}%` },
      tecnica:        { score: tecnica.score,        label: tecnica.label,        weight: `${Math.round(weights.technical * 100)}%` },
      conversacional: { score: conversacional.score, label: conversacional.label, weight: `${Math.round(weights.conversation * 100)}%` },
      confianza:      { score: confianza.score,      label: confianza.label,      weight: `${Math.round(weights.trust * 100)}%` }
    },

    details: {
      semantica,
      autoridad,
      tecnica,
      conversacional,
      confianza
    },

    flags:          allFlags,
    top_priorities: topPriorities,

    // Compatibilidad con sistema anterior
    score:          globalScore,
    combined_score: globalScore
  }
}