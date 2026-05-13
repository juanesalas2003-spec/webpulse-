export function generateJsonLD(extracted, sector = 'general', domain = '') {

  const sectorTypes = {
    real_estate: 'RealEstateListing',
    health:      'MedicalBusiness',
    restaurant:  'Restaurant',
    hotel:       'LodgingBusiness',
    general:     'LocalBusiness'
  }

  const type = sectorTypes[sector] || 'LocalBusiness'

  const jsonld = {
    '@context': 'https://schema.org',
    '@type': type,
    'name': extracted.meta_title || domain,
    'description': extracted.meta_desc || '',
    'url': `https://${domain}`,
    'image': extracted.og_image || ''
  }

  if (sector === 'real_estate') {
    jsonld['@type'] = ['RealEstateAgent', 'LocalBusiness']
  }

  if (sector === 'health') {
    jsonld['medicalSpecialty'] = ''
  }

  return JSON.stringify(jsonld, null, 2)
}