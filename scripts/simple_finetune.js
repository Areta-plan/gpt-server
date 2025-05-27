#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

// OpenAI 클라이언트 초기화
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const TRAINING_DIR = path.resolve(__dirname, '../training_data');
const LATEST_PATH = path.resolve(__dirname, '../latest_model.txt');
const BASE_MODEL = 'gpt-3.5-turbo-0125';

async function uploadFile(filePath, purpose = 'fine-tune') {
  try {
    console.log(`📤 ${path.basename(filePath)} 업로드 중...`);
    
    const fileStream = fs.createReadStream(filePath);
    const response = await openai.files.create({
      file: fileStream,
      purpose: purpose,
    });
    
    console.log(`✅ 업로드 완료: ${response.id}`);
    return response.id;
  } catch (error) {
    console.error(`❌ 업로드 실패 (${path.basename(filePath)}):`, error.message);
    return null;
  }
}

async function createFineTuningJob(fileId, suffix) {
  try {
    console.log(`🚀 파인튜닝 작업 생성 중... (${suffix})`);
    
    const response = await openai.fineTuning.jobs.create({
      training_file: fileId,
      model: BASE_MODEL,
      suffix: suffix,
    });
    
    console.log(`✅ 파인튜닝 작업 생성됨: ${response.id}`);
    console.log(`📊 상태: ${response.status}`);
    
    return response.id;
  } catch (error) {
    console.error('❌ 파인튜닝 작업 생성 실패:', error.message);
    return null;
  }
}

async function checkJobStatus(jobId) {
  try {
    const job = await openai.fineTuning.jobs.retrieve(jobId);
    console.log(`📊 작업 ${jobId} 상태: ${job.status}`);
    
    if (job.status === 'succeeded') {
      console.log(`🎉 완료된 모델: ${job.fine_tuned_model}`);
      return job.fine_tuned_model;
    } else if (job.status === 'failed') {
      console.log(`❌ 실패 사유: ${job.error?.message || '알 수 없음'}`);
    }
    
    return null;
  } catch (error) {
    console.error(`❌ 상태 확인 실패: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('🚀 간단 파인튜닝 시작...\n');
  
  // OpenAI API 키 확인
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY 환경변수가 설정되지 않았습니다.');
    process.exit(1);
  }
  
  // 훈련 데이터 확인
  if (!fs.existsSync(TRAINING_DIR)) {
    console.error('❌ training_data 디렉토리가 없습니다.');
    process.exit(1);
  }
  
  const jsonlFiles = fs.readdirSync(TRAINING_DIR)
    .filter(f => f.endsWith('.jsonl'))
    .filter(f => {
      const filePath = path.join(TRAINING_DIR, f);
      const content = fs.readFileSync(filePath, 'utf8').trim();
      return content.length > 0;
    });
  
  if (jsonlFiles.length === 0) {
    console.error('❌ 유효한 JSONL 파일이 없습니다.');
    process.exit(1);
  }
  
  console.log(`📁 발견된 훈련 파일: ${jsonlFiles.join(', ')}\n`);
  
  // 각 파일별로 파인튜닝 시작
  const results = {};
  
  for (const file of jsonlFiles) {
    const filePath = path.join(TRAINING_DIR, file);
    const category = file.replace('_samples.jsonl', '');
    
    console.log(`\n=== ${category.toUpperCase()} 파인튜닝 ===`);
    
    // 파일 업로드
    const fileId = await uploadFile(filePath);
    if (!fileId) continue;
    
    // 파인튜닝 작업 생성
    const jobId = await createFineTuningJob(fileId, category);
    if (!jobId) continue;
    
    results[category] = { fileId, jobId };
    
    // 잠깐 대기
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // 결과 저장
  if (Object.keys(results).length > 0) {
    const timestamp = new Date().toISOString();
    const resultText = `# Fine-tuning Jobs Started: ${timestamp}\n\n` +
      Object.entries(results).map(([category, data]) => 
        `${category}: Job ${data.jobId} (File: ${data.fileId})`
      ).join('\n') + '\n';
    
    fs.writeFileSync(LATEST_PATH, resultText);
    console.log(`\n📝 작업 정보 저장됨: ${LATEST_PATH}`);
  }
  
  console.log('\n🎯 파인튜닝 모니터링:');
  console.log('```bash');
  Object.values(results).forEach(data => {
    console.log(`# 상태 확인: node -e "const OpenAI = require('openai'); const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY}); openai.fineTuning.jobs.retrieve('${data.jobId}').then(job => console.log('Status:', job.status, 'Model:', job.fine_tuned_model))"`);
  });
  console.log('```');
  
  console.log('\n✨ 파인튜닝 작업이 시작되었습니다!');
  console.log('💡 보통 10-30분 정도 소요됩니다.');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };