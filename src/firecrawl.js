import fetch from 'node-fetch'
import 'dotenv/config'

export async function scrapeUrl(url) {
  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url,
      formats: ['html']
    })
  })

  const data = await response.json()

  if (!data.success) {
    throw new Error(`Firecrawl error: ${data.error || 'unknown'}`)
  }

  const html = data.html || ''

  const headings = []
  const h1matches = html.match(/<h1[^>]*>(.*?)<\/h1>/gi) || []
  const h2matches = html.match(/<h2[^>]*>(.*?)<\/h2>/gi) || []
  h1matches.forEach(h => headings.push('H1:' + h.replace(/<[^>]+>/g, '').trim()))
  h2matches.forEach(h => headings.push('H2:' + h.replace(/<[^>]+>/g, '').trim()))

  const metaTitle    = (html.match(/<title[^>]*>(.*?)<\/title>/i) || [])[1] || ''
  const metaDesc     = (html.match(/name="description"[^>]*content="([^"]*)"/i) || [])[1] || ''
  const ogTitle      = (html.match(/property="og:title"[^>]*content="([^"]*)"/i) || [])[1] || ''
  const ogImage      = (html.match(/property="og:image"[^>]*content="([^"]*)"/i) || [])[1] || ''
  const schemaOrg    = (html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i) || [])[1] || ''
  const imgMatches   = html.match(/<img[^>]*>/gi) || []
  const imagesAlt    = imgMatches.map(img => (img.match(/alt="([^"]*)"/i) || [])[1] || '')

  return {
    html,
    headings,
    meta_title: metaTitle,
    meta_desc:  metaDesc,
    og_title:   ogTitle,
    og_image:   ogImage,
    schema_org: schemaOrg,
    images_alt: imagesAlt
  }
}