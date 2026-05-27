// =============================================
// PULSIA SCORER — Score multicapa 5 dimensiones
// Reemplaza el score simple de Webpulse
// =============================================

import { scoreAudit }         from './scorer.js'
import { scoreEntityDensity } from './entity-density.js'

// ─── PESOS POR SECTOR ────────────────────────
const SECTOR_WEIGHTS = {
  health:      { semantic: 0.30, authority: 0.25, technical: 0.20, conversation: 0.15, trust: 0.10 },
  real_estate: { semantic: 0.28, authority: 0.27, technical: 0.20, conversation: 0.13, trust: 0.12 },
  restaurant:  { semantic: 0.25, authority: 0.20, technical: 0.20, conversation: 0.20, trust: 0.15 },
  hotel:       { semantic: 0.25, authority: 0.22, technical: 0.20, conversation: 0.18, trust: 0.15 },
  general:     { semantic: 0.30, authority: 0.25, technical: 0.20, conversation: 0.15, trust: 0.10 }
}

// ─── DIMENSIÓN 1: SEMÁNTICA ───────────────────
// Basada en entity-density.js (ya existente)
function scoreSemantica(extracted, sector) {
  const ed = scoreEntityDensity(extracted.schema_org, sector)
  // Invertir: más entidades presentes = score más alto
  const ratio = ed.entities_present / ed.entities_total
  return {
    score:   parseFloat((ratio * 10).toFixed(2)),
    details: {
      entities_present: ed.entities_present,
      entities_total:   ed.entities_total,
      missing:          ed.missing,
      label:            ratio >= 0.7 ? 'Buena' : ratio >= 0.4 ? 'Media' : 'Crítica'
    }
  }
}

// ─── DIMENSIÓN 2: AUTORIDAD ───────────────────
// Señales de autoridad: reviews, social, mentions, backlinks
function scoreAutoridad(extracted) {
  let score  = 0
  const flags = []

  const schema = extracted.schema_org || ''
  const text   = (extracted.meta_desc || '') + ' ' + (extracted.headings || []).join(' ')

  // AggregateRating presente
  if (schema.includes('AggregateRating') || schema.includes('aggregateRating')) {
    score += 2.5
  } else {
    flags.push({ label: 'Sin AggregateRating en schema', severity: 'critical' })
  }

  // ratingValue presente
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

  // Menciones de premios, certificaciones en texto
  const trustWords = ['premio', 'certificado', 'reconocido', 'award', 'certified', 'acreditado', 'años de experiencia', 'fundado en']
  const trustFound = trustWords.filter(w => text.toLowerCase().includes(w))
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
    score:   parseFloat(Math.min(score, 10).toFixed(2)),
    flags,
    label:   score >= 7 ? 'Alta' : score >= 4 ? 'Media' : 'Baja'
  }
}

// ─── DIMENSIÓN 3: TÉCNICA ────────────────────
// Basada en scorer.js (ya existente) — adaptada
function scoreTecnica(extracted, sector) {
  const { score: rawScore, flags } = scoreAudit(extracted, sector)
  // Invertir: más problemas = score más bajo
  const techScore = parseFloat(Math.max(0, 10 - rawScore).toFixed(2))
  return {
    score: techScore,
    flags,
    label: techScore >= 7 ? 'Buena' : techScore >= 4 ? 'Media' : 'Crítica'
  }
}

// ─── DIMENSIÓN 4: CONVERSACIONAL ─────────────
// Cobertura de preguntas que hacen las IAs
function scoreConversacional(extracted, sector) {
  let score  = 0
  const flags = []

  const schema  = extracted.schema_org || ''
  const text    = (extracted.meta_desc || '') + ' ' +
                  (extracted.headings || []).join(' ') + ' ' +
                  (extracted.meta_title || '')
  const textLow = text.toLowerCase()

  // FAQ schema presente
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
  if (schema.includes('price') || schema.includes('priceRange') || textLow.includes('precio') || textLow.includes('tarifa')) {
    score += 1.5
  } else {
    flags.push({ label: 'Sin información de precios — pregunta frecuente de usuarios', severity: 'high' })
  }

  // Ubicación / cómo llegar
  if (schema.includes('GeoCoordinates') || textLow.includes('dirección') || textLow.includes('ubicación') || textLow.includes('cómo llegar')) {
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

  // Contacto
  if (schema.includes('telephone') || schema.includes('email') || textLow.includes('whatsapp') || textLow.includes('contacto')) {
    score += 1
  } else {
    flags.push({ label: 'Sin información de contacto estructurada', severity: 'medium' })
  }

  return {
    score:   parseFloat(Math.min(score, 10).toFixed(2)),
    flags,
    label:   score >= 7 ? 'Buena' : score >= 4 ? 'Media' : 'Crítica'
  }
}

// ─── DIMENSIÓN 5: CONFIANZA ───────────────────
// Señales E-E-A-T para motores de IA
function scoreConfianza(extracted, sector) {
  let score  = 0
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
    flags.push({ label: 'Sin personas/autores declarados como entidades', severity: 'medium' })
  }

  // Dirección completa
  if (schema.includes('PostalAddress') || schema.includes('streetAddress')) {
    score += 2
  } else {
    flags.push({ label: 'Sin dirección postal estructurada', severity: 'high' })
  }

  // Teléfono
  if (schema.includes('telephone')) {
    score += 1.5
  } else {
    flags.push({ label: 'Sin teléfono en schema', severity: 'medium' })
  }

  // Política de privacidad / términos
  if (textLow.includes('privacidad') || textLow.includes('términos') || textLow.includes('política')) {
    score += 1.5
  } else {
    flags.push({ label: 'Sin menciones de política de privacidad o términos', severity: 'low' })
  }

  // SSL / HTTPS (inferido de la URL)
  if (extracted.url && extracted.url.startsWith('https://')) {
    score += 1.5
  } else {
    flags.push({ label: 'Sin HTTPS — señal negativa de confianza', severity: 'critical' })
  }

  // Fecha de fundación o años de experiencia
  if (schema.includes('foundingDate') || textLow.includes('fundada') || textLow.includes('años') || textLow.includes('desde')) {
    score += 1.5
  } else {
    flags.push({ label: 'Sin fecha de fundación o años de experiencia declarados', severity: 'low' })
  }

  return {
    score:   parseFloat(Math.min(score, 10).toFixed(2)),
    flags,
    label:   score >= 7 ? 'Alta' : score >= 4 ? 'Media' : 'Baja'
  }
}

// ─── BADGE LEVEL ─────────────────────────────
function getBadgeLevel(globalScore) {
  if (globalScore >= 90) return 'platinum'
  if (globalScore >= 75) return 'gold'
  if (globalScore >= 60) return 'silver'
  if (globalScore >= 45) return 'bronze'
  return 'none'
}

// ─── FUNCIÓN PRINCIPAL ────────────────────────
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

  const globalScore = Math.round(Math.min(globalRaw, 100))

  // Todos los flags combinados
  const allFlags = [
    ...tecnica.flags,
    ...autoridad.flags,
    ...conversacional.flags,
    ...confianza.flags,
    ...(semantica.details.missing || []).map(m => ({ label: m.label, severity: m.severity || 'high' }))
  ]

  // Prioridad de mejora (ordenados por impacto)
  const topPriorities = allFlags
    .filter(f => f.severity === 'critical' || f.severity === 'high')
    .slice(0, 5)

  return {
    // Score global 0-100
    pulsia_score: globalScore,
    badge_level:  getBadgeLevel(globalScore),

    // 5 dimensiones 0-10
    dimensions: {
      semantica:      { score: semantica.score,      label: semantica.details.label,   weight: `${Math.round(weights.semantic * 100)}%` },
      autoridad:      { score: autoridad.score,      label: autoridad.label,           weight: `${Math.round(weights.authority * 100)}%` },
      tecnica:        { score: tecnica.score,        label: tecnica.label,             weight: `${Math.round(weights.technical * 100)}%` },
      conversacional: { score: conversacional.score, label: conversacional.label,      weight: `${Math.round(weights.conversation * 100)}%` },
      confianza:      { score: confianza.score,      label: confianza.label,           weight: `${Math.round(weights.trust * 100)}%` }
    },

    // Detalles por dimensión
    details: {
      semantica,
      autoridad,
      tecnica,
      conversacional,
      confianza
    },

    // Todos los flags
    flags: allFlags,

    // Top 5 prioridades de mejora
    top_priorities: topPriorities,

    // Compatibilidad con sistema anterior
    legacy_score: tecnica.score,
    flags_count:  allFlags.length,
    critical_count: allFlags.filter(f => f.severity === 'critical').length
  }
}
