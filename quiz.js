// quiz.js — Question generation + answer submission
document.addEventListener('DOMContentLoaded', async () => {

  const subject = localStorage.getItem('selectedSubject') || 'Physiology'
  const topic   = localStorage.getItem('selectedTopic')   || 'Respiratory'
  const tone    = localStorage.getItem('selectedTone')    || 'friendly'
  const marks   = localStorage.getItem('selectedMarks')   || '6'

  document.getElementById('display-subject').textContent = cap(subject)
  document.getElementById('display-topic').textContent   = topic
  document.getElementById('display-tone').textContent    = tone === 'friendly' ? '😊 Friendly Mode' : '🎓 Strict Mode'
  document.getElementById('display-marks').textContent   = `${marks} marks`

  function setLoading(on) {
    document.getElementById('loading').classList.toggle('hidden', !on)
    document.getElementById('question-box').classList.toggle('hidden', on)
    document.getElementById('answer-area').classList.toggle('hidden', on)
    document.getElementById('quiz-actions').classList.toggle('hidden', on)
  }

  try {
    const raw = await callClaude({
      system: `You are a medical examiner. Respond ONLY with valid JSON. No markdown, no code blocks, no explanation.`,
      prompt: `Generate one essay or short-answer exam question on the topic "${topic}" in ${cap(subject)} worth ${marks} marks.

Return exactly this JSON structure (nothing else):
{"question":"full question text here","keywords":["keyword1","keyword2","keyword3"]}

Rules:
- Question must be appropriate for a ${marks}-mark answer
- Include at least ${Math.ceil(parseInt(marks) * 1.2)} specific medical keywords
- Keywords must be precise medical terms required for full marks`,
      maxTokens: 600
    })

    const clean = raw.replace(/```json|```/g, '').trim()
    const { question, keywords } = JSON.parse(clean)

    document.getElementById('question-text').textContent = question
    localStorage.setItem('currentQuestion', question)
    localStorage.setItem('currentKeywords', JSON.stringify(keywords))
    localStorage.setItem('currentMarks',    marks)
    localStorage.setItem('currentTone',     tone)
    localStorage.setItem('currentSubject',  subject)
    localStorage.setItem('currentTopic',    topic)

  } catch (err) {
    console.error('Question generation failed:', err)
    const fallback = `Write a detailed ${marks}-mark answer on "${topic}" as studied in ${cap(subject)}. Include all key mechanisms, structures, and clinical relevance.`
    document.getElementById('question-text').textContent = fallback
    localStorage.setItem('currentQuestion', fallback)
    localStorage.setItem('currentKeywords', '[]')
  }

  setLoading(false)

  const textarea  = document.getElementById('student-answer')
  const wordCount = document.getElementById('word-count')
  textarea.addEventListener('input', () => {
    const n = textarea.value.trim() ? textarea.value.trim().split(/\s+/).length : 0
    wordCount.textContent = `${n} word${n !== 1 ? 's' : ''}`
  })

  document.getElementById('clear-btn').addEventListener('click', () => {
    textarea.value = ''
    wordCount.textContent = '0 words'
    textarea.focus()
  })

  document.getElementById('submit-btn').addEventListener('click', () => {
    localStorage.setItem('studentAnswer', textarea.value.trim())
    window.location.href = 'feedback.html'
  })

})

async function callClaude({ system, prompt, maxTokens = 1000 }) {
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

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : '' }