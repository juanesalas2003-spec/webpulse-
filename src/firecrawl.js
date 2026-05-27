// ============================================
// SCRAPER PROPIO — Reemplaza Firecrawl para demo
// Usa fetch + regex, sin API key
// ============================================

export async function scrapeUrl(url) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PulsIA/1.0; +https://webpulse-kqgm.onrender.com)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-CO,es;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache'
      }
    })
    clearTimeout(timeout)

    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const html = await response.text()

    return parseHtml(html, url)
  } catch (err) {
    console.error(`[scraper] Error en ${url}:`, err.message)
    return emptyResult(url)
  }
}

function parseHtml(html, url) {
  // ── Meta title ──────────────────────────────
  const metaTitle = (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1]?.trim() || ''

  // ── Meta description ────────────────────────
  const metaDesc = (
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)
  )?.[1]?.trim() || ''

  // ── Open Graph ──────────────────────────────
  const ogTitle = (
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)
  )?.[1]?.trim() || ''

  const ogImage = (
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
  )?.[1]?.trim() || ''

  const ogDescription = (
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i)
  )?.[1]?.trim() || ''

  // ── Headings ────────────────────────────────
  const h1Matches = [...html.matchAll(/<h1[^>]*>([^<]+)<\/h1>/gi)].map(m => m[1].trim()).filter(Boolean)
  const h2Matches = [...html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/gi)].map(m => m[1].trim()).filter(Boolean)
  const h3Matches = [...html.matchAll(/<h3[^>]*>([^<]+)<\/h3>/gi)].map(m => m[1].trim()).filter(Boolean)
  const headings  = [...h1Matches, ...h2Matches, ...h3Matches].slice(0, 20)

  // ── Schema.org ──────────────────────────────
  const schemaMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  const schemaOrg = schemaMatches.map(m => m[1].trim()).join('\n') || ''

  // ── Images alt ──────────────────────────────
  const imgMatches = [...html.matchAll(/<img[^>]+>/gi)]
  const imagesAlt  = imgMatches.map(img => {
    const alt = (img[0].match(/alt=["']([^"']*)["']/i) || [])[1] || ''
    return alt
  }).slice(0, 50)

  // ── Canonical ───────────────────────────────
  const canonical = (html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) || [])[1]?.trim() || url

  // ── Robots ──────────────────────────────────
  const robots = (html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i) || [])[1]?.trim() || ''

  // ── Twitter card ────────────────────────────
  const twitterCard = (html.match(/<meta[^>]+name=["']twitter:card["'][^>]+content=["']([^"']+)["']/i) || [])[1]?.trim() || ''

  return {
    html,
    headings,
    meta_title:    metaTitle,
    meta_desc:     metaDesc,
    og_title:      ogTitle,
    og_image:      ogImage,
    og_description: ogDescription,
    schema_org:    schemaOrg,
    images_alt:    imagesAlt,
    canonical,
    robots,
    twitter_card:  twitterCard
  }
}

function emptyResult(url) {
  return {
    html:          '',
    headings:      [],
    meta_title:    '',
    meta_desc:     '',
    og_title:      '',
    og_image:      '',
    og_description: '',
    schema_org:    '',
    images_alt:    [],
    canonical:     url,
    robots:        '',
    twitter_card:  ''
  }
}