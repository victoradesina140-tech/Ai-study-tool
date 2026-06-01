// server.js — MedEssay Proxy Server (Gemini)
const express = require('express')
const cors    = require('cors')
const fetch   = require('node-fetch')

const app    = express()
const PORT   = 3000
const APIKEY = 'AIzaSyDH7n42SBw0BLeMYv5sThOY10wCyPAlhj0'
const MODEL  = 'gemini-2.0-flash'

app.use(cors())
app.use(express.json())
app.use(express.static('.'))

app.post('/api/claude', async (req, res) => {
  try {
    // Convert Anthropic format → Gemini format
    const { system, messages, max_tokens } = req.body

    // Combine system prompt + user message into Gemini contents
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
      return res.status(500).json({ error: data.error || 'Gemini API error' })
    }

    // Convert Gemini response → Anthropic format (so quiz.js/feedback.js don't need changes)
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    res.json({ content: [{ text }] })

  } catch (err) {
    console.error('Proxy error:', err)
    res.status(500).json({ error: 'Proxy error', details: err.message })
  }
})

app.listen(PORT, () => {
  console.log(`\n✅ MedEssay running at http://localhost:${PORT}/ai.html\n`)
})