// mcq.js — Topic MCQs: generate N questions in batches, answer, mark locally
document.addEventListener('DOMContentLoaded', () => {

  const SIZES   = [20, 40, 60, 80, 100]
  const BATCH   = 10
  const subject = localStorage.getItem('mcqSubject')
  const topic   = localStorage.getItem('mcqTopic')
  const size    = parseInt(localStorage.getItem('mcqSize'))

  if (!subject || !topic || !SIZES.includes(size)) {
    window.location.href = 'sub.html'
    return
  }

  // Spread batches across different angles so parallel batches don't overlap
  const FOCUS = [
    'definitions and key facts', 'mechanisms and processes', 'clinical correlations',
    'structure, relations and components', 'regulation and control', 'values, numbers and classifications',
    'classic exam favourites', 'development, histology or molecular basis', 'disorders and their basis',
    'integration with related topics'
  ]

  const $ = id => document.getElementById(id)
  $('display-subject').textContent = cap(subject)
  $('display-topic').textContent   = topic
  $('display-marks').textContent   = `${size} marks`

  const historyKey = `mcq_asked_${subject}_${topic}`.replace(/\s+/g, '_').toLowerCase()
  let questions = []
  let answers   = []

  $('retry-btn').addEventListener('click', start)
  $('new-set-btn').addEventListener('click', start)
  $('submit-btn').addEventListener('click', mark)

  start()

  async function start() {
    show('loading')
    window.scrollTo(0, 0)
    questions = []
    const asked = readJson(historyKey, [])
    const seen  = new Set(asked.map(norm))

    try {
      // First round runs all batches in parallel; later rounds top up anything missing or duplicated
      for (let round = 0; round < 3 && questions.length < size; round++) {
        const missing = size - questions.length
        const batches = []
        for (let i = 0; i < Math.ceil(missing / BATCH); i++) {
          // Top-up rounds ask for a few spares in case some come back invalid or duplicated
          const n = Math.min(BATCH, missing - i * BATCH + (round > 0 ? 3 : 0))
          batches.push(fetchBatch(n, FOCUS[(i + round * 3) % FOCUS.length], asked.slice(0, 40)))
        }
        const results = await Promise.allSettled(batches)
        for (const r of results) {
          if (r.status !== 'fulfilled') {
            if (r.reason && r.reason.status === 429) throw r.reason
            continue
          }
          for (const q of r.value) {
            const key = norm(q.question)
            if (seen.has(key) || questions.length >= size) continue
            seen.add(key)
            questions.push(q)
          }
        }
        $('loading-text').textContent = `Setting your questions… ${questions.length}/${size}`
      }

      if (questions.length < size) throw new Error(`Only got ${questions.length} questions`)

      localStorage.setItem(historyKey, JSON.stringify(questions.map(q => q.question).concat(asked).slice(0, 200)))
      render()
    } catch (err) {
      $('mcq-error-text').textContent = err.userMessage || 'We could not set your questions right now. Please check your connection and try again.'
      show('error')
    }
  }

  async function fetchBatch(count, focus, avoid) {
    const res = await fetch('/api/claude', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'mcq', subject: cap(subject), topic, count, focus, avoid })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !Array.isArray(data.questions)) {
      const err = new Error(data.error || `HTTP ${res.status}`)
      err.status = res.status
      err.userMessage = data.error
      throw err
    }
    return data.questions
  }

  function render() {
    answers = new Array(questions.length).fill(null)
    $('mcq-list').innerHTML = questions.map((q, i) => `
      <li class="mcq-item" data-i="${i}">
        <p class="mcq-stem"><span class="mcq-num">${i + 1}.</span> ${esc(q.question)}</p>
        <div class="mcq-options">
          ${q.options.map((o, j) => `
            <button type="button" class="mcq-option" data-q="${i}" data-o="${j}">
              <span class="mcq-letter">${'ABCD'[j]}</span><span>${esc(o)}</span>
            </button>`).join('')}
        </div>
        <p class="mcq-explain hidden"></p>
      </li>`).join('')
    updateProgress()
    show('list')
  }

  $('mcq-list').addEventListener('click', e => {
    const btn = e.target.closest('.mcq-option')
    if (!btn || btn.disabled) return
    const qi = +btn.dataset.q
    answers[qi] = +btn.dataset.o
    btn.parentElement.querySelectorAll('.mcq-option').forEach(b => b.classList.toggle('selected', b === btn))
    updateProgress()
  })

  function updateProgress() {
    const done = answers.filter(a => a !== null).length
    $('mcq-progress').textContent = `${done} of ${questions.length} answered`
  }

  function mark() {
    const unanswered = answers.filter(a => a === null).length
    if (unanswered && !confirm(`You have ${unanswered} unanswered question${unanswered > 1 ? 's' : ''}. Submit anyway?`)) return

    let score = 0
    document.querySelectorAll('.mcq-item').forEach(item => {
      const i = +item.dataset.i
      const q = questions[i]
      const right = answers[i] === q.answerIndex
      if (right) score++
      item.classList.add(right ? 'is-right' : 'is-wrong')
      item.querySelectorAll('.mcq-option').forEach(b => {
        const j = +b.dataset.o
        b.disabled = true
        if (j === q.answerIndex) b.classList.add('correct')
        else if (j === answers[i]) b.classList.add('wrong')
      })
      const ex = item.querySelector('.mcq-explain')
      ex.textContent = `${right ? '✅' : '❌'} Answer: ${'ABCD'[q.answerIndex]}. ${q.explanation}`
      ex.classList.remove('hidden')
    })

    const pct = Math.round((score / questions.length) * 100)
    $('score-earned').textContent = score
    $('score-total').textContent  = questions.length
    $('score-summary').textContent =
      pct >= 90 ? 'Excellent — exam ready 🌟' :
      pct >= 70 ? 'Good — minor gaps to address' :
      pct >= 50 ? 'Fair — review the ones you missed' :
                  'Needs revision — revisit this topic'

    saveScore(score, questions.length, pct)
    $('score-banner').classList.remove('hidden')
    $('mcq-actions').classList.add('hidden')
    $('after-actions').classList.remove('hidden')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function saveScore(score, total, pct) {
    const scores = readJson('scores', [])
    scores.unshift({ subject, topic: `${topic} (MCQ)`, score: `${score}/${total}`, percent: pct, date: new Date().toLocaleDateString() })
    localStorage.setItem('scores', JSON.stringify(scores))
    localStorage.setItem('totalAttempted', (+localStorage.getItem('totalAttempted') || 0) + 1)
    const avg = Math.round(scores.reduce((a, s) => a + s.percent, 0) / scores.length)
    localStorage.setItem('avgScore', `${avg}%`)
  }

  function show(which) {
    $('loading').classList.toggle('hidden', which !== 'loading')
    $('mcq-error').classList.toggle('hidden', which !== 'error')
    $('mcq-list').classList.toggle('hidden', which !== 'list')
    $('mcq-actions').classList.toggle('hidden', which !== 'list')
    $('score-banner').classList.add('hidden')
    $('after-actions').classList.add('hidden')
    if (which === 'loading') $('loading-text').textContent = `Setting your questions… 0/${size}`
  }

})

function cap(s)  { return s ? s[0].toUpperCase() + s.slice(1) : '' }
function norm(s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, '') }
function esc(s)  { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) }
function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback } catch { return fallback }
}
