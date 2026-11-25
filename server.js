// server.js — Local dev server. Runs the SAME function as Netlify so local tests match the live site.
// Put your key in a file named .env next to this one:  GEMINI_API_KEY=your-key
const fs   = require('fs')
const path = require('path')

const envFile = path.join(__dirname, '.env')
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
if (!process.env.GEMINI_API_KEY) {
  console.warn('⚠️  GEMINI_API_KEY is not set. Add it to a .env file (see top of server.js).')
}

const express = require('express')
const { handler } = require('./netlify/functions/api')

const app  = express()
const PORT = process.env.PORT || 3000

app.use(express.text({ type: '*/*', limit: '10mb' }))
app.all('/api/claude', async (req, res) => {
  const result = await handler({
    httpMethod: req.method,
    headers:    { 'x-forwarded-for': req.ip },
    body:       typeof req.body === 'string' ? req.body : ''
  })
  res.status(result.statusCode).set(result.headers).send(result.body)
})
app.use(express.static(__dirname))

app.listen(PORT, () => console.log(`\n✅ MedEssay running at http://localhost:${PORT}/\n`))
