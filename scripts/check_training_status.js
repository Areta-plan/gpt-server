#!/usr/bin/env node

require('dotenv').config();
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const JOB_IDS = [
  'ftjob-7w0f2W6LBezg8uDSfqjt8LaI', // closing
  'ftjob-jqKwM0CITff57F6TNPQn7TqJ', // firstparagraph  
  'ftjob-H7goSwGwe368HiGIAh4DNZiY'  // title
];

async function checkStatus() {
  console.log('🔍 파인튜닝 작업 상태 확인...\n');
  
  for (const jobId of JOB_IDS) {
    try {
      const job = await openai.fineTuning.jobs.retrieve(jobId);
      
      console.log(`📋 작업 ID: ${jobId}`);
      console.log(`📊 상태: ${job.status}`);
      console.log(`🏷️  접미사: ${job.suffix || 'N/A'}`);
      
      if (job.status === 'succeeded') {
        console.log(`🎉 완료된 모델: ${job.fine_tuned_model}`);
      } else if (job.status === 'failed') {
        console.log(`❌ 실패 사유: ${job.error?.message || '알 수 없음'}`);
      } else if (job.status === 'running') {
        console.log(`⏳ 진행률: ${job.trained_tokens || 0} 토큰 훈련됨`);
      }
      
      console.log('');
    } catch (error) {
      console.error(`❌ ${jobId} 상태 확인 실패: ${error.message}`);
    }
  }
}

if (require.main === module) {
  checkStatus();
}

module.exports = { checkStatus };