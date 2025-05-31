// 최소한의 서버로 디버깅
require('dotenv').config();

console.log('🚀 최소 서버 시작...');

// 환경변수 확인
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY가 설정되지 않았습니다.');
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  methods: ['GET', 'POST', 'DELETE', 'PUT', 'PATCH'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// 정적 파일 서빙
const clientDir = path.join(__dirname, 'chatgpt-client');
app.use(express.static(clientDir));

app.get('/', (req, res) => {
  res.sendFile(path.join(clientDir, 'index.html'));
});

// 파인튜닝 라우터만 연결
try {
  console.log('📂 파인튜닝 라우터 로드 중...');
  const fineTuneRouter = require('./routes/finetune');
  app.use('/api/finetune', fineTuneRouter);
  console.log('✅ 파인튜닝 라우터 연결 성공');
} catch (error) {
  console.error('❌ 파인튜닝 라우터 오류:', error.message);
}

// 분류 라우터 연결
try {
  console.log('📂 분류 라우터 로드 중...');
  const classificationRouter = require('./routes/classification');
  app.use('/classification', classificationRouter);
  console.log('✅ 분류 라우터 연결 성공');
} catch (error) {
  console.error('❌ 분류 라우터 오류:', error.message);
}

// 에러 핸들러
app.use((err, req, res, next) => {
  console.error('❌ 서버 오류:', err.message);
  res.status(500).json({ success: false, error: err.message });
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`✅ 서버가 포트 ${PORT}에서 시작되었습니다.`);
  console.log(`🌐 브라우저에서 http://localhost:${PORT} 접속 가능`);
  
  // 5초 후 API 테스트
  setTimeout(async () => {
    try {
      const http = require('http');
      
      console.log('🧪 API 테스트 시작...');
      
      const req = http.request({
        hostname: 'localhost',
        port: PORT,
        path: '/api/finetune/dataset-stats',
        method: 'GET'
      }, (res) => {
        console.log(`📊 API 응답 상태: ${res.statusCode}`);
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            console.log('✅ 파인튜닝 API 정상 작동');
            try {
              const result = JSON.parse(data);
              console.log('📈 데이터셋 정보:', result.data || result);
            } catch (e) {
              console.log('📄 응답 데이터:', data.substring(0, 200));
            }
          } else {
            console.log('⚠️ API 응답:', data);
          }
        });
      });
      
      req.on('error', (e) => {
        console.error('❌ API 테스트 실패:', e.message);
      });
      
      req.end();
      
    } catch (error) {
      console.error('❌ API 테스트 오류:', error.message);
    }
  }, 3000);
});