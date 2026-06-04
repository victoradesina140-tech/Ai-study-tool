// Netlify Function - Proxy for Gemini API
const fetch = require('node-fetch')

const APIKEY = process.env.GEMINI_API_KEY
const MODEL = 'gemini-flash-lite-latest'

exports.handler = async (event, context) => {
  // Only handle POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  // Enable CORS
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  }

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers }
  }

  if (!APIKEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'API key not configured' })
    }
  }

  try {
    const { system, messages, max_tokens } = JSON.parse(event.body)

    // Combine system prompt + user message into Gemini format
    const userText = messages[messages.length - 1].content
    const fullText = system ? `${system}\n\n${userText}` : userText

    const geminiBody = {
      contents: [{ parts: [{ text: fullText }] }],
      generationConfig: { maxOutputTokens: max_tokens || 1500 }
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${APIKEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody)
      }
    )

    const data = await response.json()

    if (!response.ok || data.error) {
      console.error('Gemini error:', data.error || data)
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: data.error || 'Gemini API error' })
      }
    }

    // Format response in Claude format for compatibility
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        content: [{ text: data.candidates[0].content.parts[0].text }]
      })
    }
  } catch (err) {
    console.error('Error:', err)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    }
  }
}
