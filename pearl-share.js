// pearl-share.js — share the Daily Course Fact to WhatsApp, X, clipboard or the phone's share sheet
document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id)
  const siteUrl = location.origin.startsWith('http') ? location.origin + '/' : 'https://medessay.netlify.app/'

  function shareText() {
    const subject = $('pearl-subject').textContent.trim()
    const fact    = $('pearl-text').textContent.trim()
    return `Daily ${subject} fact from MedEssay: ${fact}\n\nPractise MCQs and theory free at ${siteUrl}`
  }
  const ready = () => {
    const t = $('pearl-text').textContent
    return t && !/^Loading|^Could not load/.test(t)
  }

  $('share-wa').addEventListener('click', e => {
    if (!ready()) return e.preventDefault()
    e.currentTarget.href = 'https://wa.me/?text=' + encodeURIComponent(shareText())
  })
  $('share-x').addEventListener('click', e => {
    if (!ready()) return e.preventDefault()
    e.currentTarget.href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(shareText().slice(0, 270))
  })

  const copyBtn = $('share-copy')
  copyBtn.addEventListener('click', async () => {
    if (!ready()) return
    try {
      await navigator.clipboard.writeText(shareText())
      copyBtn.textContent = 'Copied ✓'
    } catch {
      copyBtn.textContent = 'Copy failed'
    }
    setTimeout(() => { copyBtn.textContent = 'Copy' }, 1800)
  })

  // Phones: native share sheet (Instagram, Telegram, Snapchat…)
  if (navigator.share) {
    const native = $('share-native')
    native.classList.remove('hidden')
    native.addEventListener('click', () => {
      if (!ready()) return
      navigator.share({ title: 'MedEssay Daily Fact', text: shareText() }).catch(() => {})
    })
  }
})
