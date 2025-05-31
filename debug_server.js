// 디버깅용 서버 테스트 스크립트
require('dotenv').config();

console.log('🔍 서버 시작 디버깅...');

// 환경변수 확인
console.log('\n📋 환경변수 확인:');
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✅ 설정됨' : '❌ 없음');
console.log('OPENAI_CLASSIFICATION_MODEL:', process.env.OPENAI_CLASSIFICATION_MODEL || '기본값 사용');

// Express 앱 초기화 테스트
try {
    console.log('\n🚀 Express 앱 초기화...');
    const express = require('express');
    const app = express();
    
    console.log('✅ Express 인스턴스 생성 성공');
    
    // 미들웨어 테스트
    app.use(express.json());
    console.log('✅ JSON 미들웨어 추가 성공');
    
    const cors = require('cors');
    app.use(cors());
    console.log('✅ CORS 미들웨어 추가 성공');
    
    // 라우터 테스트
    try {
        const fineTuneRouter = require('./routes/finetune');
        app.use('/api/finetune', fineTuneRouter);
        console.log('✅ 파인튜닝 라우터 연결 성공');
    } catch (e) {
        console.error('❌ 파인튜닝 라우터 연결 실패:', e.message);
    }
    
    try {
        const classificationRouter = require('./routes/classification');
        app.use('/classification', classificationRouter);
        console.log('✅ 분류 라우터 연결 성공');
    } catch (e) {
        console.error('❌ 분류 라우터 연결 실패:', e.message);
    }
    
    // 서버 시작 테스트
    const server = app.listen(3001, () => {
        console.log('✅ 서버 시작 성공 (포트 3001)');
        
        // 간단한 API 테스트
        setTimeout(async () => {
            try {
                const http = require('http');
                const options = {
                    hostname: 'localhost',
                    port: 3001,
                    path: '/api/finetune/dataset-stats',
                    method: 'GET'
                };
                
                const req = http.request(options, (res) => {
                    console.log(`🧪 API 테스트 응답: ${res.statusCode}`);
                    if (res.statusCode === 200) {
                        console.log('✅ 파인튜닝 API 정상 작동');
                    } else {
                        console.log('⚠️ 파인튜닝 API 응답 코드:', res.statusCode);
                    }
                    server.close();
                    process.exit(0);
                });
                
                req.on('error', (e) => {
                    console.error('❌ API 테스트 실패:', e.message);
                    server.close();
                    process.exit(1);
                });
                
                req.end();
                
            } catch (e) {
                console.error('❌ API 테스트 오류:', e.message);
                server.close();
                process.exit(1);
            }
        }, 1000);
    });
    
    server.on('error', (e) => {
        console.error('❌ 서버 시작 실패:', e.message);
        process.exit(1);
    });
    
} catch (error) {
    console.error('❌ Express 앱 초기화 실패:', error.message);
    console.error('스택 트레이스:', error.stack);
    process.exit(1);
}