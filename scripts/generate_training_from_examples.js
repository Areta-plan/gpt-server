#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const TRAINING_EXAMPLES_DIR = path.resolve(__dirname, '../training_examples');
const TRAINING_DATA_DIR = path.resolve(__dirname, '../training_data');

if (!fs.existsSync(TRAINING_DATA_DIR)) {
  fs.mkdirSync(TRAINING_DATA_DIR, { recursive: true });
}

function parseTrainingFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  let userContent = '';
  let assistantContent = '';
  let currentSection = null;
  
  for (const line of lines) {
    if (line.trim() === '===user===') {
      currentSection = 'user';
      continue;
    } else if (line.trim() === '===assistant===') {
      currentSection = 'assistant';
      continue;
    }
    
    if (currentSection === 'user') {
      userContent += line + '\n';
    } else if (currentSection === 'assistant') {
      assistantContent += line + '\n';
    }
  }
  
  return {
    user: userContent.trim(),
    assistant: assistantContent.trim()
  };
}

function generateJSONL(category) {
  const categoryDir = path.join(TRAINING_EXAMPLES_DIR, category);
  if (!fs.existsSync(categoryDir)) {
    console.log(`⚠️  ${category} 디렉토리가 없습니다.`);
    return;
  }
  
  const files = fs.readdirSync(categoryDir).filter(f => f.endsWith('.txt'));
  const jsonlData = [];
  
  for (const file of files) {
    try {
      const filePath = path.join(categoryDir, file);
      const parsed = parseTrainingFile(filePath);
      
      if (parsed.user && parsed.assistant) {
        jsonlData.push({
          messages: [
            { role: 'user', content: parsed.user },
            { role: 'assistant', content: parsed.assistant }
          ]
        });
      }
    } catch (error) {
      console.log(`❌ ${file} 파싱 실패: ${error.message}`);
    }
  }
  
  if (jsonlData.length > 0) {
    const outputPath = path.join(TRAINING_DATA_DIR, `${category}_samples.jsonl`);
    const jsonlContent = jsonlData.map(item => JSON.stringify(item)).join('\n');
    fs.writeFileSync(outputPath, jsonlContent);
    console.log(`✅ ${category}: ${jsonlData.length}개 샘플 생성 → ${outputPath}`);
  } else {
    console.log(`⚠️  ${category}: 유효한 샘플이 없습니다.`);
  }
}

function main() {
  console.log('🚀 training_examples에서 훈련 데이터 생성 시작...\n');
  
  const categories = ['title', 'firstparagraph', 'closing', 'story', 'usp'];
  
  for (const category of categories) {
    generateJSONL(category);
  }
  
  console.log('\n✨ 훈련 데이터 생성 완료!');
  console.log(`📁 생성된 파일들: ${TRAINING_DATA_DIR}/`);
}

if (require.main === module) {
  main();
}

module.exports = { main };