const fs = require('fs');
const path = require('path');
const { getOpenAIClient } = require('./lib/openaiClient');
const { createHash, chunkText, cosineSimilarity } = require('./lib/utils');
const { LRUCache } = require('./lib/cacheManager');
let pLimit;
try {
  pLimit = require('p-limit');
  if (typeof pLimit !== 'function' && pLimit.default) {
    pLimit = pLimit.default;
  }
} catch (err) {
  console.warn('⚠️ p-limit 모듈이 없습니다. 기본 구현을 사용합니다.');
  // p-limit 대체 구현
  pLimit = (concurrency) => {
    return async (fn) => {
      return await fn();
    };
  };
}

// 설정 상수 (환경변수로 오버라이드 가능)
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-ada-002';
const KNOWLEDGE_DIR = path.join(__dirname, 'knowledge');
const CACHE_PATH = path.join(__dirname, 'chunksCache.json');
const CONCURRENCY = parseInt(process.env.EMBEDDING_CONCURRENCY) || 3; // 요청 한도 고려하여 3으로 낮춤
const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE) || 1000;
const CHUNK_OVERLAP = parseInt(process.env.CHUNK_OVERLAP) || 200;
const MAX_CHUNKS_IN_MEMORY = parseInt(process.env.MAX_CHUNKS_IN_MEMORY) || 10000; // 메모리 제한

// 벡터 저장 공간 - LRU 캐시 구현
let chunks = [];
const chunkCache = new LRUCache(MAX_CHUNKS_IN_MEMORY);

// utils.js에서 가져오므로 제거

// 캐시 로드
function loadCache() {
  if (!fs.existsSync(CACHE_PATH)) return { fileHashes: {}, chunks: [] };
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    return { fileHashes: {}, chunks: [] };
  }
}

// 캐시 저장
function saveCache(cache) {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
}

// utils.js에서 가져오므로 제거

// utils.js에서 가져오므로 제거

// 벡터 스토어 초기화: 캐시 활용 + 신규/변경 청크만 임베딩
async function initializeVectorStore(apiKey) {
  console.log('➡️ [vectorStore] initializing...');
  
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY가 필요합니다.');
  }
  
  const openai = getOpenAIClient();
  const cache = loadCache();
  const oldHashes = cache.fileHashes;
  const oldChunks = cache.chunks || [];
  const newFileHashes = {};
  const keptChunks = [];
  const toEmbed = [];

  // 모듈(폴더)별 파일 순회
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    console.warn('[vectorStore] knowledge directory not found, skipping.');
    chunks = [];
    saveCache({ fileHashes: {}, chunks });
    return;
  }
  const modules = fs.readdirSync(KNOWLEDGE_DIR).filter(d =>
    fs.statSync(path.join(KNOWLEDGE_DIR, d)).isDirectory());
  for (const mod of modules) {
    const dirPath = path.join(KNOWLEDGE_DIR, mod);
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.txt'));
    for (const file of files) {
      const relPath = path.join(mod, file);
      const fullPath = path.join(dirPath, file);
      const content = fs.readFileSync(fullPath, 'utf8');
      const hash = createHash(content);
      newFileHashes[relPath] = hash;
      if (oldHashes[relPath] === hash) {
        oldChunks.filter(c => c.source === relPath).forEach(c => keptChunks.push(c));
      } else {
        chunkText(content, CHUNK_SIZE, CHUNK_OVERLAP).forEach((txt, idx) => {
          toEmbed.push({ source: relPath, category: mod, text: txt, sliceIndex: idx });
        });
      }
    }
  }

  // 병렬 임베딩 with 에러 핸들링
  const limitFn = pLimit(CONCURRENCY);
  const embedTasks = toEmbed.map(ci => limitFn(async () => {
    try {
      const res = await openai.embeddings.create({ 
        model: EMBEDDING_MODEL, 
        input: ci.text.slice(0, 8000) // 토큰 제한 고려
      });
      return {
        id: `${ci.source}#${ci.sliceIndex}`,
        source: ci.source,
        category: ci.category,
        text: ci.text,
        embedding: res.data[0].embedding,
        lastAccessed: Date.now()
      };
    } catch (err) {
      console.error(`임베딩 실패 [${ci.source}#${ci.sliceIndex}]:`, err.message);
      return null; // 실패한 청크는 제외
    }
  }));
  const embedResults = await Promise.all(embedTasks);
  const newChunks = embedResults.filter(Boolean); // null 제거

  // 최종 chunks 갱신 & 메모리 관리
  chunks = [...keptChunks, ...newChunks];
  
  // 메모리 제한 적용
  if (chunks.length > MAX_CHUNKS_IN_MEMORY) {
    console.warn(`⚠️ 청크 수(${chunks.length})가 메모리 제한(${MAX_CHUNKS_IN_MEMORY})을 초과합니다. 최신 청크만 유지합니다.`);
    chunks = chunks.slice(-MAX_CHUNKS_IN_MEMORY);
  }
  
  saveCache({ fileHashes: newFileHashes, chunks });
  console.log(`✅ [vectorStore] ready with ${chunks.length} chunks (memory limit: ${MAX_CHUNKS_IN_MEMORY})`);
}

// 카테고리별 Top-K 청크 추출 (캐시 최적화)
function getTopKChunksByCategory(queryEmbedding, category, topK = 3) {
  const cacheKey = `${category || 'all'}_${queryEmbedding.slice(0, 10).join('')}_${topK}`;
  
  // 캐시 확인
  const cached = chunkCache.get(cacheKey);
  if (cached) return cached;
  
  const filtered = category
    ? chunks.filter(c => c.category === category)
    : chunks;
  
  const result = filtered
    .map(c => ({ 
      text: c.text, 
      score: cosineSimilarity(c.embedding, queryEmbedding) 
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(c => c.text);
  
  // 결과 캐시
  chunkCache.set(cacheKey, result);
  return result;
}

// 별칭: 전체 청크 대상으로 Top-K 뽑기
function getTopKChunks(queryEmbedding, topK = 3) {
  return getTopKChunksByCategory(queryEmbedding, undefined, topK);
}

module.exports = {
  initializeVectorStore,
  getTopKChunksByCategory,
  getTopKChunks,
  cosineSimilarity,
  chunks
};