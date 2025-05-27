require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const rlhfManager = require('./rlhfManager');

class AnthropicClient {
  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
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
        console.log(`🤖 RLHF-Enhanced ${category} classification started`);
      }

      const message = await this.client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 500, // 토큰 절약: 분류 결과는 길지 않으므로 500으로 제한
        temperature: 0.1, // 토큰 절약: 더 결정적인 응답으로 변경
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: content
          }
        ]
      });

      const result = message.content[0].text.trim();
      
      if (category) {
        console.log(`✅ RLHF-Enhanced ${category} classification completed`);
      }

      return result;
    } catch (error) {
      console.error('❌ Claude API Error:', error.message);
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

module.exports = AnthropicClient;