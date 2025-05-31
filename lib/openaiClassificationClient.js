require('dotenv').config();
const { getOpenAIClient } = require('./openaiClient');
const rlhfManager = require('./rlhfManager');

class OpenAIClassificationClient {
  constructor() {
    this.client = getOpenAIClient();
    this.fineTunedModel = process.env.OPENAI_CLASSIFICATION_MODEL || 'gpt-4o-mini'; // 기본값은 일반 모델
  }

  async classify(prompt, content, examples = [], category = null) {
    try {
      // content 유효성 검사
      if (!content || content.trim() === '') {
        console.error('❌ Empty content provided for classification');
        return null;
      }
      
      let systemPrompt = prompt;
      
      // RLHF 개선 프롬프트 적용
      systemPrompt = rlhfManager.getEnhancedClassificationPrompt(systemPrompt);
      
      // Few-shot 예시 추가
      if (examples.length > 0) {
        systemPrompt += '\n\n아래는 참고할 수 있는 좋은 예시들입니다:\n';
        examples.forEach((example, index) => {
          systemPrompt += `\n예시 ${index + 1}:\n${example}\n`;
        });
      }

      // 특정 카테고리에 대한 추가 지침
      if (category) {
        console.log(`[AI] Fine-tuned OpenAI ${category} classification started`);
      }

      const response = await this.client.chat.completions.create({
        model: this.fineTunedModel,
        max_tokens: 500,
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: content
          }
        ]
      });

      const result = response.choices[0].message.content.trim();
      
      if (category) {
        console.log(`✅ Fine-tuned OpenAI ${category} classification completed`);
      }

      return result;
    } catch (error) {
      console.error('❌ OpenAI API Error:', error.message);
      return null;
    }
  }

  async detectStory(content) {
    const prompt = `다음 텍스트가 스토리텔링 형식인지 판단해주세요. 
    
스토리텔링의 특징:
- 주인공이나 특정 인물이 등장
- 시간의 흐름이 있는 사건 전개
- 문제 상황과 해결 과정
- 감정적 몰입을 유도하는 서술

답변은 반드시 "YES" 또는 "NO"로만 해주세요.`;

    try {
      const result = await this.classify(prompt, content);
      return result && result.toUpperCase().includes('YES');
    } catch (error) {
      console.error('❌ Story detection error:', error.message);
      return false;
    }
  }
}

module.exports = OpenAIClassificationClient;