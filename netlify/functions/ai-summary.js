// ═══════════════════════════════════════════════
// 창업지도 — AI 창업 분석 요약 (Netlify Function)
// Mock 모드: 데이터 기반 한국어 템플릿 조합
// LLM 연결 시 ANTHROPIC_KEY env로 Claude API 사용
// ═══════════════════════════════════════════════

// 업종별 특성 데이터
const BIZ_CONTEXT = {
  '카페':     { vc: 0.35, category: '음식', peakHour: '오전·오후', laborIntensity: '중간', mainCost: '원두·임대료' },
  '고깃집':   { vc: 0.45, category: '음식', peakHour: '저녁·주말', laborIntensity: '높음', mainCost: '식재료·인건비' },
  '치킨집':   { vc: 0.42, category: '음식', peakHour: '저녁',      laborIntensity: '낮음', mainCost: '식재료·배달수수료' },
  '편의점':   { vc: 0.65, category: '소매', peakHour: '상시',      laborIntensity: '높음', mainCost: '상품원가·인건비' },
  '헬스장':   { vc: 0.15, category: '건강', peakHour: '아침·저녁', laborIntensity: '중간', mainCost: '임대료·인건비' },
  '미용실':   { vc: 0.30, category: '뷰티', peakHour: '주말',      laborIntensity: '높음', mainCost: '재료비·임대료' },
  '학원':     { vc: 0.15, category: '교육', peakHour: '오후·저녁', laborIntensity: '높음', mainCost: '인건비·임대료' },
  '노래방':   { vc: 0.20, category: '여가', peakHour: '저녁·심야', laborIntensity: '낮음', mainCost: '임대료·전기료' },
  '분식집':   { vc: 0.40, category: '음식', peakHour: '점심',      laborIntensity: '중간', mainCost: '식재료·임대료' },
  '베이커리': { vc: 0.38, category: '음식', peakHour: '오전·오후', laborIntensity: '높음', mainCost: '식재료·인건비' },
};

// 위험도 수준 판단
function riskLevel(score) {
  if (score >= 70) return { label: '높음', emoji: '🔴', desc: '창업 조건 재검토 권장' };
  if (score >= 40) return { label: '보통', emoji: '🟡', desc: '일부 조건 개선 후 진행 권장' };
  return { label: '낮음', emoji: '🟢', desc: '비교적 양호한 창업 환경' };
}

// ROI 수준 판단
function roiLevel(roi) {
  if (roi >= 30) return { label: '우수', emoji: '🟢' };
  if (roi >= 10) return { label: '보통', emoji: '🟡' };
  if (roi >= 0)  return { label: '저조', emoji: '🔴' };
  return { label: '손실', emoji: '⛔' };
}

// 템플릿 기반 Mock 요약 생성
function generateMockSummary({ bizType, areaName, riskScore, roi, bep, competitionScore, regulationGrade, closeRate, survivalRate }) {
  const biz = BIZ_CONTEXT[bizType] || { vc: 0.35, category: '일반', peakHour: '상시', laborIntensity: '중간', mainCost: '임대료' };
  const risk = riskLevel(riskScore || 50);
  const roiInfo = roiLevel(roi || 0);
  const area = areaName || '해당 지역';
  const bt = bizType || '업종';

  // ── 핵심 요약 문단 ──────────────────────────
  const summaryParts = [
    `${area} ${bt} 창업을 분석한 결과, 전반적인 위험도는 **${risk.label}(${risk.emoji})** 수준입니다.`,
  ];

  if (roi !== null && roi !== undefined) {
    summaryParts.push(`예상 ROI는 **${roi.toFixed(1)}%(${roiInfo.emoji} ${roiInfo.label})**이며, BEP(손익분기) 달성까지 약 **${bep}개월**이 소요될 것으로 추정됩니다.`);
  }

  if (competitionScore !== null && competitionScore !== undefined) {
    const compDesc = competitionScore >= 70 ? '경쟁 강도가 낮아 진입 여건이 유리합니다' :
                     competitionScore >= 40 ? '경쟁 업소가 적정 수준입니다' :
                                              '경쟁이 치열한 상권으로 차별화 전략이 필요합니다';
    summaryParts.push(compDesc + '.');
  }

  if (closeRate !== null && closeRate !== undefined) {
    summaryParts.push(`동종 업종 폐업률은 ${closeRate}%로, ${closeRate > 20 ? '업계 평균 대비 높아 각별한 주의가 필요합니다' : '비교적 안정적인 수준입니다'}.`);
  }

  // ── 주요 리스크 3가지 ────────────────────────
  const risks = [];

  // 임대 부담
  risks.push({
    level: (riskScore || 50) >= 50 ? 'high' : 'mid',
    title: '임대료 부담',
    desc: `${bt} 특성상 ${biz.peakHour} 집중 매출 구조입니다. 월 임대료가 예상 매출의 25% 이하인지 반드시 확인하세요.`
  });

  // 경쟁 포화
  if (competitionScore !== null && competitionScore < 50) {
    risks.push({
      level: 'high',
      title: '경쟁 포화',
      desc: `반경 500m 내 동종 업소가 밀집해 있습니다. 메뉴·서비스·인테리어 차별화 없이는 생존이 어려울 수 있습니다.`
    });
  } else {
    risks.push({
      level: 'mid',
      title: '수익성 관리',
      desc: `${bt}의 변동비율은 약 ${Math.round(biz.vc * 100)}%입니다. ${biz.mainCost} 비용 절감이 수익성의 핵심입니다.`
    });
  }

  // 인허가·규제
  risks.push({
    level: regulationGrade === '불가' ? 'high' : regulationGrade === '주의' ? 'mid' : 'low',
    title: '인허가 리스크',
    desc: regulationGrade === '불가'
      ? '용도지역 문제로 해당 위치에서 영업이 불가할 수 있습니다. 계약 전 반드시 관할 구청에 확인하세요.'
      : regulationGrade === '주의'
      ? '해당 지역은 일부 업종 인허가 제한이 있습니다. 사전 담당 부서 문의가 필요합니다.'
      : `${biz.category} 분야 인허가 절차를 행정가이드 탭에서 확인하고 일정을 미리 계획하세요.`
  });

  // ── 추천 전략 2가지 ──────────────────────────
  const strategies = [];

  if (bep && bep <= 24) {
    strategies.push({
      title: '초기 고정비 최소화 전략',
      desc: `BEP ${bep}개월 달성을 위해 초기 인테리어를 최소화하고 보증금보다 월세 절감에 집중하세요. 스몰 스타트 후 수익 확인 후 확장하는 방식을 권장합니다.`
    });
  } else {
    strategies.push({
      title: '수익 다각화 전략',
      desc: `BEP 달성까지 ${bep || '다수'}개월이 예상됩니다. 배달·테이크아웃·온라인 판매 등 추가 수익 채널을 개설하여 매출 기반을 다양화하세요.`
    });
  }

  strategies.push({
    title: '소상공인 정책 자금 활용',
    desc: `소상공인진흥공단의 창업패키지(최대 1억원 지원) 및 시중은행 특별보증 상품을 활용하면 초기 투자 부담을 줄일 수 있습니다. 행정가이드 탭에서 자세한 정보를 확인하세요.`
  });

  return {
    summary: summaryParts.join(' '),
    risks,
    strategies,
    riskLevel: risk.label,
    roiGrade: roiInfo.label,
    isMock: true,
    note: '본 리포트는 공공 데이터 기반 시뮬레이션이며, 실제 상권 상황에 따라 다를 수 있습니다.'
  };
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

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST만 허용' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: '잘못된 요청 형식' }) };
  }

  const {
    bizType, areaName, riskScore, roi, bep,
    competitionScore, regulationGrade, closeRate, survivalRate
  } = body;

  // ── LLM 모드: ANTHROPIC_KEY 환경변수 설정 시 Claude API 사용 ──
  const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;

  if (ANTHROPIC_KEY) {
    try {
      const prompt = `당신은 대한민국 소상공인 창업 전문가입니다. 다음 데이터를 바탕으로 창업 분석 리포트를 작성해주세요.

업종: ${bizType || '미입력'}
지역: ${areaName || '미입력'}
위험도 점수: ${riskScore || '?'}/100 (낮을수록 안전)
예상 ROI: ${roi?.toFixed(1) || '?'}%
BEP 달성: ${bep || '?'}개월
경쟁 점수: ${competitionScore || '?'}/100 (높을수록 경쟁 낮음)
용도지역: ${regulationGrade || '확인필요'}
동종업종 폐업률: ${closeRate || '?'}%
생존율: ${survivalRate || '?'}%

다음 JSON 형식으로 응답해주세요:
{
  "summary": "2~3문장 핵심 요약",
  "risks": [{"level":"high|mid|low","title":"리스크명","desc":"설명"}] (3개),
  "strategies": [{"title":"전략명","desc":"설명"}] (2개)
}`;

      const https = require('https');
      const llmResult = await new Promise((resolve) => {
        const payload = JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }]
        });
        const req = https.request({
          hostname: 'api.anthropic.com',
          path: '/v1/messages',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01'
          },
          timeout: 15000
        }, (res) => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => {
            try {
              const r = JSON.parse(data);
              const text = r.content?.[0]?.text || '';
              const jsonMatch = text.match(/\{[\s\S]*\}/);
              if (jsonMatch) resolve(JSON.parse(jsonMatch[0]));
              else resolve(null);
            } catch { resolve(null); }
          });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.write(payload);
        req.end();
      });

      if (llmResult) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ ...llmResult, isMock: false })
        };
      }
      // LLM 실패 시 Mock으로 fallback
    } catch (e) {
      // fallback to mock
    }
  }

  // ── Mock 모드 (기본) ──
  const result = generateMockSummary({ bizType, areaName, riskScore, roi, bep, competitionScore, regulationGrade, closeRate, survivalRate });

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(result)
  };
};
