// 파인튜닝 API 테스트 스크립트
const http = require('http');

const API_BASE = 'http://localhost:3000';

function makeRequest(path, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let responseData = '';
            
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            
            res.on('end', () => {
                try {
                    const result = JSON.parse(responseData);
                    resolve({ status: res.statusCode, data: result });
                } catch (e) {
                    resolve({ status: res.statusCode, data: responseData });
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        if (data) {
            req.write(JSON.stringify(data));
        }
        
        req.end();
    });
}

async function testAPI() {
    console.log('🧪 파인튜닝 API 테스트 시작...\n');

    // 1. 데이터셋 통계 테스트
    try {
        console.log('1️⃣ 데이터셋 통계 API 테스트');
        const result = await makeRequest('/api/finetune/dataset-stats');
        console.log(`   상태: ${result.status}`);
        if (result.status === 200 && result.data.success) {
            const stats = result.data.data;
            console.log(`   ✅ 성공 - 총 샘플: ${stats.totalSamples}개`);
            console.log(`   📊 훈련예시: ${stats.trainingExamples}, 승인: ${stats.approvedData}, RLHF: ${stats.rlhfData}`);
        } else {
            console.log(`   ❌ 실패:`, result.data);
        }
    } catch (error) {
        console.log(`   ❌ 오류: ${error.message}`);
    }

    console.log('');

    // 2. 파인튜닝 작업 목록 테스트
    try {
        console.log('2️⃣ 파인튜닝 작업 목록 API 테스트');
        const result = await makeRequest('/api/finetune/jobs');
        console.log(`   상태: ${result.status}`);
        if (result.status === 200 && result.data.success) {
            const jobs = result.data.data;
            console.log(`   ✅ 성공 - 작업 ${jobs.length}개 조회`);
            if (jobs.length > 0) {
                const successJobs = jobs.filter(job => job.status === 'succeeded');
                console.log(`   📋 성공한 작업: ${successJobs.length}개`);
            }
        } else {
            console.log(`   ❌ 실패:`, result.data);
        }
    } catch (error) {
        console.log(`   ❌ 오류: ${error.message}`);
    }

    console.log('');

    // 3. 사용 가능한 모델 목록 테스트
    try {
        console.log('3️⃣ 사용 가능한 모델 목록 API 테스트');
        const result = await makeRequest('/api/finetune/models');
        console.log(`   상태: ${result.status}`);
        if (result.status === 200 && result.data.success) {
            const models = result.data.data;
            console.log(`   ✅ 성공 - 모델 ${models.length}개`);
            if (models.length > 0) {
                console.log(`   🤖 최신 모델: ${models[0].name}`);
            }
        } else {
            console.log(`   ❌ 실패:`, result.data);
        }
    } catch (error) {
        console.log(`   ❌ 오류: ${error.message}`);
    }

    console.log('');

    // 4. 로그 조회 테스트
    try {
        console.log('4️⃣ 파인튜닝 로그 API 테스트');
        const result = await makeRequest('/api/finetune/logs');
        console.log(`   상태: ${result.status}`);
        if (result.status === 200 && result.data.success) {
            const logs = result.data.data;
            console.log(`   ✅ 성공 - 로그 ${logs.length}개`);
        } else {
            console.log(`   ❌ 실패:`, result.data);
        }
    } catch (error) {
        console.log(`   ❌ 오류: ${error.message}`);
    }

    console.log('\n🎯 API 테스트 완료');
}

// 5초 후 테스트 시작 (서버 시작 대기)
setTimeout(testAPI, 5000);