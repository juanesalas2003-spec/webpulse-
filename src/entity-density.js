// =============================================
// ENTITY DENSITY SCORER
// Evalúa la densidad de entidades declaradas
// en el sitio según su sector
// =============================================

const SECTOR_ENTITIES = {
  health: {
    required: [
      { key: 'entity_type',      label: 'Tipo de entidad médica declarada',        schema: 'MedicalBusiness|Dentist|Physician' },
      { key: 'doctors',          label: 'Médicos como entidades Person',            schema: 'physician|employee|MedicalBusiness' },
      { key: 'specialties',      label: 'Especialidades como MedicalSpecialty',     schema: 'medicalSpecialty|MedicalSpecialty' },
      { key: 'reviews',          label: 'Reseñas como AggregateRating',             schema: 'AggregateRating|aggregateRating' },
      { key: 'geo',              label: 'Coordenadas geográficas exactas',          schema: 'GeoCoordinates|geo' },
      { key: 'opening_hours',    label: 'Horarios como OpeningHoursSpecification',  schema: 'OpeningHoursSpecification|openingHours' }
    ]
  },
  real_estate: {
    required: [
      { key: 'entity_type',      label: 'Tipo de entidad inmobiliaria declarada',   schema: 'RealEstateAgent|RealEstateListing' },
      { key: 'listings',         label: 'Propiedades como RealEstateListing',       schema: 'RealEstateListing|floorSize' },
      { key: 'price',            label: 'Precio estructurado por propiedad',        schema: 'price|priceCurrency|offers' },
      { key: 'reviews',          label: 'Reseñas como AggregateRating',             schema: 'AggregateRating|aggregateRating' },
      { key: 'geo',              label: 'Coordenadas geográficas exactas',          schema: 'GeoCoordinates|geo' },
      { key: 'agent',            label: 'Agente como entidad Person',               schema: 'agent|Person|employee' }
    ]
  },
  restaurant: {
    required: [
      { key: 'entity_type',      label: 'Tipo Restaurant declarado',                schema: 'Restaurant|FoodEstablishment' },
      { key: 'menu',             label: 'Menú como entidad Menu',                   schema: 'Menu|hasMenu|menuItem' },
      { key: 'reviews',          label: 'Reseñas como AggregateRating',             schema: 'AggregateRating|aggregateRating' },
      { key: 'geo',              label: 'Coordenadas geográficas exactas',          schema: 'GeoCoordinates|geo' },
      { key: 'opening_hours',    label: 'Horarios como OpeningHoursSpecification',  schema: 'OpeningHoursSpecification|openingHours' },
      { key: 'price_range',      label: 'Rango de precios declarado',               schema: 'priceRange|servesCuisine' }
    ]
  },
  hotel: {
    required: [
      { key: 'entity_type',      label: 'Tipo LodgingBusiness declarado',           schema: 'Hotel|LodgingBusiness|BedAndBreakfast' },
      { key: 'rooms',            label: 'Habitaciones como entidad Accommodation',  schema: 'Accommodation|containsPlace' },
      { key: 'reviews',          label: 'Reseñas como AggregateRating',             schema: 'AggregateRating|aggregateRating' },
      { key: 'geo',              label: 'Coordenadas geográficas exactas',          schema: 'GeoCoordinates|geo' },
      { key: 'amenities',        label: 'Amenidades como entidades declaradas',     schema: 'amenityFeature|LocationFeatureSpecification' },
      { key: 'price_range',      label: 'Rango de precios por habitación',          schema: 'priceRange|offers' }
    ]
  },
  general: {
    required: [
      { key: 'entity_type',      label: 'Tipo LocalBusiness declarado',             schema: 'LocalBusiness|Organization' },
      { key: 'reviews',          label: 'Reseñas como AggregateRating',             schema: 'AggregateRating|aggregateRating' },
      { key: 'geo',              label: 'Coordenadas geográficas exactas',          schema: 'GeoCoordinates|geo' },
      { key: 'opening_hours',    label: 'Horarios como OpeningHoursSpecification',  schema: 'OpeningHoursSpecification|openingHours' },
      { key: 'nap',              label: 'NAP consistente (Nombre, Dirección, Tel)', schema: 'telephone|address|name' },
      { key: 'social',           label: 'Perfiles sociales como entidades',         schema: 'sameAs|url' }
    ]
  }
}

export function scoreEntityDensity(schemaOrg, sector = 'general') {
  const entities = SECTOR_ENTITIES[sector] || SECTOR_ENTITIES.general
  const schema = schemaOrg || ''

  const present = []
  const missing = []

  for (const entity of entities.required) {
    const patterns = entity.schema.split('|')
    const found = patterns.some(p => schema.includes(p))

    if (found) {
      present.push({ key: entity.key, label: entity.label })
    } else {
      missing.push({ key: entity.key, label: entity.label, severity: 'critical' })
    }
  }

  const total        = entities.required.length
  const presentCount = present.length
  const missingCount = missing.length
  const densityScore = parseFloat(((missingCount / total) * 10).toFixed(2))

  return {
    density_score:  densityScore,
    entities_total: total,
    entities_present: presentCount,
    entities_missing: missingCount,
    present,
    missing,
    density_label: densityScore >= 7 ? 'Critica' :
                   densityScore >= 4 ? 'Baja'    : 'Aceptable'
  }
}