// =============================================
// PULSIA SEMANTIC LAYER GENERATOR
// Genera JSON-LD, TXT y XML optimizados para IA
// =============================================

const SECTOR_TYPES = {
  health:      ['MedicalBusiness', 'LocalBusiness'],
  real_estate: ['RealEstateAgent', 'LocalBusiness'],
  restaurant:  ['Restaurant', 'FoodEstablishment', 'LocalBusiness'],
  hotel:       ['LodgingBusiness', 'Hotel', 'LocalBusiness'],
  media:       ['NewsMediaOrganization', 'Organization'],
  ecommerce:   ['Store', 'LocalBusiness'],
  education:   ['EducationalOrganization', 'LocalBusiness'],
  legal:       ['LegalService', 'LocalBusiness'],
  general:     ['LocalBusiness', 'Organization']
}

const SECTOR_SPECIALTIES = {
  health:      { medicalSpecialty: 'General Practice' },
  real_estate: { areaServed: '', knowsAbout: ['Compra de propiedades', 'Venta de propiedades', 'Arriendo'] },
  restaurant:  { servesCuisine: '', hasMenu: '', acceptsReservations: true },
  hotel:       { amenityFeature: [], starRating: { '@type': 'Rating', ratingValue: '' } },
  media:       { publishingPrinciples: '', masthead: '' },
  education:   { educationalCredentialAwarded: '', hasCredential: '' },
  legal:       { knowsAbout: ['Derecho Civil', 'Derecho Comercial', 'Consultoría Legal'] },
  general:     {}
}

// ─── JSON-LD GENERATOR ───────────────────────
export function generateJsonLD(extracted, sector = 'general', domain = '') {
  const types    = SECTOR_TYPES[sector] || SECTOR_TYPES.general
  const specialty = SECTOR_SPECIALTIES[sector] || {}

  const name = extracted.meta_title
    ? extracted.meta_title.replace(/\s*[-|].*$/, '').trim()
    : domain.replace(/^www\./, '').split('.')[0]

  const jsonld = {
    '@context': 'https://schema.org',
    '@type': types.length === 1 ? types[0] : types,

    // ── Identidad ──────────────────────────────
    'name':        name,
    'description': extracted.meta_desc || `${name} — servicios profesionales en Colombia`,
    'url':         `https://${domain}`,

    // ── Imagen y marca ─────────────────────────
    ...(extracted.og_image ? { 'image': { '@type': 'ImageObject', 'url': extracted.og_image, 'description': `Logo o imagen principal de ${name}` } } : {}),

    // ── Contacto y ubicación ───────────────────
    'address': {
      '@type':           'PostalAddress',
      'addressCountry':  'CO',
      'addressLocality': '',
      'streetAddress':   ''
    },
    'telephone': '',
    'email':     '',

    // ── Redes sociales ─────────────────────────
    'sameAs': [],

    // ── Horarios ───────────────────────────────
    'openingHoursSpecification': [
      {
        '@type':     'OpeningHoursSpecification',
        'dayOfWeek': ['Monday','Tuesday','Wednesday','Thursday','Friday'],
        'opens':     '08:00',
        'closes':    '18:00'
      }
    ],

    // ── Reputación ─────────────────────────────
    'aggregateRating': {
      '@type':       'AggregateRating',
      'ratingValue': '',
      'reviewCount': '',
      'bestRating':  '5',
      'worstRating': '1'
    },

    // ── Fundación ──────────────────────────────
    'foundingDate': '',
    'founder': {
      '@type': 'Person',
      'name':  ''
    },

    // ── Área de servicio ───────────────────────
    'areaServed': {
      '@type': 'Country',
      'name':  'Colombia'
    },

    // ── Especialidades del sector ──────────────
    ...specialty,

    // ── FAQ (crítico para IA) ──────────────────
    'mainEntity': generateFAQ(name, sector),

    // ── Potencial de acción ────────────────────
    'potentialAction': {
      '@type':  'ContactAction',
      'name':   `Contactar a ${name}`,
      'target': `https://${domain}/contacto`
    }
  }

  // Agregar campos específicos por sector
  if (sector === 'restaurant') {
    jsonld['hasMenu'] = `https://${domain}/menu`
    jsonld['servesCuisine'] = ''
    jsonld['priceRange'] = '$$'
  }

  if (sector === 'hotel') {
    jsonld['checkinTime'] = '15:00'
    jsonld['checkoutTime'] = '12:00'
    jsonld['numberOfRooms'] = ''
  }

  if (sector === 'health') {
    jsonld['availableService'] = {
      '@type':       'MedicalProcedure',
      'name':        'Consulta médica general',
      'procedureType': 'Noninvasive'
    }
  }

  if (sector === 'real_estate') {
    jsonld['hasOfferCatalog'] = {
      '@type': 'OfferCatalog',
      'name':  'Propiedades disponibles',
      'itemListElement': []
    }
  }

  return JSON.stringify(jsonld, null, 2)
}

// ─── FAQ GENERATOR ───────────────────────────
function generateFAQ(name, sector) {
  const faqs = {
    health: [
      { q: `¿Qué servicios médicos ofrece ${name}?`, a: `${name} ofrece consultas médicas generales y especializadas. Complete este campo con sus especialidades específicas.` },
      { q: `¿Cómo puedo agendar una cita en ${name}?`, a: `Puede agendar su cita llamando a nuestro número o a través de nuestro sitio web.` },
      { q: `¿${name} acepta seguros médicos?`, a: `Complete este campo con la información sobre convenios y seguros aceptados.` },
      { q: `¿Cuáles son los horarios de atención de ${name}?`, a: `Atendemos de lunes a viernes de 8:00 AM a 6:00 PM.` }
    ],
    real_estate: [
      { q: `¿Qué tipo de propiedades maneja ${name}?`, a: `${name} maneja propiedades residenciales y comerciales para compra, venta y arriendo.` },
      { q: `¿Cómo puedo contactar a ${name} para ver una propiedad?`, a: `Puede contactarnos por teléfono, WhatsApp o visitar nuestras oficinas.` },
      { q: `¿${name} cobra comisión por sus servicios?`, a: `Complete este campo con su política de comisiones.` },
      { q: `¿En qué zonas opera ${name}?`, a: `Complete este campo con las zonas de operación.` }
    ],
    restaurant: [
      { q: `¿Qué tipo de cocina ofrece ${name}?`, a: `Complete este campo con el tipo de cocina que sirven.` },
      { q: `¿${name} tiene servicio a domicilio?`, a: `Complete este campo con información sobre domicilios.` },
      { q: `¿Cuál es el precio promedio en ${name}?`, a: `Complete este campo con el rango de precios.` },
      { q: `¿${name} acepta reservaciones?`, a: `Sí, puede hacer su reserva llamándonos o a través de nuestro sitio web.` }
    ],
    hotel: [
      { q: `¿Qué servicios incluye la estadía en ${name}?`, a: `Complete este campo con los servicios incluidos.` },
      { q: `¿Cuál es el proceso de check-in en ${name}?`, a: `El check-in es a partir de las 3:00 PM y el check-out hasta las 12:00 PM.` },
      { q: `¿${name} tiene parqueadero?`, a: `Complete este campo con información sobre parqueadero.` },
      { q: `¿Cómo puedo hacer una reserva en ${name}?`, a: `Puede reservar directamente en nuestro sitio web o llamándonos.` }
    ],
    general: [
      { q: `¿Qué servicios ofrece ${name}?`, a: `Complete este campo con la descripción de sus servicios principales.` },
      { q: `¿Cómo puedo contactar a ${name}?`, a: `Puede contactarnos por teléfono, email o visitando nuestras instalaciones.` },
      { q: `¿Cuál es el horario de atención de ${name}?`, a: `Atendemos de lunes a viernes de 8:00 AM a 6:00 PM.` },
      { q: `¿Dónde está ubicado ${name}?`, a: `Complete este campo con la dirección exacta.` }
    ]
  }

  const selectedFaqs = (faqs[sector] || faqs.general).map(item => ({
    '@type': 'Question',
    'name':  item.q,
    'acceptedAnswer': {
      '@type': 'Answer',
      'text':  item.a
    }
  }))

  return {
    '@type':           'FAQPage',
    'mainEntity':      selectedFaqs
  }
}

// ─── TXT GENERATOR (para IAs como ChatGPT) ───
export function generateTXT(extracted, sector = 'general', domain = '') {
  const name = extracted.meta_title
    ? extracted.meta_title.replace(/\s*[-|].*$/, '').trim()
    : domain.replace(/^www\./, '').split('.')[0]

  const sectorLabel = {
    health: 'centro médico / clínica',
    real_estate: 'agencia inmobiliaria',
    restaurant: 'restaurante',
    hotel: 'hotel / hospedaje',
    media: 'medio de comunicación',
    ecommerce: 'tienda online',
    education: 'institución educativa',
    legal: 'firma legal / abogados',
    general: 'empresa / negocio'
  }[sector] || 'empresa'

  return `# ${name} — Semantic Layer para IA
## Generado por PulsIA | pulsia.ai
## Dominio: ${domain}
## Sector: ${sectorLabel}

---

## IDENTIDAD DE LA EMPRESA

**Nombre oficial:** ${name}
**Tipo de negocio:** ${sectorLabel}
**Sitio web:** https://${domain}
**País:** Colombia
**Descripción:** ${extracted.meta_desc || `${name} es un ${sectorLabel} ubicado en Colombia.`}

---

## INFORMACIÓN DE CONTACTO

**Teléfono:** [COMPLETAR]
**Email:** [COMPLETAR]
**Dirección:** [COMPLETAR — calle, ciudad, departamento]
**WhatsApp:** [COMPLETAR]
**Horario de atención:** Lunes a Viernes 8:00 AM - 6:00 PM

---

## PRESENCIA DIGITAL

**Sitio web:** https://${domain}
**Facebook:** [COMPLETAR]
**Instagram:** [COMPLETAR]
**LinkedIn:** [COMPLETAR]
**Google Maps:** [COMPLETAR]

---

## SERVICIOS PRINCIPALES

[COMPLETAR — liste aquí los 3-5 servicios principales que ofrece]

1. [Servicio 1]
2. [Servicio 2]
3. [Servicio 3]

---

## DIFERENCIADORES (¿Por qué elegir ${name}?)

[COMPLETAR — liste aquí 3-5 razones por las que los clientes deben elegirlos]

1. [Diferenciador 1]
2. [Diferenciador 2]
3. [Diferenciador 3]

---

## PREGUNTAS FRECUENTES

${generateFAQText(name, sector)}

---

## SEÑALES DE CONFIANZA

**Años de experiencia:** [COMPLETAR]
**Clientes atendidos:** [COMPLETAR]
**Certificaciones:** [COMPLETAR]
**Premios o reconocimientos:** [COMPLETAR]
**Reseñas en Google:** [COMPLETAR] estrellas — [COMPLETAR] reseñas

---

## COBERTURA GEOGRÁFICA

**Ciudad principal:** [COMPLETAR]
**Otras ciudades:** [COMPLETAR]
**Cobertura nacional:** Sí / No

---

## NOTAS PARA IA

Este documento es un Semantic Layer generado por PulsIA para optimizar
la visibilidad de ${name} en respuestas de inteligencia artificial.
Los campos marcados con [COMPLETAR] deben ser llenados por el negocio.
Una vez completo, este archivo debe estar disponible públicamente en:
https://${domain}/pulsia.txt

`
}

function generateFAQText(name, sector) {
  const faqs = {
    health: [
      `P: ¿Qué servicios médicos ofrece ${name}?\nR: [COMPLETAR con especialidades]`,
      `P: ¿Cómo agendo una cita?\nR: Llame a [TELÉFONO] o visítenos en [DIRECCIÓN]`,
      `P: ¿Aceptan seguros médicos?\nR: [COMPLETAR]`,
      `P: ¿Cuáles son los horarios?\nR: Lunes a Viernes 8:00 AM - 6:00 PM`
    ],
    restaurant: [
      `P: ¿Qué tipo de comida sirven?\nR: [COMPLETAR]`,
      `P: ¿Tienen servicio a domicilio?\nR: [COMPLETAR]`,
      `P: ¿Cuánto cuesta comer en ${name}?\nR: [COMPLETAR precio promedio]`,
      `P: ¿Hacen reservaciones?\nR: Sí, llame a [TELÉFONO]`
    ],
    general: [
      `P: ¿Qué servicios ofrece ${name}?\nR: [COMPLETAR]`,
      `P: ¿Cómo los contacto?\nR: [TELÉFONO] o [EMAIL]`,
      `P: ¿Cuál es su horario?\nR: Lunes a Viernes 8:00 AM - 6:00 PM`,
      `P: ¿Dónde están ubicados?\nR: [DIRECCIÓN]`
    ]
  }
  return (faqs[sector] || faqs.general).join('\n\n')
}

// ─── XML GENERATOR (para crawlers y bots) ────
export function generateXML(extracted, sector = 'general', domain = '') {
  const name = extracted.meta_title
    ? extracted.meta_title.replace(/\s*[-|].*$/, '').trim()
    : domain.replace(/^www\./, '').split('.')[0]

  const types = SECTOR_TYPES[sector] || SECTOR_TYPES.general

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- PulsIA Semantic Layer | ${domain} | ${new Date().toISOString().slice(0,10)} -->
<PulsiaSemanticLayer version="1.0" generated="${new Date().toISOString()}">

  <Entity>
    <Name>${escapeXML(name)}</Name>
    <Type>${types[0]}</Type>
    <SubType>${types[1] || ''}</SubType>
    <Domain>https://${domain}</Domain>
    <Country>CO</Country>
    <Language>es</Language>
    <Sector>${sector}</Sector>
  </Entity>

  <Identity>
    <OfficialName>${escapeXML(name)}</OfficialName>
    <Description>${escapeXML(extracted.meta_desc || '')}</Description>
    <FoundingDate>[COMPLETAR]</FoundingDate>
    <Founder>[COMPLETAR]</Founder>
    <Logo>${escapeXML(extracted.og_image || '')}</Logo>
  </Identity>

  <Contact>
    <Phone>[COMPLETAR]</Phone>
    <Email>[COMPLETAR]</Email>
    <WhatsApp>[COMPLETAR]</WhatsApp>
    <Website>https://${domain}</Website>
  </Contact>

  <Location>
    <StreetAddress>[COMPLETAR]</StreetAddress>
    <City>[COMPLETAR]</City>
    <State>[COMPLETAR]</State>
    <Country>Colombia</Country>
    <PostalCode>[COMPLETAR]</PostalCode>
    <Latitude>[COMPLETAR]</Latitude>
    <Longitude>[COMPLETAR]</Longitude>
    <GoogleMapsURL>[COMPLETAR]</GoogleMapsURL>
  </Location>

  <OpeningHours>
    <Schedule days="Monday,Tuesday,Wednesday,Thursday,Friday" opens="08:00" closes="18:00"/>
    <Schedule days="Saturday" opens="[COMPLETAR]" closes="[COMPLETAR]"/>
  </OpeningHours>

  <SocialProfiles>
    <Profile network="Facebook">[COMPLETAR]</Profile>
    <Profile network="Instagram">[COMPLETAR]</Profile>
    <Profile network="LinkedIn">[COMPLETAR]</Profile>
    <Profile network="Twitter">[COMPLETAR]</Profile>
    <Profile network="YouTube">[COMPLETAR]</Profile>
  </SocialProfiles>

  <Reputation>
    <GoogleRating>[COMPLETAR]</GoogleRating>
    <GoogleReviewCount>[COMPLETAR]</GoogleReviewCount>
    <YearsInBusiness>[COMPLETAR]</YearsInBusiness>
    <ClientsServed>[COMPLETAR]</ClientsServed>
    <Certifications>[COMPLETAR]</Certifications>
  </Reputation>

  <Services>
    <Service id="1">
      <Name>[COMPLETAR]</Name>
      <Description>[COMPLETAR]</Description>
      <Price>[COMPLETAR]</Price>
    </Service>
    <Service id="2">
      <Name>[COMPLETAR]</Name>
      <Description>[COMPLETAR]</Description>
      <Price>[COMPLETAR]</Price>
    </Service>
    <Service id="3">
      <Name>[COMPLETAR]</Name>
      <Description>[COMPLETAR]</Description>
      <Price>[COMPLETAR]</Price>
    </Service>
  </Services>

  <Coverage>
    <PrimaryCity>[COMPLETAR]</PrimaryCity>
    <OtherCities>[COMPLETAR]</OtherCities>
    <NationalCoverage>false</NationalCoverage>
  </Coverage>

  <AIOptimization>
    <PulsiaScore>[CALCULADO]</PulsiaScore>
    <BadgeLevel>[CALCULADO]</BadgeLevel>
    <LastUpdated>${new Date().toISOString().slice(0,10)}</LastUpdated>
    <RecommendedPublicURL>https://${domain}/pulsia.xml</RecommendedPublicURL>
  </AIOptimization>

</PulsiaSemanticLayer>`
}

function escapeXML(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// ─── FUNCIÓN PRINCIPAL ────────────────────────
export function generateSemanticLayer(extracted, sector = 'general', domain = '') {
  return {
    json: generateJsonLD(extracted, sector, domain),
    txt:  generateTXT(extracted, sector, domain),
    xml:  generateXML(extracted, sector, domain)
  }
}