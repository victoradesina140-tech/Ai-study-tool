// ai.js — Home page stats + Daily Clinical Pearl
document.addEventListener('DOMContentLoaded', () => {

  // ── Stats ──
  const set = (id, val) => { document.getElementById(id).textContent = val }
  set('total-attempted', localStorage.getItem('totalAttempted') || '0')
  set('total-score',     localStorage.getItem('avgScore')       || '—')
  set('streak',          localStorage.getItem('streak')         || '0')

  // ── Daily Clinical Pearl ──
  const SUBJECTS = [
    'Anatomy', 'Physiology', 'Biochemistry',
  ]

  let currentIndex = 0

  const pearlText    = document.getElementById('pearl-text')
  const pearlSubject = document.getElementById('pearl-subject')
  const pearlLoading = document.getElementById('pearl-loading')
  const pearlPrev    = document.getElementById('pearl-prev')
  const pearlNext    = document.getElementById('pearl-next')

  // Key per subject per day — refreshes automatically next day
  function cacheKey(subject) {
    const today = new Date().toISOString().split('T')[0]
    return `pearl_${subject.replace(/\s+/g, '_').toLowerCase()}_${today}`
  }

  async function loadPearl(subject) {
    pearlSubject.textContent = subject

    const cached = localStorage.getItem(cacheKey(subject))
    if (cached) {
      pearlText.textContent = cached
      return
    }

    // Show loading, hide text
    pearlText.classList.add('hidden')
    pearlLoading.classList.remove('hidden')

    try {
      const res = await fetch('/api/claude', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model:      'gemini-flash-lite-latest',
          max_tokens: 200,
          messages: [{
            role:    'user',
            content: `Give one fascinating, clinically relevant daily fact or pearl about ${subject} for a medical student. Make it specific, memorable, and useful in exams or clinic. Respond with ONLY the fact itself in 2-3 sentences. No title, no prefix, no markdown, no bullet points.`
          }]
        })
      })

      const data = await res.json()
      if (data.error) throw new Error(data.error)

      const pearl = data.content[0].text.trim()
      localStorage.setItem(cacheKey(subject), pearl)
      pearlText.textContent = pearl

    } catch (err) {
      console.error('Pearl fetch failed:', err)
      pearlText.textContent = 'Could not load today\'s pearl. Refresh to try again.'
    } finally {
      pearlLoading.classList.add('hidden')
      pearlText.classList.remove('hidden')
    }
  }

  // ── Navigation ──
  pearlPrev.addEventListener('click', () => {
    currentIndex = (currentIndex - 1 + SUBJECTS.length) % SUBJECTS.length
    loadPearl(SUBJECTS[currentIndex])
  })
  pearlNext.addEventListener('click', () => {
    currentIndex = (currentIndex + 1) % SUBJECTS.length
    loadPearl(SUBJECTS[currentIndex])
  })

  // Load first pearl on page load
  loadPearl(SUBJECTS[currentIndex])

})