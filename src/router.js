export function routeProduct(score) {
  if (score >= 7)   return { product: 'P2', reason: 'Múltiples problemas críticos detectados' }
  if (score >= 4.5) return { product: 'P1', reason: 'Problemas medios, buen candidato para auditoría' }
  if (score >= 2)   return { product: 'P1', reason: 'Pocos problemas, auditoría como entrada' }
  return              { product: null,  reason: 'Sitio bien optimizado, no es prospecto ideal' }
}