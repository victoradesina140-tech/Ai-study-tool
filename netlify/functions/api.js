// Netlify Function — AI proxy (Groq first, Gemini as automatic fallback)
// Keys live only in Netlify env vars: GROQ_API_KEY and/or GEMINI_API_KEY
const fetch = globalThis.fetch || require('node-fetch')

const GROQ_KEY      = process.env.GROQ_API_KEY
const GEMINI_KEY    = process.env.GEMINI_API_KEY
const GROQ_TEXT     = 'llama-3.3-70b-versatile'
const GROQ_VISION   = 'meta-llama/llama-4-scout-17b-16e-instruct'
const GEMINI_MODEL  = 'gemini-flash-lite-latest'

// ── Question rules ──
const MCQ_BATCH_MAX = 10   // questions per request; the client sends several batches
// Fixed shape per mark value so a 2-mark question can never come back as a 10-mark essay
const THEORY_RULES = {
  2:  { maxParts: 1, words: '30-60',   style: 'a single, direct recall question (define, list or state). No sub-parts.' },
  4:  { maxParts: 2, words: '80-120',  style: 'a short-answer question with at most 2 sub-parts.' },
  6:  { maxParts: 2, words: '150-200', style: 'a short-answer question with at most 2 sub-parts.' },
  10: { maxParts: 3, words: '300-400', style: 'a structured theory question with at most 3 sub-parts.' },
  15: { maxParts: 3, words: '450-600', style: 'a long theory question with at most 3 sub-parts.' },
  20: { maxParts: 4, words: '600-900', style: 'a full essay question with at most 4 sub-parts.' }
}
const IMAGE_TYPES   = ['image/jpeg', 'image/png', 'image/webp']
const MAX_IMAGES    = 3
const MAX_IMAGE_B64 = 1.3 * 1024 * 1024  // keeps the whole request under Netlify's ~6MB and Groq's 4MB image cap

// Simple in-memory rate limiting (per function instance)
const requestCounts = new Map()
function checkRateLimit(ip) {
  const now      = Date.now()
  const requests = (requestCounts.get(ip) || []).filter(t => t > now - 15 * 60 * 1000)
  if (requests.length >= 40) return false
  requests.push(now)
  requestCounts.set(ip, requests)
  return true
}

// ── AI providers ──
class AIError extends Error {
  constructor(provider, status, detail) {
    super(`${provider} ${status}: ${String(detail).slice(0, 200)}`)
    this.status = status
  }
}

async function callGroq({ prompt, images, json, maxTokens, temperature }, model = GROQ_TEXT) {
  const content = images && images.length
    ? [{ type: 'text', text: prompt }, ...images.map(im => ({ type: 'image_url', image_url: { url: `data:${im.type};base64,${im.data}` } }))]
    : prompt
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model:       images && images.length ? GROQ_VISION : model,
      messages:    [{ role: 'user', content }],
      max_tokens:  maxTokens,
      temperature,
      ...(json && { response_format: { type: 'json_object' } })
    })
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.error) throw new AIError('groq', res.status, JSON.stringify(data.error || data))
  const text = data.choices?.[0]?.message?.content || ''
  if (!text) throw new AIError('groq', 200, 'empty response')
  return text
}

async function callGemini({ prompt, images, json, maxTokens, temperature }) {
  const parts = [
    ...(images || []).map(im => ({ inline_data: { mime_type: im.type, data: im.data } })),
    { text: prompt }
  ]
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { maxOutputTokens: maxTokens, temperature, ...(json && { responseMimeType: 'application/json' }) }
      })
    }
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.error) throw new AIError('gemini', res.status, JSON.stringify(data.error || data))
  const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('')
  if (!text) throw new AIError('gemini', 200, `empty response (${data.candidates?.[0]?.finishReason || 'no candidate'})`)
  return text
}

// Tries each configured provider in turn; the first one that answers wins
async function callAI(opts) {
  const providers = []
  // Groq's free tier limits tokens per minute per model, so a second Groq model and Gemini act as backups
  if (GROQ_KEY)   providers.push(o => callGroq(o, GROQ_TEXT), o => callGroq(o, GROQ_VISION))
  if (GEMINI_KEY) providers.push(callGemini)
  if (!providers.length) throw new AIError('config', 500, 'No GROQ_API_KEY or GEMINI_API_KEY set on the server')
  let lastErr
  for (const call of providers) {
    try {
      return await call(opts)
    } catch (err) {
      console.error('AI provider failed:', err.message)
      lastErr = err
    }
  }
  throw lastErr
}

function parseJson(text) {
  const clean = text.replace(/```json|```/g, '').trim()
  try { return JSON.parse(clean) } catch {}
  const start = clean.search(/[[{]/)
  const end   = Math.max(clean.lastIndexOf('}'), clean.lastIndexOf(']'))
  return JSON.parse(clean.slice(start, end + 1))
}

// ── Validation ──
function shuffleOptions(q) {
  const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5)
  return {
    question:    q.question.trim(),
    options:     order.map(i => q.options[i].trim()),
    answerIndex: order.indexOf(q.answerIndex),
    explanation: q.explanation.trim()
  }
}

function validMcq(q) {
  if (!q || typeof q.question !== 'string' || q.question.trim().length < 10) return false
  if (!Array.isArray(q.options) || q.options.length !== 4) return false
  const opts = q.options.map(o => (typeof o === 'string' ? o.trim() : ''))
  if (opts.some(o => !o) || new Set(opts.map(o => o.toLowerCase())).size !== 4) return false
  if (!Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex > 3) return false
  if (typeof q.explanation !== 'string' || !q.explanation.trim()) return false
  return true
}

// Returns an error string, or null when the theory question obeys its mark rules
function theoryProblem(t, marks) {
  const rule = THEORY_RULES[marks]
  if (!t || Number(t.marks) !== marks) return 'wrong total marks'
  if (!Array.isArray(t.parts) || t.parts.length < 1 || t.parts.length > rule.maxParts) return 'wrong number of parts'
  if (t.parts.some(p => typeof p.text !== 'string' || !p.text.trim() || !Number.isInteger(Number(p.marks)) || Number(p.marks) < 1)) return 'bad part'
  if (t.parts.reduce((a, p) => a + Number(p.marks), 0) !== marks) return 'part marks do not add up'
  if (!Array.isArray(t.markingPoints) || t.markingPoints.length < marks) return 'too few marking points'
  if (marks <= 2 && t.parts[0].text.length > 220) return 'question too long for 2 marks'
  return null
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'X-Content-Type-Options': 'nosniff'
  }
  const reply = (statusCode, obj) => ({ statusCode, headers, body: JSON.stringify(obj) })

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }

  // Health check: open /api/claude in a browser to see which AI keys work (never shows the keys)
  if (event.httpMethod === 'GET') {
    const check = async (name, key, call) => {
      if (!key) return [name, 'no key set']
      try {
        await call({ prompt: 'Reply with OK', maxTokens: 5, temperature: 0 })
        return [name, 'working']
      } catch (err) {
        return [name, `failed (HTTP ${err.status})`]
      }
    }
    const results = await Promise.all([check('groq', GROQ_KEY, callGroq), check('gemini', GEMINI_KEY, callGemini)])
    return reply(200, Object.fromEntries(results))
  }

  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method not allowed' })

  const clientIp = event.headers['client-ip'] || event.headers['x-forwarded-for'] || 'unknown'
  if (!checkRateLimit(clientIp)) {
    return reply(429, { error: 'You are going a bit fast. Please wait a few minutes and try again.' })
  }

  let body
  try {
    body = JSON.parse(event.body)
  } catch {
    return reply(400, { error: 'Invalid JSON' })
  }

  const { system, messages, max_tokens, mode } = body

  try {
    // ── MCQ MODE — one batch of 1-mark MCQs for a topic ──
    if (mode === 'mcq') {
      const subject = String(body.subject || '').slice(0, 60)
      const topic   = String(body.topic || '').slice(0, 80)
      const count   = parseInt(body.count)
      const focus   = String(body.focus || '').slice(0, 120)
      const avoid   = Array.isArray(body.avoid) ? body.avoid.slice(0, 40).map(s => String(s).slice(0, 200)) : []
      if (!subject || !topic || !Number.isInteger(count) || count < 1 || count > MCQ_BATCH_MAX) {
        return reply(400, { error: 'Invalid request' })
      }

      const prompt = `You are a medical examiner setting single-best-answer MCQs for Nigerian preclinical medical and pharmacy students (MBBS/BPharm level).
Subject: ${subject}
Topic: ${topic}
${focus ? `Focus for this set: ${focus}\n` : ''}
Write exactly ${count} multiple choice questions. Rules:
- Each question is worth 1 mark and has ONE correct answer.
- "options" has exactly 4 distinct answer choices with no letter prefixes (no "A.", "B)").
- "answerIndex" is the 0-based index (0-3) of the correct option.
- "explanation" is ONE short sentence saying why the answer is correct.
- Stems are a single sentence or a short clinical vignette. No "all of the above" or "none of the above".
- Every question tests a different fact and is accurate to standard textbooks (e.g. Snell, Guyton, Lippincott).${avoid.length ? `\n- Do NOT repeat or rephrase these questions:\n${avoid.map(q => `  * ${q}`).join('\n')}` : ''}

Respond with ONLY this JSON object:
{"questions":[{"question":"...","options":["...","...","...","..."],"answerIndex":0,"explanation":"..."}]}`

      const text = await callAI({ prompt, json: true, maxTokens: 4000, temperature: 0.8 })
      let parsed
      try { parsed = parseJson(text) } catch { parsed = {} }
      const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.questions) ? parsed.questions : [])
      const questions = list
        .map(q => ({ ...q, answerIndex: Number(q && q.answerIndex) }))
        .filter(validMcq).slice(0, count).map(shuffleOptions)
      if (!questions.length) return reply(502, { error: 'Could not generate questions. Please try again.' })
      return reply(200, { questions })
    }

    // ── UPLOAD MODE — one theory question from the student's notes, fixed marks ──
    if (mode === 'upload') {
      // The browser reads the file and sends either its text or up to 3 page photos
      const marks = parseInt(body.marks)
      if (!THEORY_RULES[marks]) return reply(400, { error: 'Invalid request' })

      let notes = '', images = null
      if (typeof body.fileText === 'string' && body.fileText.trim().length >= 100) {
        notes = `Notes:\n"""\n${body.fileText.slice(0, 24000)}\n"""\n\n`
      } else if (Array.isArray(body.images) && body.images.length && body.images.length <= MAX_IMAGES) {
        const ok = body.images.every(im => im && IMAGE_TYPES.includes(im.type) && typeof im.data === 'string' && im.data.length <= MAX_IMAGE_B64)
        if (!ok) return reply(400, { error: 'Could not read this photo. Please take it again or use JPG/PNG.' })
        images = body.images
      } else {
        return reply(400, { error: 'This file has too little text to set a question from.' })
      }

      const rule   = THEORY_RULES[marks]
      const prompt = `${notes}You are a medical examiner. Using ONLY the ${images ? 'attached photo(s) of notes' : 'notes above'}, set ONE theory question worth exactly ${marks} marks.
It must be ${rule.style}
A full-mark answer should be about ${rule.words} words, so the question must not ask for more than that.

Respond with ONLY this JSON object:
{"marks":${marks},"parts":[{"text":"question part","marks":${marks}}],"markingPoints":["point 1","point 2"],"summary":"...","teaching":"..."}
- "parts": the question split into 1 to ${rule.maxParts} sub-parts. Part marks must add up to exactly ${marks}.
- "markingPoints": exactly ${marks} specific points from the notes, one per mark, that an examiner would look for.
- "summary": a 2-3 paragraph summary of what the notes cover.
- "teaching": a short, simplified explanation of the most important points.
If the notes are not readable or not study material, return {"marks":${marks},"parts":[],"markingPoints":[],"summary":"","teaching":""}.`

      // One retry if the model breaks the mark rules
      let theory, problem
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          theory  = parseJson(await callAI({ prompt, images, json: true, maxTokens: 3000, temperature: 0.5 }))
          problem = theoryProblem(theory, marks)
        } catch (e) {
          if (e instanceof AIError) throw e
          problem = 'unparseable'
        }
        if (!problem) break
        if (theory && Array.isArray(theory.parts) && theory.parts.length === 0) break
      }

      if (problem) {
        if (theory && Array.isArray(theory.parts) && theory.parts.length === 0) {
          return reply(422, { error: 'We could not find readable study notes in this file. Try a clearer photo or a text-based PDF.' })
        }
        return reply(502, { error: 'Could not set a question from this file. Please try again.' })
      }

      const parts    = theory.parts.map(p => ({ text: p.text.trim(), marks: Number(p.marks) }))
      const question = parts.length > 1
        ? parts.map((p, i) => `(${'abcd'[i]}) ${p.text} [${p.marks} mark${p.marks > 1 ? 's' : ''}]`).join('\n')
        : parts[0].text

      return reply(200, {
        theory: {
          question,
          marks,
          expectedWords: rule.words,
          keywords:  theory.markingPoints.slice(0, marks).map(String),
          summary:   String(theory.summary || ''),
          teaching:  String(theory.teaching || '')
        }
      })
    }

    // ── NORMAL TEXT MODE — pearl, feedback, model answer ──
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return reply(400, { error: 'Invalid request' })
    }
    const userText = messages[messages.length - 1].content
    if (typeof userText !== 'string' || userText.length > 8000) return reply(400, { error: 'Input too long' })
    if (system && system.length > 5000) return reply(400, { error: 'System prompt too long' })

    const maxTokens = Math.min(parseInt(max_tokens) || 1500, 2000)
    const prompt    = system ? `${system}\n\n${userText}` : userText
    const text      = await callAI({ prompt, maxTokens, temperature: 0.7 })
    return reply(200, { content: [{ text }] })

  } catch (err) {
    console.error('Function error:', err.message)
    if (err.status === 429) return reply(503, { error: 'MedEssay is busy right now. Please try again in a minute.' })
    // detail is the provider's error text (never contains the key); helps debug from the browser
    return reply(500, { error: 'Service temporarily unavailable. Please try again.', detail: String(err.message).slice(0, 300) })
  }
}
