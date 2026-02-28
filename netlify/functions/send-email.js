/* ────────────────────────────────────────────────
   분석 결과 이메일 발송 함수 (Resend API 사용)
   POST /api/send-email
   Body: { to, bizName, areaName, score, grade, risks[] }

   환경 변수 (Netlify 대시보드 > Site settings > Environment):
     RESEND_API_KEY  — https://resend.com 에서 발급
     SEND_FROM_EMAIL — 발신 이메일 (Resend 도메인 인증 완료 후, 기본값: onboarding@resend.dev)
──────────────────────────────────────────────── */
exports.handler = async function (event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: '잘못된 요청 형식입니다.' }) };
  }

  const { to, bizName, areaName, score, grade, risks = [] } = body;

  if (!to || !/^[^@]+@[^@]+\.[^@]+$/.test(to)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: '유효한 이메일 주소가 필요합니다.' }) };
  }
  if (!bizName) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: '업종명이 필요합니다.' }) };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({ error: '이메일 서비스가 설정되지 않았습니다. RESEND_API_KEY 환경 변수를 설정해주세요.' }),
    };
  }

  // 점수 색상 결정
  const scoreColor = score >= 70 ? '#16a34a' : score >= 50 ? '#d97706' : '#dc2626';
  const gradeEmoji = grade === '안전' ? '🟢' : grade === '주의' ? '🟡' : grade === '위험' ? '🔴' : '⚠️';

  // 리스크 목록 HTML
  const riskListHtml = risks.length
    ? risks.map(function(r) {
        return '<li style="margin-bottom:8px;color:#475569;">' + r + '</li>';
      }).join('')
    : '<li style="color:#94a3b8;">주요 리스크 항목 없음</li>';

  // 이메일 HTML 본문
  const html = `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Noto Sans KR',sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <!-- 헤더 -->
    <div style="background:linear-gradient(135deg,#1b2a4a 0%,#1e3a5f 100%);padding:32px 28px;text-align:center;">
      <div style="font-size:32px;margin-bottom:8px;">🧭</div>
      <h1 style="color:#fff;font-size:22px;font-weight:900;margin:0 0 6px;">창업지도 분석 결과</h1>
      <p style="color:rgba(255,255,255,0.6);font-size:13px;margin:0;">계약 전 5분 보증금 보호 검증 리포트</p>
    </div>

    <!-- 본문 -->
    <div style="padding:32px 28px;">
      <!-- 업종·지역 -->
      <div style="background:#f8fafc;border-radius:10px;padding:16px 20px;margin-bottom:20px;border-left:4px solid #dc2626;">
        <div style="font-size:13px;color:#64748b;margin-bottom:4px;">분석 대상</div>
        <div style="font-size:18px;font-weight:800;color:#0f172a;">${bizName} · ${areaName || '지역 미지정'}</div>
      </div>

      <!-- 종합 점수 -->
      <div style="background:#f8fafc;border-radius:12px;padding:24px;text-align:center;margin-bottom:20px;">
        <div style="font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">종합 창업 안전 점수</div>
        <div style="font-size:64px;font-weight:900;color:${scoreColor};line-height:1;">${score !== undefined && score !== null ? score : '--'}</div>
        <div style="font-size:16px;font-weight:700;color:${scoreColor};margin-top:6px;">${gradeEmoji} ${grade || '--'}</div>
      </div>

      <!-- 주요 리스크 -->
      <div style="margin-bottom:24px;">
        <h3 style="font-size:15px;font-weight:800;color:#0f172a;margin:0 0 12px;">⚠️ 계약 전 확인 필수 리스크</h3>
        <ul style="margin:0;padding-left:20px;line-height:1.9;">${riskListHtml}</ul>
      </div>

      <!-- CTA -->
      <div style="background:linear-gradient(135deg,#fef2f2 0%,#fff7ed 100%);border:1px solid #fecaca;border-radius:12px;padding:20px;text-align:center;margin-bottom:20px;">
        <div style="font-size:14px;font-weight:800;color:#991b1b;margin-bottom:8px;">계약 후에는 돌이킬 수 없습니다</div>
        <div style="font-size:13px;color:#b45309;margin-bottom:16px;">정밀 PDF 리포트로 계약서 제출용 근거 자료를 확보하세요.</div>
        <a href="https://changup-map.netlify.app" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;border-radius:8px;padding:12px 28px;font-weight:700;font-size:14px;">
          정밀 리포트 받기 (29,000원) →
        </a>
      </div>

      <!-- 푸터 -->
      <div style="text-align:center;padding-top:16px;border-top:1px solid #f1f5f9;">
        <p style="font-size:12px;color:#94a3b8;margin:0 0 4px;">창업지도 · changup-map.netlify.app</p>
        <p style="font-size:11px;color:#cbd5e1;margin:0;">본 분석 결과는 참고용이며 법적 효력이 없습니다.</p>
      </div>
    </div>
  </div>
</body>
</html>`;

  const fromEmail = process.env.SEND_FROM_EMAIL || 'onboarding@resend.dev';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: '창업지도 <' + fromEmail + '>',
        to: [to],
        subject: '[창업지도] ' + bizName + ' ' + (areaName || '') + ' 분석 결과 — 점수 ' + (score || '--') + '점 ' + (gradeEmoji) + grade,
        html: html,
      }),
    });

    const data = await res.json();

    if (res.ok && data.id) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, id: data.id }),
      };
    } else {
      console.error('Resend API error:', data);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: data.message || data.name || '이메일 발송에 실패했습니다.' }),
      };
    }
  } catch (e) {
    console.error('send-email function error:', e);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: '서버 오류: ' + e.message }),
    };
  }
};
