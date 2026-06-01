// scores.js — High Scores page
document.addEventListener('DOMContentLoaded', () => {

  const scores = JSON.parse(localStorage.getItem('scores') || '[]')
  let filter = 'all'

  function render() {
    const list     = document.getElementById('scores-list')
    const noScores = document.getElementById('no-scores')
    const filtered = filter === 'all' ? scores : scores.filter(s => s.subject === filter)

    if (!filtered.length) {
      list.innerHTML = ''
      noScores.classList.remove('hidden')
      return
    }
    noScores.classList.add('hidden')
    list.innerHTML = filtered.map((e, i) => `
      <div class="score-entry">
        <span class="rank">${i + 1}</span>
        <span class="topic">${e.topic} <small style="color:var(--t3)">(${e.subject})</small></span>
        <span class="score">${e.score}</span>
        <span class="date">${e.date}</span>
      </div>
    `).join('')
  }

  render()

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      filter = btn.dataset.filter
      render()
    })
  })

  document.getElementById('clear-scores-btn').addEventListener('click', () => {
    if (!confirm('Clear all scores? This cannot be undone.')) return
    ;['scores','totalAttempted','avgScore'].forEach(k => localStorage.removeItem(k))
    window.location.reload()
  })

})