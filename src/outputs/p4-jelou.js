import fetch from 'node-fetch'
import 'dotenv/config'

export async function notifyJelou({ contact, channel = 'whatsapp', url, score, flags, sector }) {

  const criticalFlags = flags.filter(f => f.severity === 'critical')
  const mainIssue = criticalFlags[0]?.label || 'problemas de optimización detectados'

  const payload = {
    contact,
    channel,
    context: {
      site: url,
      score,
      sector,
      critical_issues: criticalFlags.map(f => f.label),
      main_issue: mainIssue,
      hook: `Tu sitio tiene ${criticalFlags.length} problemas críticos que hacen que no aparezcas en búsquedas de IA`,
      suggested_product: score >= 7 ? 'P2' : 'P1'
    }
  }

  const response = await fetch(process.env.JELOU_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.JELOU_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    throw new Error(`Jelou webhook error: ${response.status}`)
  }

  return await response.json()
}