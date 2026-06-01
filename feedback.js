// feedback.js — AI Feedback display
document.addEventListener('DOMContentLoaded', async () => {

  const question = localStorage.getItem('currentQuestion')  || ''
  const keywords = JSON.parse(localStorage.getItem('currentKeywords') || '[]')
  const marks    = localStorage.getItem('currentMarks')     || '6'
  const tone     = localStorage.getItem('currentTone')      || 'friendly'
  const subject  = localStorage.getItem('currentSubject')   || ''
  const topic    = localStorage.getItem('currentTopic')     || ''
  const answer   = localStorage.getItem('studentAnswer')    || ''

  const systemPrompt = `You are MedEssay AI, an intelligent medical study assistant for preclinical students.
Evaluate answers to Anatomy, Physiology, and Biochemistry questions.
TONE: ${tone === 'friendly' ? 'Respond warmly like a supportive senior colleague.' : 'Respond like a precise examiner — direct, no padding.'}
SCORING: Award marks proportionally from keywords covered. Half marks for vague mention, zero for absent.

RESPOND IN THIS EXACT FORMAT — keep headers exactly as written:

### ✅ What You Got Right
[list correct points clearly]

### ❌ What You Missed
[list missing key concepts and why they matter clinically]

### ⚠️ What Was Vague or Incomplete
[list vague points and what precision was needed]

### 💡 Key Concepts Checklist
[each keyword on its own line as: ✅ concept / ⚠️ concept / ❌ concept]

### 📊 Score
[EARNED] / ${marks}
[one-line performance summary]

### 💬 Motivation
[one personalised motivating sentence based on their performance]

${answer === '' ? 'BLANK ANSWER: Provide the model answer immediately and gently ask why it was left blank.' : 'NEVER show model answer unless the student explicitly asks.'}`

  const userPrompt = `Subject: ${subject} | Topic: ${topic}
Question (${marks} marks): ${question}
Required Keywords: [${keywords.join(', ')}]
Student Answer: ${answer === '' ? '[BLANK — student submitted nothing]' : answer}`

  setVisible(false)

  try {
    const aiText = await callClaude({ system: systemPrompt, prompt: userPrompt, maxTokens: 1500 })
    parseAndDisplay(aiText)
  } catch (err) {
    console.error('Feedback API error:', err)
    setVisible(true)
    document.getElementById('feedback-correct').innerHTML =
      '<p style="color:var(--red)">⚠️ Could not load feedback. Make sure the server is running (<code>node server.js</code>) and try again.</p>'
  }

  function parseAndDisplay(text) {
    document.getElementById('feedback-correct').innerHTML  = toHTML(extract(text, '✅ What You Got Right'))
    document.getElementById('feedback-missed').innerHTML   = toHTML(extract(text, '❌ What You Missed'))
    document.getElementById('feedback-vague').innerHTML    = toHTML(extract(text, '⚠️ What Was Vague or Incomplete'))
    document.getElementById('concept-checklist').innerHTML = toChecklist(extract(text, '💡 Key Concepts Checklist'))
    document.getElementById('motivation-line').textContent = extract(text, '💬 Motivation')

    const scoreLine = extract(text, '📊 Score')
    displayScore(scoreLine)
    saveScore(scoreLine)
    setVisible(true)
  }

  function displayScore(scoreLine) {
    const m = scoreLine.match(/(\d+)\s*\/\s*(\d+)/)
    if (!m) {
      document.getElementById('score-summary').textContent = 'See feedback below'
      return
    }
    const pct = Math.round((+m[1] / +m[2]) * 100)
    document.getElementById('score-earned').textContent = m[1]
    document.getElementById('score-total').textContent  = m[2]

    const [summary, color] =
      pct >= 90 ? ['Excellent — exam ready 🌟',           '#22c55e'] :
      pct >= 70 ? ['Good — minor gaps to address',        '#3b82f6'] :
      pct >= 50 ? ['Fair — significant concepts missing', '#f97316'] :
                  ['Needs revision — revisit this topic', '#ef4444']

    document.getElementById('score-summary').textContent      = summary
    document.getElementById('score-banner').style.borderColor = color
  }

  document.getElementById('model-answer-btn').addEventListener('click', async () => {
    const section = document.getElementById('model-answer-section')
    const btn     = document.getElementById('model-answer-btn')

    if (!section.classList.contains('hidden')) {
      section.classList.add('hidden')
      btn.textContent = 'Show Model Answer'
      return
    }

    btn.textContent = 'Loading…'
    try {
      const text = await callClaude({
        prompt: `Write a model answer for this ${marks}-mark medical exam question:
"${question}"
Required key concepts: ${keywords.join(', ')}.
Write a well-structured, accurate, exam-ready answer for a preclinical medical student.
Use clear paragraphs. Include all key concepts, mechanisms, and clinical significance where relevant.`,
        maxTokens: 1200
      })
      document.getElementById('model-answer-content').innerHTML = toHTML(text)
      section.classList.remove('hidden')
      section.scrollIntoView({ behavior: 'smooth', block: 'start' })
      btn.textContent = 'Hide Model Answer'
    } catch {
      btn.textContent = 'Show Model Answer'
      alert('Could not load model answer. Please try again.')
    }
  })

  document.getElementById('try-again-btn').addEventListener('click', () => {
    localStorage.removeItem('studentAnswer')
    window.location.href = 'quiz.html'
  })

  function saveScore(scoreLine) {
    const m = scoreLine.match(/(\d+)\s*\/\s*(\d+)/)
    if (!m) return
    const pct = Math.round((+m[1] / +m[2]) * 100)

    const scores = JSON.parse(localStorage.getItem('scores') || '[]')
    scores.unshift({ subject, topic, score: `${m[1]}/${m[2]}`, percent: pct, date: new Date().toLocaleDateString() })
    localStorage.setItem('scores', JSON.stringify(scores))

    const attempted = (+localStorage.getItem('totalAttempted') || 0) + 1
    localStorage.setItem('totalAttempted', attempted)

    const avg = Math.round(scores.reduce((a, s) => a + s.percent, 0) / scores.length)
    localStorage.setItem('avgScore', `${avg}%`)
  }

})

function setVisible(show) {
  document.getElementById('loading').classList.toggle('hidden', show)
  document.getElementById('score-banner').classList.toggle('hidden', !show)
  document.getElementById('feedback-body').classList.toggle('hidden', !show)
  document.getElementById('feedback-actions').classList.toggle('hidden', !show)
}

async function callClaude({ system, prompt, maxTokens = 1500 }) {
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      ...(system && { system }),
      messages: [{ role: 'user', content: prompt }]
    })
  })
  if (!res.ok) throw new Error(`Server error: ${res.status}`)
  const data = await res.json()
  if (data.error) throw new Error(data.error.message || 'API error')
  return data.content[0].text
}

function extract(text, header) {
  const start = text.indexOf(header)
  if (start === -1) return ''
  const lineEnd  = text.indexOf('\n', start) + 1
  const nextHead = text.indexOf('###', lineEnd)
  return (nextHead === -1 ? text.slice(lineEnd) : text.slice(lineEnd, nextHead)).trim()
}

function toHTML(text) {
  // Parse markdown and sanitize HTML
  const html = marked.parse(text)
  return html
}

function toChecklist(text) {
  const html = marked.parse(text)
  return html.replace(/<\/?p>/g, '')
}