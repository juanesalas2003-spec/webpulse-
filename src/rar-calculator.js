// =============================================
// RAR-IA CALCULATOR — Revenue at Risk por IA
// Calcula el dinero que el cliente pierde
// por no aparecer en búsquedas de IA
// =============================================

const SECTOR_BENCHMARKS = {
  health: {
    monthly_searches: 2500,
    ai_usage_pct:     0.30,
    intent_pct:       0.10,
    booking_pct:      0.40,
    ticket_usd:       200,
    close_pct:        0.55,
    label:            'Clínica / Salud'
  },
  real_estate: {
    monthly_searches: 5000,
    ai_usage_pct:     0.25,
    intent_pct:       0.08,
    booking_pct:      0.30,
    ticket_usd:       2500,
    close_pct:        0.20,
    label:            'Inmobiliaria'
  },
  restaurant: {
    monthly_searches: 8000,
    ai_usage_pct:     0.35,
    intent_pct:       0.15,
    booking_pct:      0.60,
    ticket_usd:       40,
    close_pct:        0.70,
    label:            'Restaurante'
  },
  hotel: {
    monthly_searches: 2000,
    ai_usage_pct:     0.40,
    intent_pct:       0.12,
    booking_pct:      0.45,
    ticket_usd:       180,
    close_pct:        0.55,
    label:            'Hotel / Hospedaje'
  },
  general: {
    monthly_searches: 3000,
    ai_usage_pct:     0.25,
    intent_pct:       0.08,
    booking_pct:      0.35,
    ticket_usd:       150,
    close_pct:        0.45,
    label:            'Negocio Local'
  }
}

export function calculateRAR(sector = 'general', score = 5, customData = {}) {
  const bench = { ...SECTOR_BENCHMARKS[sector] || SECTOR_BENCHMARKS.general, ...customData }

  // Factor de riesgo basado en el score del audit
  // Score 10 = 100% invisible, Score 0 = 0% invisible
  const riskFactor = score / 10

  // Cálculo base
  const aiConsults     = bench.monthly_searches * bench.ai_usage_pct
  const intentLeads    = aiConsults * bench.intent_pct
  const invisibleLeads = Math.round(intentLeads * riskFactor)

  // Conversión a dinero
  const bookings = invisibleLeads * bench.booking_pct
  const sales    = bookings * bench.close_pct
  const revenue  = sales * bench.ticket_usd

  // Rango conservador (70%) y optimista (130%)
  const conservative = Math.round(revenue * 0.70)
  const optimistic   = Math.round(revenue * 1.30)
  const annual_conservative = conservative * 12
  const annual_optimistic   = optimistic   * 12

  return {
    sector:            bench.label,
    score,
    risk_factor_pct:   Math.round(riskFactor * 100),

    // Leads
    ai_consults_monthly:  Math.round(aiConsults),
    intent_leads_monthly: Math.round(intentLeads),
    invisible_leads:      invisibleLeads,

    // Revenue mensual
    monthly_conservative: conservative,
    monthly_optimistic:   optimistic,

    // Revenue anual
    annual_conservative,
    annual_optimistic,

    // Mensaje listo para usar en reporte y Brain
    headline: `Estás perdiendo entre $${conservative.toLocaleString()} y $${optimistic.toLocaleString()} USD al mes porque no apareces en búsquedas de IA.`,
    annual_headline: `Eso equivale a $${annual_conservative.toLocaleString()} – $${annual_optimistic.toLocaleString()} USD al año en ventas no capturadas.`,

    // ROI del producto
    roi: {
      P1: { price: 49,  payback_days: Math.round((49  / revenue) * 30) },
      P2: { price: 99,  payback_days: Math.round((99  / revenue) * 30) },
      P3: { price: 899, payback_days: Math.round((899 / revenue) * 30) },
      P4: { price: 200, note: 'Recurrente — ' + Math.round((200 / revenue) * 100) + '% del RAR mensual' }
    }
  }
}