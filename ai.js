// ai.js — Home page stats
document.addEventListener('DOMContentLoaded', () => {
  const set = (id, val) => { document.getElementById(id).textContent = val }
  set('total-attempted', localStorage.getItem('totalAttempted') || '0')
  set('total-score',     localStorage.getItem('avgScore')       || '—')
  set('streak',          localStorage.getItem('streak')         || '0')
})