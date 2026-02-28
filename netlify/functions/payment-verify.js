/* ────────────────────────────────────────────────
   결제 검증 함수 (토스페이먼츠 Confirm API 호출)
   POST /api/payment-verify
   Body: { paymentKey, orderId, amount }

   환경 변수 (Netlify 대시보드 > Site settings > Environment):
     TOSS_SECRET_KEY  — 실서비스 시 라이브 시크릿 키로 교체
     (테스트: test_sk_zXLkKEypNArWmo50nX3lmeaxYG5pMqnN)
──────────────────────────────────────────────── */
exports.handler = async function (event) {
  // CORS 헤더
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
    return { statusCode: 405, headers, body: JSON.stringify({ success: false, message: 'Method Not Allowed' }) };
  }

  let paymentKey, orderId, amount;
  try {
    ({ paymentKey, orderId, amount } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: '잘못된 요청입니다.' }) };
  }

  if (!paymentKey || !orderId || !amount) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: '필수 파라미터 누락' }) };
  }

  // ★ 실서비스 전환 시 Netlify 환경 변수 TOSS_SECRET_KEY에 라이브 키 설정
  const secretKey = process.env.TOSS_SECRET_KEY || 'test_sk_zXLkKEypNArWmo50nX3lmeaxYG5pMqnN';
  const authHeader = 'Basic ' + Buffer.from(secretKey + ':').toString('base64');

  try {
    const res = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    });

    const data = await res.json();

    if (res.ok && data.status === 'DONE') {
      // 결제 성공
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          paymentKey: data.paymentKey,
          orderId: data.orderId,
          amount: data.totalAmount,
          approvedAt: data.approvedAt,
          method: data.method,
        }),
      };
    } else {
      // 토스 API 오류 응답
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: data.message || '결제 승인에 실패했습니다.',
          code: data.code,
        }),
      };
    }
  } catch (e) {
    console.error('Toss payment confirm error:', e);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: '결제 검증 서버 오류가 발생했습니다.' }),
    };
  }
};
