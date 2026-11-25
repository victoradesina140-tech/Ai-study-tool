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

  const sel = { subject: null, topic: null, size: null }
  const steps = {
    topic: document.getElementById('step-topic'),
    size:  document.getElementById('step-size')
  }
  const proceedBtn = document.getElementById('proceed-btn')
  const topicList  = document.getElementById('topic-list')

  function showStep(el) {
    el.classList.remove('hidden')
    setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  function hideFrom(key) {
    const order = ['topic', 'size']
    order.slice(order.indexOf(key)).forEach(k => steps[k].classList.add('hidden'))
    proceedBtn.classList.add('hidden')
  }

  // Step 1 — Subject
  document.querySelectorAll('.subject-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.subject-card').forEach(c => c.classList.remove('selected'))
      card.classList.add('selected')
      sel.subject = card.dataset.subject
      sel.topic = sel.size = null

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
    sel.size = null
    hideFrom('size')
    showStep(steps.size)
  })

  // Step 3 — Number of questions
  document.querySelectorAll('[data-size]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-size]').forEach(b => b.classList.remove('selected'))
      btn.classList.add('selected')
      sel.size = btn.dataset.size
      proceedBtn.classList.remove('hidden')
    })
  })

  // Proceed
  proceedBtn.addEventListener('click', () => {
    if (!sel.subject || !sel.topic || !sel.size) return
    localStorage.setItem('mcqSubject', sel.subject)
    localStorage.setItem('mcqTopic',   sel.topic)
    localStorage.setItem('mcqSize',    sel.size)
    window.location.href = 'mcq.html'
  })

})
