// MilLoto — Cloudflare Worker with KV storage
// milloto.pages.dev / milstamenkovic.github.io/milloto
// Fetches latest Loto 7/39 draws from naslovi.net
// Stores all draws in KV — returns full accumulated archive
// © 2026 Mil Stamenković
// Created: 05.06.2026. - Ćuprija, Serbia
// Revised: 05.06.2026. - Ćuprija, Serbia

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const KV_KEY = 'draws';

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    // 1. Load existing archive from KV
    const stored = await MILLOTO_KV.get(KV_KEY, { type: 'json' });
    const archive = Array.isArray(stored) ? stored : [];
    const existingDates = new Set(archive.map(d => d.date));

    // 2. Fetch latest draws from naslovi.net
    let newDraws = [];
    try {
      const resp = await fetch('https://naslovi.net/vesti/loto-brojevi', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'sr,en;q=0.5',
        },
      });
      if (resp.ok) {
        const html = await resp.text();
        const parsed = parseNaslovi(html);
        // Only keep draws not already in archive
        newDraws = parsed.filter(d => !existingDates.has(d.date));
      }
    } catch (e) { /* naslovi fetch failed, return existing archive */ }

    // 3. If new draws found, save updated archive to KV
    if (newDraws.length > 0) {
      const updated = [...newDraws, ...archive];
      // Sort descending by date
      updated.sort((a, b) => {
        const [da,ma,ya] = a.date.split('.').map(Number);
        const [db,mb,yb] = b.date.split('.').map(Number);
        return new Date(yb,mb-1,db) - new Date(ya,ma-1,da);
      });
      // Save to KV (no expiry — permanent storage)
      await MILLOTO_KV.put(KV_KEY, JSON.stringify(updated));
      return new Response(JSON.stringify({ draws: updated, new: newDraws.length }), { headers: CORS_HEADERS });
    }

    // 4. No new draws — return existing archive
    return new Response(JSON.stringify({ draws: archive, new: 0 }), { headers: CORS_HEADERS });

  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 503, headers: CORS_HEADERS }
    );
  }
}

// ─── Parser ──────────────────────────────────────────────────────────────────
// Extracts ALL draw blocks from naslovi.net page (~10 most recent)

function parseNaslovi(html) {
  const draws = [];

  // Collect all dates in page order
  const datePattern = /(?:ponedeljak|utorak|sreda|četvrtak|petak|subota|nedelja)\s+(\d{2})\.(\d{2})\.(\d{4})/gi;
  const dates = [];
  let dm;
  while ((dm = datePattern.exec(html)) !== null) {
    dates.push(`${dm[1]}.${dm[2]}.${dm[3]}`);
  }

  // Collect all draw blocks
  const blockPattern = /Rezultati za (\d+)\. kolo[\s\S]*?loto\.png[\s\S]*?class="loto_numbers">([\s\S]*?)<\/div>[\s\S]*?loto_plus\.png/gi;
  let bm;
  let idx = 0;

  while ((bm = blockPattern.exec(html)) !== null) {
    try {
      const kolo = parseInt(bm[1]);
      const date = dates[idx];
      if (!date) { idx++; continue; }

      const nums = [...bm[2].matchAll(/class="loto_no">(\d+)</g)].map(m => parseInt(m[1]));
      if (nums.length !== 7) { idx++; continue; }
      if (nums.some(n => n < 1 || n > 39)) { idx++; continue; }
      if (new Set(nums).size !== 7) { idx++; continue; }

      nums.sort((a, b) => a - b);
      const year = parseInt(date.split('.')[2]);
      draws.push({ kolo, date, nums, year });
    } catch (e) { /* skip */ }
    idx++;
  }

  return draws;
}
