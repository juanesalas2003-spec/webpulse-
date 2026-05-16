// src/query-engine/generator.js

const QUERY_TEMPLATES = {
  transactional: [
    'mejor {categoria} en {ciudad}',
    '{categoria} recomendado en {ciudad}',
    'cual es el mejor {categoria} en {ciudad}',
    'donde encontrar {categoria} en {ciudad}',
    '{categoria} bueno en {ciudad}',
    'recomienda un {categoria} en {ciudad}',
  ],
  comparative: [
    'comparar {categoria} en {ciudad}',
    '{marca} vs otras opciones en {ciudad}',
    'alternativas a {marca}',
    'mejores {categoria} comparados en {ciudad}',
  ],
  informational: [
    'como elegir {categoria} en {ciudad}',
    'que preguntar a un {categoria}',
    'caracteristicas de un buen {categoria}',
    'que buscar en un {categoria} en {ciudad}',
  ],
  branded: [
    '{marca}',
    '{marca} {ciudad}',
    '{marca} opiniones',
    '{marca} servicios',
    'es confiable {marca}',
    'informacion sobre {marca}',
  ],
  generic: [
    '{categoria} {ciudad}',
    '{categoria} Colombia',
    'top {categoria} {ciudad}',
    'listado de {categoria} en {ciudad}',
  ]
}

const SECTOR_CATEGORIES = {
  health:      ['clinica', 'medico', 'consultorio', 'centro medico', 'hospital'],
  real_estate: ['inmobiliaria', 'agencia inmobiliaria', 'apartamentos en venta', 'finca raiz'],
  restaurant:  ['restaurante', 'lugar para comer', 'comida', 'donde comer'],
  hotel:       ['hotel', 'hospedaje', 'alojamiento', 'donde quedarse'],
  general:     ['empresa', 'negocio', 'servicio', 'compania']
}

const INTENT_WEIGHTS = {
  transactional:  3,
  comparative:    2,
  branded:        2,
  informational:  1,
  generic:        1
}

export function generateQueries({ brand, sector, city = 'Colombia', limit = 60 }) {
  const categories = SECTOR_CATEGORIES[sector] || SECTOR_CATEGORIES.general
  const queries    = []

  for (const [intent, templates] of Object.entries(QUERY_TEMPLATES)) {
    for (const template of templates) {
      for (const categoria of categories) {
        const text = template
          .replace(/\{marca\}/g,     brand)
          .replace(/\{categoria\}/g, categoria)
          .replace(/\{ciudad\}/g,    city)

        queries.push({
          text,
          intent,
          weight:  INTENT_WEIGHTS[intent],
          sector,
          city,
          brand
        })

        if (queries.length >= limit) return queries
      }
    }
  }

  return queries
}