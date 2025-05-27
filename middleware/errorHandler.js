// middleware/errorHandler.js

// 입력 유효성 검증 헬퍼
const validateRequest = (requiredFields) => (req, res, next) => {
  const missing = requiredFields.filter(field => !req.body[field]);
  if (missing.length > 0) {
    return res.status(400).json({ 
      error: `필수 필드가 누락되었습니다: ${missing.join(', ')}` 
    });
  }
  next();
};

// 비동기 라우터 래퍼 - try/catch 자동 처리
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// 글로벌 에러 핸들러
const globalErrorHandler = (err, req, res, next) => {
  console.error(`[${req.method} ${req.path}] Error:`, err.message);
  
  // OpenAI 관련 에러
  if (err.message.includes('insufficient_quota')) {
    return res.status(429).json({ error: 'API 할당량이 부족합니다.' });
  }
  if (err.message.includes('rate_limit_exceeded')) {
    return res.status(429).json({ error: 'API 요청 한도에 도달했습니다.' });
  }
  
  // 일반 에러
  res.status(err.status || 500).json({ 
    error: err.message || '서버 내부 오류가 발생했습니다.' 
  });
};

module.exports = { validateRequest, asyncHandler, globalErrorHandler };