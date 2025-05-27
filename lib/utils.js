// lib/utils.js
const crypto = require('crypto');

// 해시 생성 유틸리티
function createHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

// 문자열 청킹 유틸리티
function chunkText(text, chunkSize = 1000, overlap = 200) {
  const step = chunkSize - overlap;
  const result = [];
  
  for (let start = 0; start < text.length; start += step) {
    const end = Math.min(start + chunkSize, text.length);
    result.push(text.slice(start, end));
    if (end === text.length) break;
  }
  
  return result;
}

// 코사인 유사도 계산 (최적화된 버전)
function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  
  const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
  return magnitude === 0 ? 0 : dot / magnitude;
}

// 배치 처리 유틸리티
async function processBatch(items, batchSize, processor) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }
  return results;
}

// 재시도 로직
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      
      const delay = baseDelay * Math.pow(2, attempt);
      console.warn(`시도 ${attempt + 1} 실패, ${delay}ms 후 재시도:`, error.message);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// 디바운스 유틸리티
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// 메모리 사용량 체크
function getMemoryUsage() {
  const used = process.memoryUsage();
  return {
    rss: Math.round(used.rss / 1024 / 1024 * 100) / 100,
    heapTotal: Math.round(used.heapTotal / 1024 / 1024 * 100) / 100,
    heapUsed: Math.round(used.heapUsed / 1024 / 1024 * 100) / 100,
    external: Math.round(used.external / 1024 / 1024 * 100) / 100
  };
}

// API 응답 헬퍼
function successResponse(data, message = 'Success') {
  return {
    success: true,
    message,
    data
  };
}

function errorResponse(error, statusCode = 500) {
  return {
    success: false,
    error: typeof error === 'string' ? error : error.message,
    statusCode
  };
}

// 로깅 유틸리티 (production에서는 최소화)
function logInfo(message, data = null) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`ℹ️ ${message}`, data || '');
  }
}

function logError(message, error = null) {
  console.error(`❌ ${message}`, error || '');
}

function logSuccess(message, data = null) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`✅ ${message}`, data || '');
  }
}

module.exports = {
  createHash,
  chunkText,
  cosineSimilarity,
  processBatch,
  retryWithBackoff,
  debounce,
  getMemoryUsage,
  successResponse,
  errorResponse,
  logInfo,
  logError,
  logSuccess
};