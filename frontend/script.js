// script.js — final frontend logic with view toggles, back button, and scrollable results
(() => {
  console.log('[app] script loaded');

  // Elements
  const startBtn = document.getElementById('startBtn');
  const stopBtn  = document.getElementById('stopBtn');
  const searchBtn = document.getElementById('searchBtn');
  const backBtn = document.getElementById('backBtn');
  const transcriptEl = document.getElementById('transcript');
  const resultsEl = document.getElementById('results');
  const mainView = document.getElementById('mainView');
  const resultsView = document.getElementById('resultsView');
  const hintEl = document.getElementById('hint');

  if (!startBtn || !stopBtn || !searchBtn || !transcriptEl || !resultsEl || !mainView || !resultsView) {
    console.error('[app] required DOM elements missing — check index.html IDs');
  }

  // helpers
  const escapeHtml = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const escapeAttr = s => escapeHtml(s).replace(/"/g,'&quot;');

  function showMainView() {
    console.log('[ui] showMainView');
    mainView.style.display = 'block';
    resultsView.style.display = 'none';
    transcriptEl.style.display = '';
    hintEl && (hintEl.style.display = '');
    startBtn.disabled = false;
    stopBtn.disabled = true;
    searchBtn.disabled = transcriptEl.textContent.trim().length === 0;
    // scroll to top of card
    document.querySelector('.card').scrollTop = 0;
  }

  function showResultsView() {
    console.log('[ui] showResultsView');
    mainView.style.display = 'none';
    resultsView.style.display = 'block';
    startBtn.disabled = true;
    stopBtn.disabled = true;
    searchBtn.disabled = false;
    // ensure results container is focused and scrolled to top
    resultsEl.scrollTop = 0;
    resultsView.scrollIntoView({behavior:'smooth', block:'start'});
  }

  // initial state
  stopBtn.disabled = true;
  searchBtn.disabled = true;
  showMainView();

  // Speech recognition
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recog = null;
  if (!SpeechRecognition) {
    transcriptEl.textContent = 'Web Speech API not supported — use Chrome/Edge (Chromium).';
    startBtn.disabled = stopBtn.disabled = searchBtn.disabled = true;
    console.warn('[app] Web Speech API not supported');
  } else {
    recog = new SpeechRecognition();
    recog.lang = 'en-US';
    recog.interimResults = true;
    recog.continuous = false;
    recog.maxAlternatives = 1;

    let finalTranscript = '';
    let autoRetryCount = 0;
    const autoRetryLimit = 2;

    recog.onstart = () => {
      console.log('[recog] started');
      startBtn.disabled = true;
      stopBtn.disabled = false;
      transcriptEl.textContent = '';
      hintEl && (hintEl.textContent = 'Listening… speak clearly.');
    };

    recog.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const r = event.results[i];
        if (r.isFinal) finalTranscript += (r[0].transcript || '').trim() + ' ';
        else interim += (r[0].transcript || '');
      }
      transcriptEl.textContent = (finalTranscript + ' ' + interim).trim();
      searchBtn.disabled = transcriptEl.textContent.trim().length === 0;
    };

    recog.onerror = (e) => {
      console.warn('[recog] error', e);
      if (e.error === 'no-speech') {
        transcriptEl.textContent = 'No speech detected. Try again.';
        autoRetryCount++;
        if (autoRetryCount <= autoRetryLimit) {
          setTimeout(() => { try { recog.start(); } catch(err){ console.warn(err); } }, 700);
        } else {
          autoRetryCount = 0;
          startBtn.disabled = false;
          stopBtn.disabled = true;
          hintEl && (hintEl.textContent = 'Click Start and speak clearly.');
        }
      } else if (e.error === 'not-allowed' || e.error === 'security') {
        transcriptEl.textContent = 'Microphone access blocked — allow microphone and refresh.';
        startBtn.disabled = false;
        stopBtn.disabled = true;
      } else {
        transcriptEl.textContent = 'Error: ' + (e.error || 'unknown');
        startBtn.disabled = false;
        stopBtn.disabled = true;
      }
    };

    recog.onend = () => {
      console.log('[recog] ended');
      startBtn.disabled = false;
      stopBtn.disabled = true;
      if (transcriptEl.textContent.trim()) autoRetryCount = 0;
    };
  }

  // Buttons
  startBtn.addEventListener('click', () => {
    console.log('[btn] start');
    transcriptEl.textContent = '';
    resultsEl.innerHTML = '';
    try {
      if (recog) recog.start();
      else transcriptEl.textContent = 'Speech recognition unavailable.';
    } catch (err) {
      console.warn('start error', err);
    }
  });

  stopBtn.addEventListener('click', () => {
    console.log('[btn] stop');
    try { if (recog) recog.stop(); } catch(e){ console.warn(e); }
    startBtn.disabled = false;
    stopBtn.disabled = true;
  });

  // search handler
  searchBtn.addEventListener('click', async () => {
    const q = transcriptEl.textContent.trim();
    console.log('[btn] search q=', q);
    if (!q) {
      resultsEl.innerHTML = `<div class="result"><div class="snippet">Please speak first (transcript empty).</div></div>`;
      showResultsView();
      return;
    }

    // loading UI
    resultsEl.innerHTML = `<div class="result"><div class="snippet">Searching for <strong>${escapeHtml(q)}</strong>…</div></div>`;
    showResultsView();
    startBtn.disabled = true;
    stopBtn.disabled = true;
    searchBtn.disabled = true;

    try {
      const res = await fetch('/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q })
      });

      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch(e) {
        throw new Error(`Server returned non-JSON response (status ${res.status}): ${text}`);
      }

      if (!res.ok) {
        console.error('[search] server error', json);
        throw new Error(json && (json.error || json.message) ? (json.error || json.message) : `Server error ${res.status}`);
      }

      const providerResp = (json && json.data) ? json.data : json;
      console.log('[search] providerResp', providerResp);
      renderResults(providerResp);
    } catch (err) {
      console.error('[search] error', err);
      resultsEl.innerHTML = `<div class="result"><div class="snippet" style="color:#ffb4b4">Search failed: ${escapeHtml(err.message || String(err))}</div></div>`;
    } finally {
      searchBtn.disabled = false;
    }
  });

  // back button -> go to main search page (keep transcript)
  backBtn && backBtn.addEventListener('click', () => {
    console.log('[btn] back');
    showMainView();
  });

  // renderResults (tries many provider shapes)
  function renderResults(data) {
    resultsEl.innerHTML = '';
    if (!data) {
      resultsEl.innerHTML = `<div class="result"><div class="snippet">No results returned.</div></div>`;
      return;
    }

    let items = [];
    if (Array.isArray(data.items)) items = data.items;
    else if (Array.isArray(data.organic_results)) items = data.organic_results;
    else if (Array.isArray(data.results)) items = data.results;
    else if (Array.isArray(data.organic)) items = data.organic;
    else {
      for (const k of Object.keys(data)) {
        if (Array.isArray(data[k]) && data[k].length && typeof data[k][0] === 'object') {
          items = data[k];
          break;
        }
      }
    }

    if (!items || items.length === 0) {
      resultsEl.innerHTML = `<div class="result"><div class="snippet">No results found.</div></div>`;
      return;
    }

    items.slice(0, 20).forEach(it => {
      const title = it.title || it.name || it.headline || it.title_no_formatting || '';
      const link = it.link || it.url || it.destination || it.source || '#';
      const snippet = it.snippet || it.description || it.snippet_text || '';
      const r = document.createElement('div');
      r.className = 'result';
      r.innerHTML = `
        <a href="${escapeAttr(link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title || link)}</a>
        <div class="snippet">${escapeHtml(snippet || '')}</div>
        <div class="url">${escapeHtml(link)}</div>
      `;
      resultsEl.appendChild(r);
    });

    // ensure results are scrollable and shown
    resultsEl.scrollTop = 0;
    resultsEl.style.display = 'flex';
  }

  // final log
  console.log('[app] initialized');
})();
