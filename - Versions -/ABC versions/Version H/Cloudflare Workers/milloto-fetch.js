// MilLoto — Cloudflare Worker
// Fetches the latest Loto 7/39 draw from naslovi.net (primary)
// and stats247.com (fallback), returns clean JSON.
// © 2026 Mil Stamenković
// Created: 22h36'30'' - 30.05.2026.
// Revised: 23h16'21'' - 30.05.2026.



const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const resp = await fetch('https://naslovi.net/vesti/loto-brojevi', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'sr,en;q=0.5',
      },
    });

    if (!resp.ok) throw new Error(`naslovi.net returned ${resp.status}`);

    const html = await resp.text();
    const result = parseNaslovi(html);

    if (result) {
      return new Response(JSON.stringify(result), { headers: CORS_HEADERS });
    }

    throw new Error('Parser found no valid draw data');

  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 503, headers: CORS_HEADERS }
    );
  }
}

// ─── Parser ──────────────────────────────────────────────────────────────────
// naslovi.net structure:
//   <span>petak 29.05.2026</span>
//   <img src="...loto.png" .../>
//   <div class="loto_numbers">
//     <span class="loto_no">1</span>&nbsp;
//     <span class="loto_no">16</span>&nbsp; ...
//   </div>
//   <img src="...loto_plus.png" .../>

function parseNaslovi(html) {
  try {
    // Kolo number: "Rezultati za 43. kolo"
    const koloMatch = html.match(/Rezultati za (\d+)\. kolo/i);
    const kolo = koloMatch ? parseInt(koloMatch[1]) : 0;

    // Date: "petak 29.05.2026"
    const dateMatch = html.match(/(?:ponedeljak|utorak|sreda|četvrtak|petak|subota|nedelja)\s+(\d{2})\.(\d{2})\.(\d{4})/i);
    if (!dateMatch) return null;
    const dateSr = `${dateMatch[1]}.${dateMatch[2]}.${dateMatch[3]}`;

    // Numbers: first loto_numbers div between loto.png and loto_plus.png
    const sectionMatch = html.match(/loto\.png[\s\S]*?class="loto_numbers">([\s\S]*?)<\/div>[\s\S]*?loto_plus\.png/i);
    if (!sectionMatch) return null;

    const nums = [...sectionMatch[1].matchAll(/class="loto_no">(\d+)</g)].map(m => parseInt(m[1]));
    if (nums.length !== 7) return null;
    if (nums.some(n => n < 1 || n > 39)) return null;
    if (new Set(nums).size !== 7) return null;

    nums.sort((a, b) => a - b);
    return { kolo, date: dateSr, nums };

  } catch (e) {
    return null;
  }
}
