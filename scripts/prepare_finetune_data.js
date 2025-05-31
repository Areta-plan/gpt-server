const fs = require('fs');
const path = require('path');

class FineTuneDataPreparer {
  constructor() {
    this.trainingExamplesDir = path.join(__dirname, '../training_examples');
    this.autoClassifiedDir = path.join(__dirname, '../auto_classified');
    this.claudeApprovedDir = path.join(__dirname, '../claude_approved');
    this.outputDir = path.join(__dirname, '../fine_tune_data');
    this.rlhfFeedbackPath = path.join(__dirname, '../rlhf_feedback.jsonl');
    
    this.ensureDirectories();
  }

  ensureDirectories() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  // 모든 분류 데이터를 통합하여 파인튜닝 데이터셋 생성
  async generateFineTuneDataset() {
    const categories = ['title', 'firstparagraph', 'closing', 'story', 'usp'];
    const allData = [];

    console.log('🔄 파인튜닝 데이터셋 생성 시작...');

    for (const category of categories) {
      console.log(`📂 ${category} 카테고리 처리 중...`);
      
      // 1. 훈련 예시 데이터 수집
      const trainingData = this.loadTrainingExamples(category);
      console.log(`  ✅ 훈련 예시: ${trainingData.length}개`);
      
      // 2. Claude 승인된 데이터 수집
      const approvedData = this.loadApprovedData(category);
      console.log(`  ✅ 승인된 데이터: ${approvedData.length}개`);
      
      // 3. RLHF 고품질 데이터 수집 (4점 이상)
      const rlhfData = this.loadHighQualityRLHFData(category);
      console.log(`  ✅ RLHF 고품질 데이터: ${rlhfData.length}개`);
      
      // 모든 데이터를 하나로 통합
      allData.push(...trainingData, ...approvedData, ...rlhfData);
    }

    // 중복 제거 및 품질 필터링
    const filteredData = this.filterAndDeduplicateData(allData);
    console.log(`🎯 최종 데이터셋: ${filteredData.length}개`);

    // OpenAI 파인튜닝 형식으로 변환
    const fineTuneData = filteredData.map(item => ({
      messages: [
        {
          role: "system",
          content: this.getSystemPromptForCategory(item.category)
        },
        {
          role: "user", 
          content: item.input
        },
        {
          role: "assistant",
          content: item.output
        }
      ]
    }));

    // 파일로 저장
    const outputPath = path.join(this.outputDir, 'classification_finetune.jsonl');
    const jsonlContent = fineTuneData.map(item => JSON.stringify(item)).join('\n');
    fs.writeFileSync(outputPath, jsonlContent, 'utf8');

    console.log(`✅ 파인튜닝 데이터셋 생성 완료: ${outputPath}`);
    console.log(`📊 총 ${fineTuneData.length}개 샘플`);

    return outputPath;
  }

  // 훈련 예시 데이터 로드
  loadTrainingExamples(category) {
    const categoryDir = path.join(this.trainingExamplesDir, category);
    const data = [];

    if (!fs.existsSync(categoryDir)) return data;

    const files = fs.readdirSync(categoryDir).filter(f => f.endsWith('.txt'));
    
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(categoryDir, file), 'utf8');
        const [userPart, assistantPart] = content.split('===assistant===');
        
        if (userPart && assistantPart) {
          data.push({
            category,
            source: 'training_examples',
            input: userPart.replace('===user===', '').trim(),
            output: assistantPart.trim(),
            quality: 'high'
          });
        }
      } catch (error) {
        console.warn(`⚠️ 파일 읽기 오류 ${file}:`, error.message);
      }
    }

    return data;
  }

  // Claude 승인된 데이터 로드
  loadApprovedData(category) {
    const categoryDir = path.join(this.claudeApprovedDir, category);
    const data = [];

    if (!fs.existsSync(categoryDir)) return data;

    const files = fs.readdirSync(categoryDir).filter(f => f.endsWith('.txt'));
    
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(categoryDir, file), 'utf8');
        const [userPart, assistantPart] = content.split('===assistant===');
        
        if (userPart && assistantPart) {
          data.push({
            category,
            source: 'claude_approved',
            input: userPart.replace('===user===', '').trim(),
            output: assistantPart.trim(),
            quality: 'high'
          });
        }
      } catch (error) {
        console.warn(`⚠️ 파일 읽기 오류 ${file}:`, error.message);
      }
    }

    return data;
  }

  // RLHF 고품질 데이터 로드 (4점 이상)
  loadHighQualityRLHFData(category) {
    const data = [];

    if (!fs.existsSync(this.rlhfFeedbackPath)) return data;

    try {
      const content = fs.readFileSync(this.rlhfFeedbackPath, 'utf8');
      const lines = content.trim().split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const feedback = JSON.parse(line);
          
          // 개별 평가에서 4점 이상인 데이터만 선택
          if (feedback.type === 'individual_evaluation' && 
              feedback.category === category && 
              feedback.classification_rating >= 4) {
            
            data.push({
              category,
              source: 'rlhf_high_quality',
              input: feedback.input || feedback.content,
              output: feedback.suggested_improvement || feedback.output,
              quality: 'high',
              rating: feedback.classification_rating
            });
          }
        } catch (parseError) {
          // 파싱 오류 무시
        }
      }
    } catch (error) {
      console.warn(`⚠️ RLHF 데이터 로드 오류:`, error.message);
    }

    return data;
  }

  // 데이터 필터링 및 중복 제거
  filterAndDeduplicateData(data) {
    const seen = new Set();
    const filtered = [];

    for (const item of data) {
      // 입력이 너무 짧거나 출력이 없는 경우 제외
      if (!item.input || !item.output || 
          item.input.length < 10 || item.output.length < 5) {
        continue;
      }

      // 중복 제거 (입력 기준)
      const key = item.input.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      filtered.push(item);
    }

    return filtered;
  }

  // 카테고리별 시스템 프롬프트 생성
  getSystemPromptForCategory(category) {
    const prompts = {
      title: `당신은 블로그 제목 생성 전문가입니다. 주어진 키워드와 의도를 분석하여 클릭률이 높은 매력적인 제목을 생성하세요.

규칙:
1. 호기심을 자극하는 표현 사용
2. 구체적이고 실용적인 정보 제시
3. 감정적 어필 요소 포함
4. 20-40자 내외 길이
5. 검색 키워드 자연스럽게 포함`,

      firstparagraph: `당신은 블로그 첫 문단 작성 전문가입니다. 독자의 관심을 끌고 계속 읽게 만드는 매력적인 첫 문단을 작성하세요.

규칙:
1. 독자의 문제/상황 공감
2. 호기심 유발 요소 포함
3. 글의 가치 미리보기 제시
4. 자연스럽고 읽기 쉬운 문체
5. 200-400자 내외 길이`,

      closing: `당신은 블로그 마무리 문단 작성 전문가입니다. 독자에게 깊은 인상을 남기고 행동을 유도하는 강력한 마무리를 작성하세요.

규칙:
1. 핵심 메시지 강조
2. 독자의 행동 유도
3. 긍정적이고 희망적인 톤
4. 기억에 남는 표현 사용
5. 100-200자 내외 길이`,

      story: `당신은 스토리텔링 전문가입니다. 주어진 내용을 바탕으로 독자의 감정을 움직이는 매력적인 스토리를 구성하세요.

규칙:
1. 명확한 시간순서와 전개
2. 감정적 몰입 요소 포함
3. 갈등과 해결 구조
4. 생생한 묘사와 디테일
5. 독자가 공감할 수 있는 상황`,

      usp: `당신은 USP(고유판매제안) 작성 전문가입니다. 서비스나 제품의 독특한 가치를 명확하고 설득력 있게 표현하세요.

규칙:
1. 경쟁사와의 차별점 강조
2. 구체적인 혜택 제시
3. 신뢰성 있는 근거 포함
4. 간결하고 임팩트 있는 표현
5. 고객 관점에서 작성`
    };

    return prompts[category] || prompts.title;
  }

  // 데이터셋 품질 통계 출력
  analyzeDataset(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.trim().split('\n');
      const data = lines.map(line => JSON.parse(line));

      console.log('\n📊 데이터셋 분석 결과:');
      console.log(`전체 샘플 수: ${data.length}`);
      
      // 카테고리별 분포
      const categoryCount = {};
      data.forEach(item => {
        const systemPrompt = item.messages[0].content;
        let category = 'unknown';
        if (systemPrompt.includes('제목 생성')) category = 'title';
        else if (systemPrompt.includes('첫 문단')) category = 'firstparagraph';
        else if (systemPrompt.includes('마무리')) category = 'closing';
        else if (systemPrompt.includes('스토리텔링')) category = 'story';
        else if (systemPrompt.includes('USP')) category = 'usp';
        
        categoryCount[category] = (categoryCount[category] || 0) + 1;
      });

      console.log('\n카테고리별 분포:');
      Object.entries(categoryCount).forEach(([cat, count]) => {
        console.log(`  ${cat}: ${count}개`);
      });

      // 평균 길이
      const avgInputLength = data.reduce((sum, item) => 
        sum + item.messages[1].content.length, 0) / data.length;
      const avgOutputLength = data.reduce((sum, item) => 
        sum + item.messages[2].content.length, 0) / data.length;

      console.log(`\n평균 입력 길이: ${Math.round(avgInputLength)}자`);
      console.log(`평균 출력 길이: ${Math.round(avgOutputLength)}자`);

    } catch (error) {
      console.error('❌ 데이터셋 분석 오류:', error.message);
    }
  }
}

// 실행 부분
if (require.main === module) {
  const preparer = new FineTuneDataPreparer();
  
  preparer.generateFineTuneDataset()
    .then(filePath => {
      preparer.analyzeDataset(filePath);
      console.log('\n✅ 파인튜닝 데이터 준비 완료!');
    })
    .catch(error => {
      console.error('❌ 오류 발생:', error);
    });
}

module.exports = FineTuneDataPreparer;