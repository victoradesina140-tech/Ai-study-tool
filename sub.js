// sub.js — Subject selection flow
document.addEventListener('DOMContentLoaded', () => {

  const TOPICS = {
    anatomy: [
      'Upper Limb','Lower Limb','Thorax','Abdomen',
      'Pelvis & Perineum','Head & Neck','Back & Spine',
      'Neuroanatomy','Histology','Embryology','General Anatomy'
    ],
    physiology: [
      'Cell Physiology','Blood & Immunology','Cardiovascular',
      'Respiratory','Renal','Gastrointestinal','Endocrine',
      'Neurophysiology','Reproductive Physiology'
    ],
    biochemistry: [
      'Amino Acids & Proteins','Carbohydrates','Lipids',
      'Nucleotides & Nucleic Acids','Enzymes',
      'Glycolysis & Gluconeogenesis','TCA Cycle',
      'Oxidative Phosphorylation','Fatty Acid Metabolism',
      'Amino Acid Catabolism & Urea Cycle','Vitamins & Nutrition',
      'Molecular Biology','Haem Synthesis & Bilirubin'
    ]
  }

  const sel = { subject: null, topic: null, tone: null, marks: null }
  const steps = {
    topic: document.getElementById('step-topic'),
    tone:  document.getElementById('step-tone'),
    marks: document.getElementById('step-marks')
  }
  const proceedBtn = document.getElementById('proceed-btn')
  const topicList  = document.getElementById('topic-list')

  function showStep(el) {
    el.classList.remove('hidden')
    setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  function hideFrom(key) {
    const order = ['topic','tone','marks']
    order.slice(order.indexOf(key)).forEach(k => steps[k].classList.add('hidden'))
    proceedBtn.classList.add('hidden')
  }

  // Step 1 — Subject
  document.querySelectorAll('.subject-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.subject-card').forEach(c => c.classList.remove('selected'))
      card.classList.add('selected')
      sel.subject = card.dataset.subject
      sel.topic = sel.tone = sel.marks = null

      topicList.innerHTML = TOPICS[sel.subject].map(t =>
        `<button class="topic-btn" data-topic="${t}">${t}</button>`
      ).join('')

      hideFrom('topic')
      showStep(steps.topic)
    })
  })

  // Step 2 — Topic (delegated)
  topicList.addEventListener('click', e => {
    const btn = e.target.closest('.topic-btn')
    if (!btn) return
    topicList.querySelectorAll('.topic-btn').forEach(b => b.classList.remove('selected'))
    btn.classList.add('selected')
    sel.topic = btn.dataset.topic
    sel.tone = sel.marks = null
    hideFrom('tone')
    showStep(steps.tone)
  })

  // Step 3 — Tone
  document.querySelectorAll('.tone-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.tone-card').forEach(c => c.classList.remove('selected'))
      card.classList.add('selected')
      sel.tone = card.dataset.tone
      sel.marks = null
      hideFrom('marks')
      showStep(steps.marks)
    })
  })

  // Step 4 — Marks
  document.querySelectorAll('.mark-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mark-btn').forEach(b => b.classList.remove('selected'))
      btn.classList.add('selected')
      sel.marks = btn.dataset.marks
      proceedBtn.classList.remove('hidden')
    })
  })

  // Proceed
  proceedBtn.addEventListener('click', () => {
    if (!sel.subject || !sel.topic || !sel.tone || !sel.marks) return
    localStorage.setItem('selectedSubject', sel.subject)
    localStorage.setItem('selectedTopic',   sel.topic)
    localStorage.setItem('selectedTone',    sel.tone)
    localStorage.setItem('selectedMarks',   sel.marks)
    window.location.href = 'quiz.html'
  })

})