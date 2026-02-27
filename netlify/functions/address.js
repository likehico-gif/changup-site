// ═══════════════════════════════════════════
// 창업지도 — 도로명주소 검색 API (Netlify Function)
// 행정안전부 도로명주소 API 프록시
// ═══════════════════════════════════════════

const https = require('https');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 8000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  const { keyword } = event.queryStringParameters || {};
  if (!keyword) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: '검색어가 필요합니다' }) };
  }

  const JUSO_KEY = process.env.JUSO_KEY;
  const url = `https://business.juso.go.kr/addrlink/addrLinkApi.do`
    + `?confmKey=${JUSO_KEY}&currentPage=1&countPerPage=5`
    + `&keyword=${encodeURIComponent(keyword)}&resultType=json`;

  const result = await fetchJson(url);
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(result || { results: { juso: [] } })
  };
};
