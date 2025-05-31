// API 테스트 스크립트
const http = require('http');

const data = JSON.stringify({
  url: "https://blog.naver.com/easy-communication/222983364554"
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/extract-blog',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

console.log('📡 API 테스트 시작...');

const req = http.request(options, (res) => {
  let responseData = '';
  
  res.on('data', (chunk) => {
    responseData += chunk;
  });
  
  res.on('end', () => {
    console.log(`📊 응답 상태: ${res.statusCode}`);
    try {
      const result = JSON.parse(responseData);
      console.log('✅ 블로그 추출 완료');
      console.log(`📝 제목: "${result.title}"`);
      console.log(`📄 내용 길이: ${result.content?.length || 0}자`);
      
      if (result.classification) {
        console.log('\n🎯 분류 결과:');
        Object.keys(result.classification).forEach(type => {
          if (type !== 'isStory' && result.classification[type]) {
            console.log(`   ${type}: ✅`);
          }
        });
        
        if (result.savedFiles) {
          console.log('\n💾 저장된 파일:');
          Object.entries(result.savedFiles).forEach(([type, fileName]) => {
            console.log(`   ${type}: ${fileName}`);
          });
        }
      }
    } catch (error) {
      console.error('❌ JSON 파싱 오류:', error.message);
      console.log('원시 응답:', responseData.substring(0, 500));
    }
  });
});

req.on('error', (error) => {
  console.error('❌ 요청 오류:', error.message);
});

req.write(data);
req.end();