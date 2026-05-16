// src/query-engine/generator.js

const QUERY_TEMPLATES = {
  transactional: [
    'mejor {categoria} en {ciudad}',
    '{categoria} recomendado en {ciudad}',
    'cual es el mejor {categoria} en {ciudad}',
    'donde encontrar {categoria} en {ciudad}',
    'recomienda un {categoria} en {ciudad}',
    'necesito un {categoria} en {ciudad} cual me recomiendas',
    'busco {categoria} en {ciudad}',
  ],
  comparative: [
    'mejores {categoria} en {ciudad}',
    'comparar {categoria} en {ciudad}',
    '{marca} vs otras opciones',
    'alternativas a {marca}',
    'top 5 {categoria} en {ciudad}',
    'cual es el {categoria} mas reconocido en {ciudad}',
  ],
  informational: [
    'como elegir un {categoria} en {ciudad}',
    'que caracteristicas debe tener un buen {categoria}',
    'cuanto cuesta un {categoria} en {ciudad}',
    'donde buscar {categoria} confiable en {ciudad}',
  ],
  branded: [
    '{marca}',
    '{marca} {ciudad}',
    '{marca} opiniones',
    '{marca} servicios',
    'es bueno {marca}',
    'que es {marca}',
    'informacion sobre {marca}',
    '{marca} como funciona',
  ],
  generic: [
    '{categoria} en {ciudad}',
    'top {categoria} {ciudad}',
    'mejores {categoria} Colombia',
    'listado de {categoria} en {ciudad}',
  ]
}

const SECTOR_CONFIG = {
  health: {
    categories: [
      'clinica medica',
      'centro medico',
      'consultorio medico',
      'hospital privado',
      'medico especialista',
    ],
    extra_queries: [
      'donde atenderse medicamente en {ciudad}',
      'mejor clinica privada en {ciudad}',
      'centro de salud recomendado en {ciudad}',
      'medico de confianza en {ciudad}',
      'donde hacer examenes medicos en {ciudad}',
    ]
  },
  real_estate: {
    categories: [
      'inmobiliaria',
      'agencia de finca raiz',
      'agencia de bienes raices',
      'apartamentos en venta',
      'casas en venta',
    ],
    extra_queries: [
      'donde comprar apartamento en {ciudad}',
      'mejor inmobiliaria en {ciudad}',
      'agencia para arrendar en {ciudad}',
      'finca raiz recomendada en {ciudad}',
      'donde invertir en propiedad en {ciudad}',
    ]
  },
  restaurant: {
    categories: [
      'restaurante',
      'lugar para comer',
      'donde comer bien',
      'comida tipica colombiana',
      'restaurante familiar',
    ],
    extra_queries: [
      'donde comer en {ciudad}',
      'mejor restaurante en {ciudad}',
      'restaurante romantico en {ciudad}',
      'comida para llevar en {ciudad}',
      'donde comer en familia en {ciudad}',
      'restaurante para almorzar en {ciudad}',
    ]
  },
  hotel: {
    categories: [
      'hotel',
      'hospedaje',
      'alojamiento',
      'donde hospedarse',
      'hotel boutique',
    ],
    extra_queries: [
      'donde quedarse en {ciudad}',
      'mejor hotel en {ciudad}',
      'hotel economico en {ciudad}',
      'hotel con desayuno incluido en {ciudad}',
      'alojamiento recomendado en {ciudad}',
      'hotel para viaje de negocios en {ciudad}',
    ]
  },
  media: {
    categories: [
      'periodico',
      'medio de comunicacion',
      'portal de noticias',
      'revista digital',
      'noticiero',
    ],
    extra_queries: [
      'donde leer noticias de {ciudad}',
      'mejor periodico colombiano',
      'noticias Colombia online',
      'portal de noticias confiable Colombia',
      'donde informarme sobre Colombia',
      'medio de comunicacion reconocido Colombia',
    ]
  },
  ecommerce: {
    categories: [
      'tienda online',
      'tienda virtual',
      'donde comprar online',
      'marketplace Colombia',
      'plataforma de compras',
    ],
    extra_queries: [
      'donde comprar por internet en Colombia',
      'tienda online confiable Colombia',
      'mejor plataforma para comprar en Colombia',
      'donde comprar {marca} en Colombia',
      'tienda virtual recomendada Colombia',
    ]
  },
  education: {
    categories: [
      'universidad',
      'colegio',
      'instituto educativo',
      'plataforma educativa',
      'curso online',
    ],
    extra_queries: [
      'donde estudiar en {ciudad}',
      'mejor universidad en {ciudad}',
      'cursos online recomendados Colombia',
      'donde aprender {categoria} en Colombia',
      'instituto de educacion superior en {ciudad}',
    ]
  },
  legal: {
    categories: [
      'abogado',
      'firma de abogados',
      'consultoria legal',
      'estudio juridico',
      'asesor legal',
    ],
    extra_queries: [
      'donde conseguir abogado en {ciudad}',
      'mejor firma legal en {ciudad}',
      'asesor juridico recomendado en {ciudad}',
      'abogado confiable en {ciudad}',
      'consultoria legal en {ciudad}',
    ]
  },
  general: {
    categories: [
      'empresa',
      'negocio',
      'servicio profesional',
      'empresa reconocida',
      'empresa colombiana',
    ],
    extra_queries: [
      'empresas reconocidas en {ciudad}',
      'mejores empresas de Colombia',
      'empresa confiable en {ciudad}',
      'donde contratar servicios en {ciudad}',
      'empresas recomendadas en {ciudad}',
    ]
  }
}

const INTENT_WEIGHTS = {
  transactional:  3,
  comparative:    2,
  branded:        2,
  informational:  1,
  generic:        1,
  extra:          3
}

function fillTemplate(template, { brand, categoria, city }) {
  return template
    .replace(/\{marca\}/g,     brand)
    .replace(/\{categoria\}/g, categoria)
    .replace(/\{ciudad\}/g,    city)
}

export function generateQueries({ brand, sector, city = 'Colombia', limit = 60 }) {
  const config     = SECTOR_CONFIG[sector] || SECTOR_CONFIG.general
  const categories = config.categories
  const queries    = []
  const seen       = new Set()

  function addQuery(text, intent) {
    const key = text.toLowerCase().trim()
    if (seen.has(key) || queries.length >= limit) return
    seen.add(key)
    queries.push({ text, intent, weight: INTENT_WEIGHTS[intent] || 1, sector, city, brand })
  }

  // 1. Branded queries primero (más importantes)
  for (const template of QUERY_TEMPLATES.branded) {
    const text = fillTemplate(template, { brand, categoria: categories[0], city })
    addQuery(text, 'branded')
  }

  // 2. Extra queries específicas del sector
  for (const template of (config.extra_queries || [])) {
    const text = fillTemplate(template, { brand, categoria: categories[0], city })
    addQuery(text, 'extra')
  }

  // 3. Transactional por cada categoría del sector
  for (const categoria of categories) {
    for (const template of QUERY_TEMPLATES.transactional) {
      addQuery(fillTemplate(template, { brand, categoria, city }), 'transactional')
    }
  }

  // 4. Comparative
  for (const categoria of categories) {
    for (const template of QUERY_TEMPLATES.comparative) {
      addQuery(fillTemplate(template, { brand, categoria, city }), 'comparative')
    }
  }

  // 5. Informational
  for (const categoria of categories) {
    for (const template of QUERY_TEMPLATES.informational) {
      addQuery(fillTemplate(template, { brand, categoria, city }), 'informational')
    }
  }

  // 6. Generic de relleno
  for (const categoria of categories) {
    for (const template of QUERY_TEMPLATES.generic) {
      addQuery(fillTemplate(template, { brand, categoria, city }), 'generic')
    }
  }

  return queries.slice(0, limit)
}