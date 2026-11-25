// upload.js — File/photo upload + one fixed-mark theory question from the student's notes
document.addEventListener('DOMContentLoaded', () => {

  // Files are read in the browser and only text (or small page images) is sent,
  // so big lecture files work. The cap just protects the phone's memory.
  const MAX_BYTES   = 50 * 1024 * 1024
  const MAX_CHARS   = 30000
  const SCAN_PAGES  = 3      // pages sent as images when a PDF has no text layer
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

  const sel = { file: null, payload: null, tone: null, marks: null }

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
    sel.file = sel.payload = null
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
    if (file.size > MAX_BYTES) {
      showError(uploadError, `This file is ${(file.size / 1048576).toFixed(0)}MB. Please use a file under 50MB, or split it into smaller parts.`)
      fileInput.value = ''
      return
    }

    showError(uploadError, '')
    uploadZone.querySelector('.upload-title').textContent = 'Reading your file…'

    try {
      if (isImage) {
        sel.payload = { images: [{ type: 'image/jpeg', data: await compressImage(file) }] }
      } else {
        sel.payload = await readDocument(file, DOC_TYPES[type])
      }
    } catch (err) {
      console.warn('File read failed:', err)
      showError(uploadError, err.userMessage || (isImage
        ? 'Could not read this photo. Please take it again or use JPG/PNG.'
        : 'Could not read this file. If it is password-protected or damaged, try another copy.'))
      fileInput.value = ''
      uploadZone.querySelector('.upload-title').textContent = 'Drop your file here or click to browse'
      return
    }
    uploadZone.querySelector('.upload-title').textContent = 'Drop your file here or click to browse'

    sel.file = file
    document.getElementById('file-icon').textContent = isImage ? '📷' : '📄'
    document.getElementById('file-name').textContent = file.name
    document.getElementById('file-size').textContent = (file.size / (1024 * 1024)).toFixed(2) + ' MB'
    uploadZone.classList.add('hidden')
    filePreview.classList.remove('hidden')
    showStep(steps.tone)
  }

  // ── Reading documents in the browser ──
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve()
      const el = document.createElement('script')
      el.src = src
      el.onload = resolve
      el.onerror = () => reject(new Error('Could not load ' + src))
      document.head.appendChild(el)
    })
  }

  function tooLittleText() {
    const err = new Error('no text')
    err.userMessage = 'This file has almost no readable text. Try a text-based file or a photo of your notes.'
    return err
  }

  async function readDocument(file, kind) {
    const buffer = await file.arrayBuffer()
    let text = ''

    if (kind === 'pdf') {
      await loadScript('vendor/pdf.min.js')
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js'
      const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise
      for (let i = 1; i <= pdf.numPages && text.length < MAX_CHARS; i++) {
        const page    = await pdf.getPage(i)
        const content = await page.getTextContent()
        text += content.items.map(it => it.str).join(' ') + '\n'
      }
      // Scanned PDF (no text layer): send the first pages as images instead
      if (text.replace(/\s/g, '').length < 100) {
        const images = []
        for (let i = 1; i <= Math.min(pdf.numPages, SCAN_PAGES); i++) {
          const page     = await pdf.getPage(i)
          const viewport = page.getViewport({ scale: 1 })
          const scale    = Math.min(2, 1400 / Math.max(viewport.width, viewport.height))
          const vp       = page.getViewport({ scale })
          const canvas   = document.createElement('canvas')
          canvas.width   = Math.round(vp.width)
          canvas.height  = Math.round(vp.height)
          await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise
          images.push({ type: 'image/jpeg', data: canvas.toDataURL('image/jpeg', 0.8).split(',')[1] })
        }
        return { images }
      }
    }

    if (kind === 'docx') {
      await loadScript('vendor/mammoth.browser.min.js')
      text = (await window.mammoth.extractRawText({ arrayBuffer: buffer })).value
    }

    if (kind === 'pptx') {
      await loadScript('vendor/jszip.min.js')
      const zip    = await window.JSZip.loadAsync(buffer)
      const slides = Object.keys(zip.files)
        .filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p))
        .sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)))
      for (const p of slides) {
        const xml = await zip.file(p).async('string')
        const doc = new DOMParser().parseFromString(xml, 'application/xml')
        text += Array.from(doc.getElementsByTagName('a:t')).map(n => n.textContent).join(' ') + '\n'
      }
    }

    text = text.replace(/[ \t]+/g, ' ').trim()
    if (text.length < 100) throw tooLittleText()
    return { fileText: text.slice(0, MAX_CHARS) }
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
        if (!data) return reject(new Error('encode failed'))
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
    if (!sel.payload || !sel.tone || !sel.marks) return

    proceedBtn.textContent = 'Reading your notes…'
    proceedBtn.disabled    = true
    showError(genError, '')

    try {
      const res = await fetch('/api/claude', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'upload', marks: sel.marks, ...sel.payload })
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.theory) {
        throw new Error(data.error || 'Could not set a question from this file. Please try again.')
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
