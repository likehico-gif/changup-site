// ═══════════════════════════════════════════════
// 창업지도 — 통합 상권 분석 API (Netlify Function)
// 소상공인 상권 + VWorld 토지이용 + 건축물대장
// ═══════════════════════════════════════════════

const https = require('https');
const http = require('http');

// URL fetch 헬퍼
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: 8000 }, (res) => {
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

// 업종 코드 매핑 (소상공인 API 대분류)
function getBizCategoryCode(bizType) {
  const map = {
    '카페': 'Q12', '커피': 'Q12', '음료': 'Q12',
    '한식': 'Q01', '식당': 'Q01', '밥집': 'Q01',
    '치킨': 'Q09', '닭': 'Q09',
    '피자': 'Q09', '햄버거': 'Q09', '패스트푸드': 'Q09',
    '편의점': 'D20', 'cvs': 'D20',
    '마트': 'D10', '슈퍼': 'D10',
    '옷': 'D30', '의류': 'D30', '패션': 'D30',
    '미용': 'R04', '헤어': 'R04', '뷰티': 'R04',
    '학원': 'S01', '교육': 'S01',
    '약국': 'L01', '병원': 'L02',
    '술집': 'Q07', '주점': 'Q07', '바': 'Q07',
  };
  if (!bizType) return null;
  const lower = bizType.toLowerCase();
  for (const [key, code] of Object.entries(map)) {
    if (lower.includes(key)) return code;
  }
  return null;
}

// 용도지역 규제 분석
function analyzeLandUse(zoneType) {
  if (!zoneType) return { canOperate: true, warning: null, grade: '확인필요' };
  const zone = zoneType.toString();

  if (zone.includes('전용주거')) {
    return { canOperate: false, warning: '⚠️ 전용주거지역: 음식점·상가 영업 불가', grade: '불가' };
  }
  if (zone.includes('일반주거')) {
    return { canOperate: true, warning: '주의: 일반주거지역 — 일부 업종 인허가 제한', grade: '주의' };
  }
  if (zone.includes('상업') || zone.includes('근린상업') || zone.includes('일반상업')) {
    return { canOperate: true, warning: null, grade: '최적' };
  }
  if (zone.includes('준주거') || zone.includes('준공업')) {
    return { canOperate: true, warning: '준주거/준공업지역 — 대부분 업종 가능', grade: '양호' };
  }
  if (zone.includes('공업')) {
    return { canOperate: false, warning: '⚠️ 공업지역: 일반 상업시설 영업 제한', grade: '주의' };
  }
  if (zone.includes('녹지') || zone.includes('관리') || zone.includes('농림')) {
    return { canOperate: false, warning: '⚠️ 녹지/관리지역: 상업시설 설치 불가', grade: '불가' };
  }
  return { canOperate: true, warning: null, grade: '확인필요' };
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const { lat, lng, bizType, radius = '500' } = event.queryStringParameters || {};

  if (!lat || !lng) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: '위치 정보(lat, lng)가 필요합니다' }) };
  }

  const DATA_KEY = process.env.DATA_GO_KR_KEY;
  const VWORLD_KEY = process.env.VWORLD_KEY;
  const BULDG_KEY = process.env.BULDG_KEY || DATA_KEY;

  const catCode = getBizCategoryCode(bizType);
  const delta = 0.005;
  const lng_f = parseFloat(lng), lat_f = parseFloat(lat);

  // ── API URL 구성 ──────────────────────────────
  // 1. 소상공인 반경 내 상가 조회
  const storeUrl = `https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInRadius`
    + `?serviceKey=${DATA_KEY}&pageNo=1&numOfRows=100&radius=${radius}`
    + `&cx=${lng}&cy=${lat}&type=json`
    + (catCode ? `&indsLclsCd=${catCode}` : '');

  // 2. VWorld 토지이용규제 (용도지역)
  const bbox = `${lng_f-delta},${lat_f-delta},${lng_f+delta},${lat_f+delta}`;
  const landUrl = `https://api.vworld.kr/req/data?service=data&request=GetFeature`
    + `&data=LP_PA_CBND_BUBUN&key=${VWORLD_KEY}`
    + `&domain=https://changup-map.netlify.app`
    + `&geomFilter=BOX(${bbox})&format=json&size=5&page=1`;

  // 3. 소상공인 상권 정보 (행정동 기준)
  const tradeAreaUrl = `https://apis.data.go.kr/B553077/api/open/sdsc2/trdarList`
    + `?serviceKey=${DATA_KEY}&pageNo=1&numOfRows=5`
    + `&cx=${lng}&cy=${lat}&radius=300&type=json`;

  // ── 병렬 API 호출 ─────────────────────────────
  const [storeRes, landRes, tradeRes] = await Promise.allSettled([
    fetchJson(storeUrl),
    fetchJson(landUrl),
    fetchJson(tradeAreaUrl)
  ]);

  // ── 상가 데이터 처리 ──────────────────────────
  let storeData = {
    totalCount: 0, nearbyStores: [], competitionMap: {},
    topCategories: [], sameTypeCount: 0
  };

  if (storeRes.status === 'fulfilled' && storeRes.value?.body) {
    const body = storeRes.value.body;
    storeData.totalCount = body.totalCount || 0;
    const items = body.items || [];
    storeData.nearbyStores = items.slice(0, 15).map(s => ({
      name: s.bizesNm, category: s.uptaeNm, address: s.rdnwhlAddr,
      lat: s.lat, lng: s.lon
    }));
    // 업종별 카운트
    const catMap = {};
    items.forEach(s => {
      const cat = s.uptaeNm || '기타';
      catMap[cat] = (catMap[cat] || 0) + 1;
    });
    storeData.competitionMap = catMap;
    storeData.topCategories = Object.entries(catMap)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([name, count]) => ({ name, count }));
    // 같은 업종 수
    if (bizType && catCode) {
      const sameItems = items.filter(s => s.indsLclsCd === catCode);
      storeData.sameTypeCount = sameItems.length;
    }
  }

  // ── 토지이용 데이터 처리 ──────────────────────
  let landData = { zoneType: null, zoneCode: null, regulation: null };

  if (landRes.status === 'fulfilled' && landRes.value?.response) {
    const features = landRes.value.response?.result?.featureCollection?.features || [];
    if (features.length > 0) {
      const props = features[0].properties || {};
      landData.zoneType = props.prposAreaDstrcNm || props.PRPOS_AREA_DSTRC_NM || null;
      landData.zoneCode = props.prposAreaDstrcCd || null;
    }
  }
  landData.regulation = analyzeLandUse(landData.zoneType);

  // ── 상권 정보 처리 ────────────────────────────
  let tradeData = { tradeAreaName: null, tradeAreaCode: null };
  if (tradeRes.status === 'fulfilled' && tradeRes.value?.body?.items?.length > 0) {
    const item = tradeRes.value.body.items[0];
    tradeData.tradeAreaName = item.trdarNm || null;
    tradeData.tradeAreaCode = item.trdarCd || null;
  }

  // ── 경쟁 강도 계산 (반경 500m 기준) ────────────
  const totalCount = storeData.totalCount;
  let competitionLevel, competitionScore;
  if (totalCount === 0) { competitionLevel = '데이터없음'; competitionScore = 50; }
  else if (totalCount < 20) { competitionLevel = '낮음'; competitionScore = 80; }
  else if (totalCount < 50) { competitionLevel = '보통'; competitionScore = 60; }
  else if (totalCount < 100) { competitionLevel = '높음'; competitionScore = 35; }
  else { competitionLevel = '매우높음'; competitionScore = 15; }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      location: { lat: lat_f, lng: lng_f },
      bizType: bizType || null,
      stores: storeData,
      landuse: landData,
      tradeArea: tradeData,
      analysis: {
        totalStoresNearby: totalCount,
        competitionLevel,
        competitionScore,
        regulationGrade: landData.regulation?.grade || '확인필요',
        canOperate: landData.regulation?.canOperate !== false,
        regulationWarning: landData.regulation?.warning || null
      },
      timestamp: new Date().toISOString()
    })
  };
};
