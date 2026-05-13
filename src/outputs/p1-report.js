export function generateReport(url, score, flags, sector, entityDensity = {}, rar = {}) {
  const critical = flags.filter(f => f.severity === 'critical')
  const medium   = flags.filter(f => f.severity === 'medium')
  const low      = flags.filter(f => f.severity === 'low')

  return {
    revenue_at_risk: {
      headline:        rar.headline        || '',
      annual_headline: rar.annual_headline || '',
      monthly_range: {
        conservative: rar.monthly_conservative || 0,
        optimistic:   rar.monthly_optimistic   || 0
      },
      annual_range: {
        conservative: rar.annual_conservative || 0,
        optimistic:   rar.annual_optimistic   || 0
      },
      invisible_leads: rar.invisible_leads || 0,
      risk_factor_pct: rar.risk_factor_pct || 0
    },

    diagnosis: {
      site:    url,
      sector,
      score,
      verdict: score >= 7 ? 'Critico' : score >= 4 ? 'Mejorable' : 'Aceptable',
      summary: `Tu sitio tiene ${critical.length} problemas críticos, ${medium.length} medios y ${low.length} menores que te hacen invisible para las IAs.`
    },

    entity_map: {
      density_label:    entityDensity.density_label    || 'Sin datos',
      entities_present: entityDensity.entities_present || 0,
      entities_total:   entityDensity.entities_total   || 0,
      present: (entityDensity.present || []).map(e => ({
        status: 'OK',
        label:  e.label
      })),
      missing: (entityDensity.missing || []).map(e => ({
        status:  'FALTANTE',
        label:   e.label,
        impacto: 'Las IAs no pueden identificar ni recomendar este aspecto de tu negocio'
      }))
    },

    technical_issues: {
      critical: critical.map(f => ({
        problema: f.label,
        impacto:  'No apareces en búsquedas de IA'
      })),
      medium: medium.map(f => ({
        problema: f.label,
        impacto:  'Visibilidad reducida en buscadores'
      })),
      low: low.map(f => ({
        problema: f.label,
        impacto:  'Oportunidad de mejora menor'
      }))
    },

    solution: {
      recommended_product: score >= 7
        ? 'P2 — JSON-LD + Schema completo ($99)'
        : 'P1 — Auditoria detallada ($49)',
      roi_message: rar.monthly_conservative
        ? `Con una inversion de $99 USD recuperas el equivalente a ${Math.round((99 / rar.monthly_conservative) * 100)}% de tu RAR mensual en el primer mes.`
        : '',
      next_step: 'Responde este mensaje para recibir la solucion en menos de 24h'
    },

    generated_at: new Date().toISOString()
  }
}