// server.js - Express backend for Speech→Search app
require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch'); // if node-fetch v3 installed, use: const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const path = require('path');

const app = express();
const cache = new NodeCache({ stdTTL: 300 }); // 5 minutes cache

const PORT = process.env.PORT || 3000;
const PROVIDER = process.env.PROVIDER || 'SERPAPI';

app.use(helmet());
app.use(express.json({ limit: '100kb' }));
app.use(cors()); // in production, set origin explicitly
app.use(morgan('dev'));

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120
});
app.use(limiter);

// health
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// POST /search -> { q: "..." }
app.post('/search', async (req, res) => {
  try {
    const q = (req.body && req.body.q || '').trim();
    if (!q) return res.status(400).json({ error: 'Missing q in request body' });

    const cacheKey = `search:${PROVIDER}:${q.toLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json({ cached: true, data: cached });

    let json;
    if (PROVIDER === 'SERPAPI') {
      const key = process.env.SERPAPI_KEY;
      if (!key) return res.status(500).json({ error: 'SERPAPI_KEY not configured' });
      const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(q)}&api_key=${encodeURIComponent(key)}`;
      const r = await fetch(url, { timeout: 10000 });
      json = await r.json();
    } else if (PROVIDER === 'GOOGLE') {
      const key = process.env.GOOGLE_API_KEY;
      const cx = process.env.GOOGLE_CX;
      if (!key || !cx) return res.status(500).json({ error: 'Google API key/CX not configured' });
      const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(key)}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(q)}`;
      const r = await fetch(url, { timeout: 10000 });
      json = await r.json();
    } else {
      return res.status(500).json({ error: 'Unsupported provider' });
    }

    cache.set(cacheKey, json);
    return res.json({ cached: false, data: json });
  } catch (err) {
    console.error('search error', err);
    return res.status(500).json({ error: 'Server error', details: String(err && err.message ? err.message : err) });
  }
});

// Serve frontend static files from ../public (adjust if your structure differs)
const publicPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(publicPath, { extensions: ['html'] }));

// fallback to index.html for single-page frontends
app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT} (PROVIDER=${PROVIDER})`);
});
