// theme.js — Dark/Light mode toggle (include on every page)
;(function () {
  const saved = localStorage.getItem('medesssay-theme') || 'dark'
  document.documentElement.setAttribute('data-theme', saved)

  function injectToggle() {
    const btn = document.createElement('button')
    btn.className    = 'theme-toggle'
    btn.title        = 'Toggle theme'
    btn.setAttribute('aria-label', 'Toggle dark/light mode')
    btn.textContent  = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙'

    btn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme')
      const next    = current === 'dark' ? 'light' : 'dark'
      document.documentElement.setAttribute('data-theme', next)
      localStorage.setItem('medesssay-theme', next)
      btn.textContent = next === 'dark' ? '☀️' : '🌙'
    })

    document.body.appendChild(btn)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectToggle)
  } else {
    injectToggle()
  }
})()