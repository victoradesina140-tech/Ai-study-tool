// quiz.js — Answer a theory question that was set from the student's uploaded notes
document.addEventListener('DOMContentLoaded', () => {

  const question = localStorage.getItem('currentQuestion')
  if (!question) {
    window.location.href = 'upload.html'
    return
  }

  const marks = localStorage.getItem('currentMarks') || '6'
  const tone  = localStorage.getItem('currentTone')  || 'friendly'
  const words = localStorage.getItem('currentWords') || ''
  const $ = id => document.getElementById(id)

  $('display-subject').textContent = '📄 My Notes'
  $('display-topic').textContent   = (localStorage.getItem('currentTopic') || 'Uploaded File').slice(0, 30)
  $('display-tone').textContent    = tone === 'friendly' ? '😊 Friendly Mode' : '🎓 Strict Mode'
  $('display-marks').textContent   = `${marks} mark${marks === '1' ? '' : 's'}`
  $('question-text').textContent   = question
  if (words) $('answer-hint').textContent = `Aim for about ${words} words.`

  const summary  = localStorage.getItem('uploadSummary')  || ''
  const teaching = localStorage.getItem('uploadTeaching') || ''
  if (summary || teaching) {
    $('upload-summary').textContent  = summary
    $('upload-teaching').textContent = teaching
    $('upload-teaching-box').classList.remove('hidden')
  }

  $('loading').classList.add('hidden')
  ;['question-box', 'answer-area', 'quiz-actions'].forEach(id => $(id).classList.remove('hidden'))

  // ── Answer interactions ──
  const textarea  = $('student-answer')
  const wordCount = $('word-count')

  textarea.addEventListener('input', () => {
    const n = textarea.value.trim() ? textarea.value.trim().split(/\s+/).length : 0
    wordCount.textContent = `${n} word${n !== 1 ? 's' : ''}`
  })

  $('clear-btn').addEventListener('click', () => {
    textarea.value = ''
    wordCount.textContent = '0 words'
    textarea.focus()
  })

  $('submit-btn').addEventListener('click', () => {
    localStorage.setItem('studentAnswer', textarea.value.trim())
    window.location.href = 'feedback.html'
  })

})
