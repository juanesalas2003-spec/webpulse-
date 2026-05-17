// src/query-engine/executor.js

const OPENAI_API  = 'https://api.openai.com/v1/chat/completions'
const GEMINI_API  = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

function buildPrompt(queryText) {
  return `${queryText}

Responde de manera natural y completa, como lo harías con alguien que busca esta información. Si conoces opciones específicas, mencionarlas con nombres reales.`
}

async function executeOpenAI(queryText) {
  const res = await fetch(OPENAI_API, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model:       'gpt-4o-mini',
      messages:    [{ role: 'user', content: buildPrompt(queryText) }],
      temperature: 0.3,
      max_tokens:  600
    })
  })

  const data = await res.json()

  if (!data.choices?.[0]?.message?.content) {
    throw new Error(data.error?.message || 'OpenAI sin respuesta')
  }

  return {
    engine:      'gpt4o-mini',
    response:    data.choices[0].message.content,
    tokens_used: data.usage?.total_tokens || 0
  }
}

async function executeGemini(queryText) {
  const url = `${GEMINI_API}?key=${process.env.GEMINI_API_KEY}`

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: buildPrompt(queryText) }]
      }],
      generationConfig: {
        temperature:     0.3,
        maxOutputTokens: 600
      }
    })
  })

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text

  if (!text) {
    throw new Error(data.error?.message || 'Gemini sin respuesta')
  }

  return {
    engine:      'gemini',
    response:    text,
    tokens_used: data.usageMetadata?.totalTokenCount || 0
  }
}

export async function executeQuery(queryText, engines = ['gpt4o-mini', 'gemini']) {
  const results = []

  for (const engine of engines) {
    try {
      let result
      if (engine === 'gpt4o-mini') result = await executeOpenAI(queryText)
      if (engine === 'gemini')     result = await executeGemini(queryText)
      if (result) results.push({ ...result, success: true })
    } catch (err) {
      results.push({ engine, success: false, error: err.message, response: null })
    }

    // Rate limiting entre engines
    await new Promise(r => setTimeout(r, 500))
  }

  return results
}

export async function executeQueryWithSampling(queryText, engine, samples = 2) {
  const results = []

  for (let i = 0; i < samples; i++) {
    try {
      let result
      if (engine === 'gpt4o-mini') result = await executeOpenAI(queryText)
      if (engine === 'gemini')     result = await executeGemini(queryText)
      if (result) results.push(result)
    } catch (err) {
      console.error(`[executor] Sample ${i+1} failed:`, err.message)
    }
    if (i < samples - 1) await new Promise(r => setTimeout(r, 1000))
  }

  return results
}