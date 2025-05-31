// 매우 간단한 테스트 서버
const express = require('express');
const app = express();
const PORT = 3002;

app.use(express.json());

// 간단한 테스트 엔드포인트
app.get('/test', (req, res) => {
    res.json({ success: true, message: '서버 정상 작동' });
});

// 파인튜닝 관련 기본 엔드포인트만 구현
app.get('/api/finetune/test-basic', (req, res) => {
    try {
        console.log('📊 기본 파인튜닝 API 호출됨');
        res.json({ 
            success: true, 
            message: '파인튜닝 API 기본 테스트 성공',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ API 오류:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ 테스트 서버 시작 (포트 ${PORT})`);
    
    // 자동 테스트
    setTimeout(() => {
        const http = require('http');
        
        const req = http.request({
            hostname: 'localhost',
            port: PORT,
            path: '/api/finetune/test-basic',
            method: 'GET'
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`🧪 자동 테스트 결과 (${res.statusCode}):`, data);
                process.exit(0);
            });
        });
        
        req.on('error', (e) => {
            console.error('❌ 자동 테스트 실패:', e.message);
            process.exit(1);
        });
        
        req.end();
    }, 1000);
});