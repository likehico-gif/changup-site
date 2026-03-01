// ═══════════════════════════════════════════════
// 창업지도 — 통합 상권 분석 API (Vercel Serverless)
// 소상공인 상권 + VWorld 토지이용 + 건축물대장
// ═══════════════════════════════════════════════

const https = require('https');
const http = require('http');

// URL fetch 헬퍼
function fetchJson(url) {
  return new Promise((resolve) => {
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
    '카페': 'Q12', '커피': 'Q12', '음료': 'Q12', '디저트': 'Q12', '브런치': 'Q12',
    '한식': 'Q01', '식당': 'Q01', '밥집': 'Q01', '고깃집': 'Q01', '삼겹살': 'Q01', '갈비': 'Q01',
    '치킨': 'Q09', '닭': 'Q09', '후라이드': 'Q09',
    '중국': 'Q03', '중식': 'Q03', '짜장': 'Q03', '짬뽕': 'Q03', '탕수육': 'Q03',
    '분식': 'Q01', '김밥': 'Q01', '떡볶이': 'Q01', '라면': 'Q01',
    '빵': 'Q12', '베이커리': 'Q12', '제과': 'Q12', '케이크': 'Q12',
    '술집': 'Q07', '주점': 'Q07', '호프': 'Q07', '포차': 'Q07', '이자카야': 'Q07',
    '피자': 'Q09', '햄버거': 'Q09', '패스트푸드': 'Q09',
    '편의점': 'D20', 'cvs': 'D20',
    '마트': 'D10', '슈퍼': 'D10',
    '옷': 'D30', '의류': 'D30', '패션': 'D30',
    '미용': 'R04', '헤어': 'R04', '뷰티': 'R04', '미용실': 'R04', '헤어샵': 'R04',
    '네일': 'R04', '네일샵': 'R04', '손톱': 'R04',
    '헬스': 'R05', '피트니스': 'R05', '헬스장': 'R05', '체육': 'R05', '운동': 'R05',
    '노래방': 'R06', '노래': 'R06', '코인노래방': 'R06',
    'pc방': 'R06', 'pc': 'R06', '게임': 'R06', '인터넷': 'R06',
    '학원': 'S01', '교육': 'S01',
    '약국': 'L01', '병원': 'L02',
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
  if (zone.includes('전용주거')) return { canOperate: false, warning: '⚠️ 전용주거지역: 음식점·상가 영업 불가', grade: '불가' };
  if (zone.includes('일반주거')) return { canOperate: true, warning: '주의: 일반주거지역 — 일부 업종 인허가 제한', grade: '주의' };
  if (zone.includes('상업') || zone.includes('근린상업') || zone.includes('일반상업')) return { canOperate: true, warning: null, grade: '최적' };
  if (zone.includes('준주거') || zone.includes('준공업')) return { canOperate: true, warning: '준주거/준공업지역 — 대부분 업종 가능', grade: '양호' };
  if (zone.includes('공업')) return { canOperate: false, warning: '⚠️ 공업지역: 일반 상업시설 영업 제한', grade: '주의' };
  if (zone.includes('녹지') || zone.includes('관리') || zone.includes('농림')) return { canOperate: false, warning: '⚠️ 녹지/관리지역: 상업시설 설치 불가', grade: '불가' };
  return { canOperate: true, warning: null, grade: '확인필요' };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { lat, lng, bizType, radius = '500' } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ error: '위치 정보(lat, lng)가 필요합니다' });
  }

  const DATA_KEY  = process.env.DATA_GO_KR_KEY;
  const VWORLD_KEY = process.env.VWORLD_KEY;
  // VWorld 도메인: Vercel 배포 도메인 또는 커스텀 도메인
  const DEPLOY_DOMAIN = process.env.VWORLD_DOMAIN
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://changup-map.netlify.app');

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
    + `&domain=${DEPLOY_DOMAIN}`
    + `&geomFilter=BOX(${bbox})&format=json&size=5&page=1`;

  // 3. 소상공인 상권 정보 (행정동 기준)
  const tradeAreaUrl = `https://apis.data.go.kr/B553077/api/open/sdsc2/trdarList`
    + `?serviceKey=${DATA_KEY}&pageNo=1&numOfRows=5`
    + `&cx=${lng}&cy=${lat}&radius=300&type=json`;

  // 4. 소상공인 개업/폐업 추세 (업종별 반경 1km)
  const trendUrl = `https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInUpjong`
    + `?serviceKey=${DATA_KEY}&pageNo=1&numOfRows=100`
    + `&lat=${lat}&lng=${lng}&radius=1000&type=json`
    + (catCode ? `&indsLclsCd=${catCode}` : '');

  // ── 병렬 API 호출 (1~4번) ─────────────────────
  const [storeRes, landRes, tradeRes, trendRes] = await Promise.allSettled([
    fetchJson(storeUrl),
    fetchJson(landUrl),
    fetchJson(tradeAreaUrl),
    fetchJson(trendUrl)
  ]);

  // ── 상가 데이터 처리 ──────────────────────────
  let storeData = { totalCount: 0, nearbyStores: [], competitionMap: {}, topCategories: [], sameTypeCount: 0 };

  if (storeRes.status === 'fulfilled' && storeRes.value?.body) {
    const body = storeRes.value.body;
    storeData.totalCount = body.totalCount || 0;
    const items = body.items || [];
    storeData.nearbyStores = items.slice(0, 15).map(s => ({
      name: s.bizesNm, category: s.uptaeNm, address: s.rdnwhlAddr, lat: s.lat, lng: s.lon
    }));
    const catMap = {};
    items.forEach(s => { const cat = s.uptaeNm || '기타'; catMap[cat] = (catMap[cat] || 0) + 1; });
    storeData.competitionMap = catMap;
    storeData.topCategories = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));
    if (bizType && catCode) storeData.sameTypeCount = items.filter(s => s.indsLclsCd === catCode).length;
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

  // ── 5. trdarSub: 상권별 업종 매출 (순차 — trdarCd 필요) ──
  let salesData = null;
  if (tradeData.tradeAreaCode && DATA_KEY) {
    const subRes = await fetchJson(
      `https://apis.data.go.kr/B553077/api/open/sdsc2/trdarSub`
      + `?serviceKey=${DATA_KEY}&trdarCd=${tradeData.tradeAreaCode}&type=json`
    );
    if (subRes?.body?.items?.length > 0) {
      const si = subRes.body.items[0];
      salesData = {
        avgMonthlySales: si.mnthSaleAmt ? Math.round(si.mnthSaleAmt / 10000) : null,
        avgBusinessAge:  si.strtupYcnt  || null,
        closeRate:       si.clsbizRt    || null,
      };
    }
  }

  // ── 개업/폐업 추세 처리 ───────────────────────
  let trendData = { totalInUpjong: 0, openCount: 0, closeCount: 0, survivalRate: null };
  if (trendRes.status === 'fulfilled' && trendRes.value?.body) {
    const tbody = trendRes.value.body;
    trendData.totalInUpjong = tbody.totalCount || 0;
    const items = tbody.items || [];
    trendData.openCount  = items.filter(s => s.opnSfteamDecodeId === '01').length;
    trendData.closeCount = items.filter(s => s.opnSfteamDecodeId === '02').length;
    const total = trendData.openCount + trendData.closeCount;
    if (total > 0) trendData.survivalRate = Math.round((trendData.openCount / total) * 100);
  }

  // ── 경쟁 강도 계산 ────────────────────────────
  const totalCount = storeData.totalCount;
  let competitionLevel, competitionScore;
  if (totalCount === 0)        { competitionLevel = '데이터없음'; competitionScore = 50; }
  else if (totalCount < 20)   { competitionLevel = '낮음';       competitionScore = 80; }
  else if (totalCount < 50)   { competitionLevel = '보통';       competitionScore = 60; }
  else if (totalCount < 100)  { competitionLevel = '높음';       competitionScore = 35; }
  else                        { competitionLevel = '매우높음';   competitionScore = 15; }

  // ── 위험도 가산점: 폐업률 반영 ───────────────────
  let closeRiskBonus = 0;
  const cr = salesData?.closeRate || null;
  if (cr !== null) { if (cr > 20) closeRiskBonus = 20; else if (cr > 10) closeRiskBonus = 10; }

  return res.status(200).json({
    success: true,
    location: { lat: lat_f, lng: lng_f },
    bizType: bizType || null,
    stores: storeData,
    landuse: landData,
    tradeArea: tradeData,
    sales: salesData,
    trend: trendData,
    analysis: {
      totalStoresNearby: totalCount,
      competitionLevel,
      competitionScore,
      regulationGrade: landData.regulation?.grade || '확인필요',
      canOperate: landData.regulation?.canOperate !== false,
      regulationWarning: landData.regulation?.warning || null,
      closeRiskBonus,
    },
    timestamp: new Date().toISOString()
  });
};
