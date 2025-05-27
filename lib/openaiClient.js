// lib/openaiClient.js
const OpenAI = require('openai');

let openaiInstance = null;

function getOpenAIClient() {
  if (!openaiInstance) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY가 설정되지 않았습니다.');
    }
    openaiInstance = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 60000 // 60초 타임아웃
    });
  }
  return openaiInstance;
}

module.exports = { getOpenAIClient };