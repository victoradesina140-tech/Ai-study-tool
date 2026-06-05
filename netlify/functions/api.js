// Netlify Function - Proxy for Gemini API with Security
const fetch = require('node-fetch')

const APIKEY = process.env.GEMINI_API_KEY
const MODEL = 'gemini-flash-lite-latest'

// Simple in-memory rate limiting (use Redis in production)
const requestCounts = new Map()

function getRateLimitKey(ip) {
  return ip
}

function checkRateLimit(ip) {
  const key = getRateLimitKey(ip)
  const now = Date.now()
  const windowStart = now - (15 * 60 * 1000) // 15 minute window

  const requests = requestCounts.get(key) || []
  const recentRequests = requests.filter(t => t > windowStart)

  if (recentRequests.length >= 20) {
    return false
  }

  recentRequests.push(now)
  requestCounts.set(key, recentRequests)
  return true
}

exports.handler = async (event, context) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://yourdomain.com',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'X-Content-Type-Options': 'nosniff'
  }

  // Handle OPTIONS (preflight)
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  // Rate limiting
  const clientIp = event.headers['client-ip'] || event.headers['x-forwarded-for'] || 'unknown'
  if (!checkRateLimit(clientIp)) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({ error: 'Rate limit exceeded' })
    }
  }

  if (!APIKEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Service unavailable' })
    }
  }

  try {
    // Parse and validate request
    let body
    try {
      body = JSON.parse(event.body)
    } catch {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid JSON' })
      }
    }

    const { system, messages, max_tokens } = body

    // Validate structure
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid request' })
      }
    }

    // Prevent DOS with size limits
    const userText = messages[messages.length - 1].content
    if (typeof userText !== 'string' || userText.length > 5000) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Input invalid' })
      }
    }
    if (system && system.length > 3000) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'System prompt invalid' })
      }
    }

    const tokens = Math.min(max_tokens || 1500, 2000)
    const fullText = system ? `${system}\n\n${userText}` : userText

    const geminiBody = {
      contents: [{ parts: [{ text: fullText }] }],
      generationConfig: { maxOutputTokens: tokens }
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${APIKEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
        timeout: 30000
      }
    )

    const data = await response.json()

    if (!response.ok || data.error) {
      // Don't expose API details
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Service temporarily unavailable' })
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        content: [{ text: data.candidates[0].content.parts[0].text }]
      })
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Service temporarily unavailable' })
    }
  }
}
