// lib/rlhfManager.js - RLHF 피드백 분석 및 성능 개선 시스템

const fs = require('fs');
const path = require('path');

class RLHFManager {
  constructor() {
    this.feedbackFile = path.resolve(__dirname, '../rlhf_feedback.jsonl');
    this.improvementPrompts = new Map();
    this.performanceThreshold = 3.0; // 3점 미만은 개선 필요
    this.loadExistingFeedback();
  }

  /**
   * 기존 피드백 데이터 로드 및 분석
   */
  loadExistingFeedback() {
    try {
      if (!fs.existsSync(this.feedbackFile)) {
        console.log('📊 RLHF: 피드백 파일이 없습니다. 새로 시작합니다.');
        return;
      }

      const content = fs.readFileSync(this.feedbackFile, 'utf8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      
      console.log(`📊 RLHF: ${lines.length}개의 피드백 데이터를 분석합니다.`);
      
      const feedback = lines.map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          console.warn('잘못된 피드백 데이터:', line);
          return null;
        }
      }).filter(Boolean);

      this.analyzeFeedbackAndGenerateImprovements(feedback);
    } catch (error) {
      console.error('피드백 로드 오류:', error);
    }
  }

  /**
   * 피드백 분석 및 개선점 도출
   */
  analyzeFeedbackAndGenerateImprovements(feedbackData) {
    const categoryStats = {};
    
    feedbackData.forEach(entry => {
      // 분류 점수 분석
      Object.entries(entry.classificationScores || {}).forEach(([category, score]) => {
        if (!categoryStats[category]) {
          categoryStats[category] = { scores: [], type: 'classification' };
        }
        categoryStats[category].scores.push(score);
      });

      // 태깅 점수 분석  
      Object.entries(entry.taggingScores || {}).forEach(([category, score]) => {
        const tagKey = `${category}_tagging`;
        if (!categoryStats[tagKey]) {
          categoryStats[tagKey] = { scores: [], type: 'tagging' };
        }
        categoryStats[tagKey].scores.push(score);
      });
    });

    // 성능이 낮은 카테고리 식별 및 개선 프롬프트 생성
    Object.entries(categoryStats).forEach(([category, data]) => {
      const avgScore = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
      const lowScoreCount = data.scores.filter(score => score < this.performanceThreshold).length;
      const lowScoreRatio = lowScoreCount / data.scores.length;

      console.log(`📊 ${category}: 평균 ${avgScore.toFixed(2)}점 (${data.scores.length}개 평가, 낮은 점수 비율: ${(lowScoreRatio * 100).toFixed(1)}%)`);

      if (avgScore < this.performanceThreshold || lowScoreRatio > 0.3) {
        this.generateImprovementPrompt(category, avgScore, lowScoreRatio, data.type);
      }
    });
  }

  /**
   * 성능이 낮은 카테고리에 대한 개선 프롬프트 생성
   */
  generateImprovementPrompt(category, avgScore, lowScoreRatio, type) {
    const baseCategory = category.replace('_tagging', '');
    
    let improvementPrompt = '';
    
    if (type === 'classification') {
      improvementPrompt = this.getClassificationImprovementPrompt(baseCategory, avgScore, lowScoreRatio);
    } else {
      improvementPrompt = this.getTaggingImprovementPrompt(baseCategory, avgScore, lowScoreRatio);
    }

    this.improvementPrompts.set(category, improvementPrompt);
    console.log(`🔧 ${category} 개선 프롬프트 생성됨 (평균 점수: ${avgScore.toFixed(2)})`);
  }

  /**
   * 분류 개선 프롬프트 생성
   */
  getClassificationImprovementPrompt(category, avgScore, lowScoreRatio) {
    const categoryGuidelines = {
      title: {
        focus: '매력적이고 클릭을 유도하는 제목',
        criteria: ['호기심 유발', '명확한 가치 제안', '감정적 어필', 'SEO 최적화', '적절한 길이'],
        examples: [
          '❌ 나쁜 예: "새로운 제품 소개"',
          '✅ 좋은 예: "10분만에 완성하는 혁신적인 솔루션 - 당신의 일상을 바꿔드립니다"'
        ]
      },
      firstparagraph: {
        focus: '독자의 관심을 즉시 사로잡는 도입부',
        criteria: ['강력한 훅', '문제 제기', '독자와의 공감', '글의 방향 제시', '읽기 쉬운 문체'],
        examples: [
          '❌ 나쁜 예: "오늘은 ~에 대해 이야기하겠습니다."',
          '✅ 좋은 예: "매일 반복되는 이 문제로 고민이셨나요? 3분이면 해결할 수 있는 방법이 있습니다."'
        ]
      },
      closing: {
        focus: '강력한 마무리와 행동 유도',
        criteria: ['감정적 여운', '명확한 CTA', '핵심 메시지 재강조', '독자 동기부여', '기억에 남는 마무리'],
        examples: [
          '❌ 나쁜 예: "이상으로 글을 마치겠습니다."',
          '✅ 좋은 예: "지금 바로 시작해보세요. 당신의 변화가 시작되는 순간입니다!"'
        ]
      },
      story: {
        focus: '몰입도 높은 스토리텔링',
        criteria: ['감정적 연결', '구체적 상황', '갈등과 해결', '교훈 도출', '독자 경험과 연결'],
        examples: [
          '❌ 나쁜 예: "한 고객이 좋다고 했습니다."',
          '✅ 좋은 예: "절망에 빠진 김 대리, 마감 2시간 전 기적처럼 찾은 솔루션의 이야기"'
        ]
      },
      usp: {
        focus: '독특하고 차별화된 가치 제안',
        criteria: ['경쟁사 대비 차별점', '구체적 혜택', '증명 가능한 주장', '고객 관점', '명확한 포지셔닝'],
        examples: [
          '❌ 나쁜 예: "우리 제품은 좋습니다."',
          '✅ 좋은 예: "업계 유일의 AI 기반 24시간 실시간 모니터링으로 99.9% 오류 예방"'
        ]
      }
    };

    const guideline = categoryGuidelines[category] || categoryGuidelines.title;
    
    return `
[${category.toUpperCase()} 개선 가이드라인 - 사용자 평가 ${avgScore.toFixed(1)}/5.0]

⚠️ 주의: 이 카테고리는 사용자 만족도가 낮습니다 (${(lowScoreRatio * 100).toFixed(0)}%가 3점 미만 평가)

📌 핵심 개선 포인트: ${guideline.focus}

✅ 반드시 포함해야 할 요소:
${guideline.criteria.map(c => `- ${c}`).join('\n')}

📝 예시:
${guideline.examples.join('\n')}

🎯 개선 목표: 다음 평가에서 4.0점 이상 달성
`;
  }

  /**
   * 태깅 개선 프롬프트 생성
   */
  getTaggingImprovementPrompt(category, avgScore, lowScoreRatio) {
    return `
[${category.toUpperCase()} 태깅 품질 개선 - 사용자 평가 ${avgScore.toFixed(1)}/5.0]

⚠️ 태깅 품질이 기대에 못 미치고 있습니다 (${(lowScoreRatio * 100).toFixed(0)}%가 3점 미만 평가)

🔧 개선 요구사항:
- 더 정확한 카테고리 분류
- 일관성 있는 태깅 기준 적용
- 사용자 의도를 정확히 파악한 태깅
- 누락되는 중요 요소 없이 완전한 태깅

📊 품질 기준:
- 정확성: 의도한 내용과 일치
- 완성도: 필요한 모든 요소 포함
- 일관성: 비슷한 내용은 비슷하게 태깅
- 유용성: 실제 도움이 되는 분류

🎯 개선 목표: 다음 평가에서 4.0점 이상 달성
`;
  }

  /**
   * 분류 요청 시 개선 프롬프트 적용
   */
  getEnhancedClassificationPrompt(basePrompt) {
    let enhancedPrompt = basePrompt;
    
    // 각 카테고리별 개선 사항 추가
    this.improvementPrompts.forEach((improvement, category) => {
      if (category.includes('_tagging')) return; // 태깅 개선은 제외
      
      enhancedPrompt += '\n\n' + improvement;
    });

    // 전반적인 품질 향상 가이드
    if (this.improvementPrompts.size > 0) {
      enhancedPrompt += `

🚀 RLHF 품질 향상 모드 활성화
- 사용자 피드백을 반영한 개선된 분류 기준 적용
- 이전 낮은 평가를 받은 패턴을 피하고 고품질 결과 생성
- 각 카테고리별 구체적인 개선 가이드라인 준수

📊 목표: 모든 카테고리에서 4.0/5.0 이상의 만족도 달성`;
    }

    return enhancedPrompt;
  }

  /**
   * 새로운 피드백 처리
   */
  async processNewFeedback(feedback) {
    try {
      // 피드백 저장
      const feedbackEntry = JSON.stringify({
        ...feedback,
        processedAt: new Date().toISOString()
      }) + '\n';
      
      fs.appendFileSync(this.feedbackFile, feedbackEntry);

      // 실시간 분석 및 개선
      this.analyzeFeedbackAndGenerateImprovements([feedback]);
      
      // Negative training 데이터 생성 (점수가 낮은 경우)
      await this.generateNegativeTrainingData(feedback);
      
      console.log('📊 RLHF: 새로운 피드백이 처리되어 시스템이 업데이트되었습니다.');
      
      return {
        success: true,
        message: '피드백이 처리되어 AI 성능이 개선되었습니다.',
        improvementsActive: this.improvementPrompts.size > 0
      };
    } catch (error) {
      console.error('피드백 처리 오류:', error);
      throw error;
    }
  }

  /**
   * Negative Training 데이터 생성
   */
  async generateNegativeTrainingData(feedback) {
    try {
      const negativeTrainingDir = path.resolve(__dirname, '../negative_training');
      
      // 디렉토리 생성
      if (!fs.existsSync(negativeTrainingDir)) {
        fs.mkdirSync(negativeTrainingDir, { recursive: true });
      }

      // 낮은 점수 임계값
      const lowScoreThreshold = 2;
      
      // 일괄 평가인 경우
      if (feedback.type === 'bulk_evaluation' && feedback.evaluations) {
        for (const evaluation of feedback.evaluations) {
          await this.processNegativeExample(evaluation, negativeTrainingDir);
        }
      } 
      // 개별 피드백인 경우 (기존 형태)
      else if (feedback.classificationScores || feedback.taggingScores) {
        await this.processNegativeExample(feedback, negativeTrainingDir);
      }
      // 새로운 단순 피드백 형태 처리
      else if (feedback.userScore && feedback.userScore <= lowScoreThreshold && feedback.userFeedback) {
        await this.processSimpleNegativeExample(feedback, negativeTrainingDir);
      }

      console.log('🔄 Negative training 데이터 생성 완료');
    } catch (error) {
      console.error('❌ Negative training 데이터 생성 오류:', error);
    }
  }

  /**
   * 개별 네거티브 예시 처리
   */
  async processNegativeExample(evaluation, negativeTrainingDir) {
    const lowScoreThreshold = 2; // 2점 이하는 negative example로 처리
    
    // 분류 점수가 낮은 경우
    if (evaluation.classificationScore && evaluation.classificationScore <= lowScoreThreshold) {
      await this.createNegativeTrainingEntry(
        evaluation, 
        'classification', 
        negativeTrainingDir,
        evaluation.improvement || ''
      );
    }
    
    // 태깅 점수가 낮은 경우
    if (evaluation.taggingScore && evaluation.taggingScore <= lowScoreThreshold) {
      await this.createNegativeTrainingEntry(
        evaluation, 
        'tagging', 
        negativeTrainingDir,
        evaluation.improvement || ''
      );
    }
  }

  /**
   * 네거티브 트레이닝 엔트리 생성
   */
  async createNegativeTrainingEntry(evaluation, type, negativeTrainingDir, improvement) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${type}_negative_${timestamp}.jsonl`;
      const filepath = path.join(negativeTrainingDir, filename);
      
      // 네거티브 트레이닝 데이터 구조
      const negativeEntry = {
        type: 'negative_example',
        evaluation_type: type,
        filename: evaluation.filename,
        score: type === 'classification' ? evaluation.classificationScore : evaluation.taggingScore,
        improvement_suggestion: improvement,
        timestamp: evaluation.completedAt || new Date().toISOString(),
        
        // JSONL 형태의 트레이닝 데이터
        training_data: {
          messages: [
            {
              role: "system",
              content: this.generateNegativeSystemPrompt(type, improvement)
            },
            {
              role: "user", 
              content: "이 예시는 품질이 낮은 결과입니다. 개선이 필요합니다."
            },
            {
              role: "assistant",
              content: improvement || "더 나은 결과를 위해 다음 사항들을 개선해야 합니다: 정확성, 일관성, 완성도"
            }
          ]
        }
      };
      
      // 파일에 추가
      const entryString = JSON.stringify(negativeEntry) + '\n';
      fs.appendFileSync(filepath, entryString);
      
      console.log(`📝 Negative training 엔트리 생성: ${filename}`);
      
    } catch (error) {
      console.error('네거티브 트레이닝 엔트리 생성 오류:', error);
    }
  }

  /**
   * 간단한 네거티브 예시 처리 (새로운 피드백 형태)
   */
  async processSimpleNegativeExample(feedback, negativeTrainingDir) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${feedback.category}_negative_${timestamp}.jsonl`;
      const filepath = path.join(negativeTrainingDir, filename);
      
      // 네거티브 트레이닝 데이터 구조
      const negativeEntry = {
        type: 'negative_example',
        category: feedback.category,
        score: feedback.userScore,
        improvement_suggestion: feedback.userFeedback,
        timestamp: feedback.timestamp || new Date().toISOString(),
        
        // JSONL 형태의 트레이닝 데이터
        training_data: {
          messages: [
            {
              role: "system",
              content: this.generateNegativeSystemPrompt(feedback.category, feedback.userFeedback)
            },
            {
              role: "user", 
              content: `${feedback.category} 분류를 해주세요: ${feedback.content}`
            },
            {
              role: "assistant",
              content: `❌ 나쁜 예시: ${feedback.classification}\n\n문제점: ${feedback.userFeedback}`
            }
          ]
        }
      };
      
      // 파일에 추가
      const entryString = JSON.stringify(negativeEntry) + '\n';
      fs.appendFileSync(filepath, entryString);
      
      console.log(`📝 Negative training 엔트리 생성: ${filename}`);
      
    } catch (error) {
      console.error('간단한 네거티브 트레이닝 엔트리 생성 오류:', error);
    }
  }

  /**
   * 네거티브 트레이닝용 시스템 프롬프트 생성
   */
  generateNegativeSystemPrompt(category, improvement) {
    const basePrompt = `이것은 품질이 낮은 ${category} 분류 결과의 예시입니다.`;
    
    if (improvement) {
      return `${basePrompt}\n\n개선 제안:\n${improvement}\n\n이러한 문제점들을 피하고 더 나은 결과를 생성하세요.`;
    }
    
    return `${basePrompt}\n\n이러한 유형의 낮은 품질 결과를 피하고 더 정확하고 유용한 결과를 생성하세요.`;
  }

  /**
   * 성능 통계 조회
   */
  getPerformanceStats() {
    try {
      if (!fs.existsSync(this.feedbackFile)) {
        return { totalFeedback: 0, categories: {} };
      }

      const content = fs.readFileSync(this.feedbackFile, 'utf8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      
      const feedback = lines.map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      }).filter(Boolean);

      const stats = {
        totalFeedback: feedback.length,
        categories: {},
        activeImprovements: this.improvementPrompts.size,
        lastUpdate: feedback.length > 0 ? feedback[feedback.length - 1].timestamp : null
      };

      // 카테고리별 통계
      feedback.forEach(entry => {
        Object.entries(entry.classificationScores || {}).forEach(([category, score]) => {
          if (!stats.categories[category]) {
            stats.categories[category] = { scores: [], avgScore: 0, improvementNeeded: false };
          }
          stats.categories[category].scores.push(score);
        });
      });

      // 평균 점수 계산
      Object.keys(stats.categories).forEach(category => {
        const scores = stats.categories[category].scores;
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        stats.categories[category].avgScore = avg;
        stats.categories[category].improvementNeeded = avg < this.performanceThreshold;
      });

      return stats;
    } catch (error) {
      console.error('통계 조회 오류:', error);
      return { error: error.message };
    }
  }
}

module.exports = new RLHFManager();