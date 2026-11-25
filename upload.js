// upload.js — File/photo upload + one fixed-mark theory question from the student's notes
document.addEventListener('DOMContentLoaded', () => {

  const MAX_BYTES = 4 * 1024 * 1024   // Netlify request limit is ~6MB once base64-encoded
  const DOC_TYPES = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx'
  }
  const EXT_TYPES = {
    pdf:  'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  }

  const sel = { file: null, fileData: null, fileType: null, tone: null, marks: null }

  const steps = {
    tone:  document.getElementById('step-tone'),
    marks: document.getElementById('step-marks')
  }
  const proceedBtn  = document.getElementById('proceed-btn')
  const uploadZone  = document.getElementById('upload-zone')
  const fileInput   = document.getElementById('file-input')
  const filePreview = document.getElementById('file-preview')
  const uploadError = document.getElementById('upload-error')
  const genError    = document.getElementById('generate-error')

  function showError(el, msg) {
    el.textContent = msg
    el.classList.toggle('hidden', !msg)
  }

  // ── File zone interactions ──
  document.getElementById('browse-btn').addEventListener('click', (e) => {
    e.stopPropagation()
    fileInput.click()
  })
  uploadZone.addEventListener('click', () => fileInput.click())
  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault()
    uploadZone.classList.add('dragover')
  })
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'))
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault()
    uploadZone.classList.remove('dragover')
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  })
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFile(fileInput.files[0])
  })

  document.getElementById('remove-file').addEventListener('click', resetFile)

  function resetFile() {
    sel.file = sel.fileData = sel.fileType = null
    fileInput.value = ''
    filePreview.classList.add('hidden')
    uploadZone.classList.remove('hidden')
    Object.values(steps).forEach(s => s.classList.add('hidden'))
    proceedBtn.classList.add('hidden')
    showError(genError, '')
  }

  async function handleFile(file) {
    showError(uploadError, '')
    showError(genError, '')

    // Some phones/browsers leave file.type empty, so fall back to the extension
    const ext  = (file.name.split('.').pop() || '').toLowerCase()
    const type = file.type || EXT_TYPES[ext] || ''
    const isImage = type.startsWith('image/')

    if (!isImage && !DOC_TYPES[type]) {
      showError(uploadError, 'Unsupported file. Please upload a PDF, DOCX, PPTX or a photo (JPG/PNG).')
      fileInput.value = ''
      return
    }
    if (!isImage && file.size > MAX_BYTES) {
      showError(uploadError, 'File too large. Please upload a file under 4MB, or split it into smaller parts.')
      fileInput.value = ''
      return
    }

    try {
      if (isImage) {
        sel.fileData = await compressImage(file)
        sel.fileType = 'image/jpeg'
      } else {
        sel.fileData = await readBase64(file)
        sel.fileType = type
      }
    } catch {
      showError(uploadError, isImage
        ? 'Could not read this photo. Please take it again or use JPG/PNG.'
        : 'Could not read this file. Please try again.')
      fileInput.value = ''
      return
    }

    sel.file = file
    document.getElementById('file-icon').textContent = isImage ? '📷' : '📄'
    document.getElementById('file-name').textContent = file.name
    document.getElementById('file-size').textContent = (file.size / (1024 * 1024)).toFixed(2) + ' MB'
    uploadZone.classList.add('hidden')
    filePreview.classList.remove('hidden')
    showStep(steps.tone)
  }

  function readBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload  = (e) => resolve(e.target.result.split(',')[1])
      reader.onerror = () => reject(new Error('read failed'))
      reader.readAsDataURL(file)
    })
  }

  // Phone photos are often 3-8MB; shrink to <=1600px JPEG so they fit the request limit
  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        const scale  = Math.min(1, 1600 / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width  = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        URL.revokeObjectURL(url)
        const data = canvas.toDataURL('image/jpeg', 0.82).split(',')[1]
        if (!data || data.length * 0.75 > MAX_BYTES) return reject(new Error('too big'))
        resolve(data)
      }
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')) }
      img.src = url
    })
  }

  // ── Step 2: Tone ──
  document.querySelectorAll('[data-tone]').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('[data-tone]').forEach(c => c.classList.remove('selected'))
      card.classList.add('selected')
      sel.tone = card.dataset.tone
      sel.marks = null
      document.querySelectorAll('.mark-btn').forEach(b => b.classList.remove('selected'))
      proceedBtn.classList.add('hidden')
      showStep(steps.marks)
    })
  })

  // ── Step 3: Marks ──
  document.querySelectorAll('.mark-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mark-btn').forEach(b => b.classList.remove('selected'))
      btn.classList.add('selected')
      sel.marks = btn.dataset.marks
      proceedBtn.classList.remove('hidden')
    })
  })

  // ── Proceed — send file to API ──
  proceedBtn.addEventListener('click', async () => {
    if (!sel.fileData || !sel.tone || !sel.marks) return

    proceedBtn.textContent = 'Reading your notes…'
    proceedBtn.disabled    = true
    showError(genError, '')

    try {
      const res = await fetch('/api/claude', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode:     'upload',
          fileData: sel.fileData,
          fileType: sel.fileType,
          marks:    sel.marks
        })
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.theory) {
        throw new Error(data.error || (res.status === 413
          ? 'File too large. Please use a file under 4MB.'
          : 'Could not set a question from this file. Please try again.'))
      }

      const t = data.theory
      localStorage.setItem('currentQuestion', t.question)
      localStorage.setItem('currentKeywords', JSON.stringify(t.keywords || []))
      localStorage.setItem('currentMarks',    String(t.marks))
      localStorage.setItem('currentWords',    t.expectedWords || '')
      localStorage.setItem('currentTone',     sel.tone)
      localStorage.setItem('currentSubject',  'My Notes')
      localStorage.setItem('currentTopic',    sel.file.name.replace(/\.[^.]+$/, ''))
      localStorage.setItem('uploadSummary',   t.summary || '')
      localStorage.setItem('uploadTeaching',  t.teaching || '')
      localStorage.removeItem('studentAnswer')

      window.location.href = 'quiz.html'

    } catch (err) {
      proceedBtn.textContent = 'Generate Question →'
      proceedBtn.disabled    = false
      showError(genError, err.message === 'Failed to fetch'
        ? 'Network problem. Check your connection and try again.'
        : err.message)
    }
  })

  function showStep(el) {
    el.classList.remove('hidden')
    setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

})
