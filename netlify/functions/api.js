// Netlify Function - Proxy for Gemini API with Security + File Upload Support
const fetch = require('node-fetch')

const APIKEY = process.env.GEMINI_API_KEY
const MODEL  = 'gemini-flash-lite-latest'

// ── Question rules ──
const MCQ_SIZES       = [20, 40, 60, 80, 100]
const MCQ_BATCH_MAX   = 10           // questions per request; the client sends several batches
const THEORY_MARKS    = [2, 4, 6, 10, 15, 20]
// Fixed shape per mark value so a 2-mark question can never come back as a 10-mark essay
const THEORY_RULES = {
  2:  { maxParts: 1, words: '30-60',   style: 'a single, direct recall question (define, list or state). No sub-parts.' },
  4:  { maxParts: 2, words: '80-120',  style: 'a short-answer question with at most 2 sub-parts.' },
  6:  { maxParts: 2, words: '150-200', style: 'a short-answer question with at most 2 sub-parts.' },
  10: { maxParts: 3, words: '300-400', style: 'a structured theory question with at most 3 sub-parts.' },
  15: { maxParts: 3, words: '450-600', style: 'a long theory question with at most 3 sub-parts.' },
  20: { maxParts: 4, words: '600-900', style: 'a full essay question with at most 4 sub-parts.' }
}
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_IMAGES  = 3
const MAX_IMAGE_B64 = 1.6 * 1024 * 1024  // Netlify caps request bodies at ~6MB in total

// Simple in-memory rate limiting (per function instance)
const requestCounts = new Map()

function checkRateLimit(ip) {
  const now         = Date.now()
  const windowStart = now - (15 * 60 * 1000)
  const requests    = (requestCounts.get(ip) || []).filter(t => t > windowStart)
  if (requests.length >= 40) return false
  requests.push(now)
  requestCounts.set(ip, requests)
  return true
}

const MCQ_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      question:    { type: 'STRING' },
      options:     { type: 'ARRAY', items: { type: 'STRING' } },
      answerIndex: { type: 'INTEGER' },
      explanation: { type: 'STRING' }
    },
    required: ['question', 'options', 'answerIndex', 'explanation']
  }
}

const THEORY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    marks:          { type: 'INTEGER' },
    parts:          { type: 'ARRAY', items: { type: 'OBJECT', properties: { text: { type: 'STRING' }, marks: { type: 'INTEGER' } }, required: ['text', 'marks'] } },
    markingPoints:  { type: 'ARRAY', items: { type: 'STRING' } },
    summary:        { type: 'STRING' },
    teaching:       { type: 'STRING' }
  },
  required: ['marks', 'parts', 'markingPoints', 'summary', 'teaching']
}

function shuffleOptions(q) {
  const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5)
  return {
    question:    q.question,
    options:     order.map(i => q.options[i]),
    answerIndex: order.indexOf(q.answerIndex),
    explanation: q.explanation
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
  if (!t || t.marks !== marks) return 'wrong total marks'
  if (!Array.isArray(t.parts) || t.parts.length < 1 || t.parts.length > rule.maxParts) return 'wrong number of parts'
  if (t.parts.some(p => typeof p.text !== 'string' || !p.text.trim() || !Number.isInteger(p.marks) || p.marks < 1)) return 'bad part'
  if (t.parts.reduce((a, p) => a + p.marks, 0) !== marks) return 'part marks do not add up'
  if (!Array.isArray(t.markingPoints) || t.markingPoints.length < marks) return 'too few marking points'
  if (marks <= 2 && t.parts[0].text.length > 220) return 'question too long for 2 marks'
  return null
}

async function callGemini(parts, generationConfig) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${APIKEY}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ contents: [{ parts }], generationConfig })
    }
  )
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.error) {
    console.error('Gemini error:', JSON.stringify(data.error || data))
    const err = new Error('gemini')
    err.status = response.status
    throw err
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  if (!text) throw new Error('empty')
  return text
}

function parseJson(text) {
  return JSON.parse(text.replace(/```json|```/g, '').trim())
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'X-Content-Type-Options': 'nosniff'
  }
  const reply = (statusCode, obj) => ({ statusCode, headers, body: JSON.stringify(obj) })

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'POST')    return reply(405, { error: 'Method not allowed' })

  const clientIp = event.headers['client-ip'] || event.headers['x-forwarded-for'] || 'unknown'
  if (!checkRateLimit(clientIp)) {
    return reply(429, { error: 'You are going a bit fast. Please wait a few minutes and try again.' })
  }

  if (!APIKEY) return reply(500, { error: 'Service unavailable' })

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
      const avoid   = Array.isArray(body.avoid) ? body.avoid.slice(0, 60).map(s => String(s).slice(0, 200)) : []
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
- "answerIndex" is the 0-based index of the correct option.
- "explanation" is ONE short sentence saying why the answer is correct.
- Stems are a single sentence or a short clinical vignette. No "all of the above" or "none of the above".
- Every question tests a different fact. Must be accurate to standard textbooks (e.g. Snell, Guyton, Lippincott).${avoid.length ? `\n- Do NOT repeat or rephrase these questions:\n${avoid.map(q => `  * ${q}`).join('\n')}` : ''}`

      const text = await callGemini([{ text: prompt }], {
        maxOutputTokens:  4000,
        temperature:      0.8,
        responseMimeType: 'application/json',
        responseSchema:   MCQ_SCHEMA
      })

      let list
      try { list = parseJson(text) } catch { list = [] }
      if (!Array.isArray(list)) list = []
      const questions = list.filter(validMcq).slice(0, count).map(shuffleOptions)
      if (!questions.length) return reply(502, { error: 'Could not generate questions. Please try again.' })
      return reply(200, { questions })
    }

    // ── UPLOAD MODE — one theory question from the student's file, fixed marks ──
    if (mode === 'upload') {
      // The browser reads the file and sends either its text or up to 3 page photos
      const marks = parseInt(body.marks)
      if (!THEORY_RULES[marks]) return reply(400, { error: 'Invalid request' })

      let sources
      if (typeof body.fileText === 'string' && body.fileText.trim().length >= 100) {
        sources = [{ text: `Extracted notes:\n${body.fileText.slice(0, 30000)}` }]
      } else if (Array.isArray(body.images) && body.images.length && body.images.length <= MAX_IMAGES) {
        const ok = body.images.every(im => im && IMAGE_TYPES.includes(im.type) && typeof im.data === 'string' && im.data.length <= MAX_IMAGE_B64)
        if (!ok) return reply(400, { error: 'Could not read this photo. Please take it again or use JPG/PNG.' })
        sources = body.images.map(im => ({ inline_data: { mime_type: im.type, data: im.data } }))
      } else {
        return reply(400, { error: 'This file has too little text to set a question from.' })
      }

      const rule   = THEORY_RULES[marks]
      const prompt = `You are a medical examiner. Using ONLY the attached notes, set ONE theory question worth exactly ${marks} marks.
It must be ${rule.style}
A full-mark answer should be about ${rule.words} words, so the question must not ask for more than that.
Return JSON with:
- "marks": ${marks}
- "parts": the question split into its sub-parts (1 to ${rule.maxParts}), each with "text" and "marks". Part marks must add up to exactly ${marks}.
- "markingPoints": exactly ${marks} specific points from the notes, one per mark, that an examiner would look for.
- "summary": a 2-3 paragraph summary of what the notes cover.
- "teaching": a short, simplified explanation of the most important points.
If the notes are not readable or not study material, still return the JSON with "parts": [] .`

      const config = {
        maxOutputTokens:  3000,
        temperature:      0.5,
        responseMimeType: 'application/json',
        responseSchema:   THEORY_SCHEMA
      }

      // One retry if the model breaks the mark rules
      let theory, problem
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          theory  = parseJson(await callGemini([...sources, { text: prompt }], config))
          problem = theoryProblem(theory, marks)
        } catch (e) {
          if (e.message === 'gemini' && e.status === 400) {
            return reply(400, { error: 'Could not read this file. Try a clearer photo or a text-based PDF.' })
          }
          if (e.message === 'gemini') throw e
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

      const multi    = theory.parts.length > 1
      const letters  = 'abcd'
      const question = multi
        ? theory.parts.map((p, i) => `(${letters[i]}) ${p.text.trim()} [${p.marks} mark${p.marks > 1 ? 's' : ''}]`).join('\n')
        : theory.parts[0].text.trim()

      return reply(200, {
        theory: {
          question,
          marks,
          expectedWords: rule.words,
          keywords:  theory.markingPoints.slice(0, marks),
          summary:   theory.summary || '',
          teaching:  theory.teaching || ''
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

    const tokens   = Math.min(parseInt(max_tokens) || 1500, 2000)
    const fullText = system ? `${system}\n\n${userText}` : userText
    const text     = await callGemini([{ text: fullText }], { maxOutputTokens: tokens, temperature: 0.7 })
    return reply(200, { content: [{ text }] })

  } catch (err) {
    console.error('Function error:', err.message)
    if (err.status === 429) return reply(503, { error: 'MedEssay is busy right now. Please try again in a minute.' })
    return reply(500, { error: 'Service temporarily unavailable. Please try again.' })
  }
}
