// lib/blogGenerator.js
const fs = require('fs').promises;
const path = require('path');
const { getOpenAIClient } = require('./openaiClient');

class BlogGenerator {
  constructor() {
    this.openai = getOpenAIClient();
    this.systemPrompts = {};
    this.loadSystemPrompts();
  }

  async loadSystemPrompts() {
    try {
      const promptsDir = path.join(__dirname, '../system_prompts');
      this.systemPrompts = {
        title: await fs.readFile(path.join(promptsDir, 'title_system.txt'), 'utf8'),
        firstParagraph: await fs.readFile(path.join(promptsDir, 'first_paragraph_system.txt'), 'utf8')
      };
    } catch (err) {
      console.warn('시스템 프롬프트 로드 실패, 기본값 사용:', err.message);
      this.systemPrompts = {
        title: '제목 생성 전문가입니다.',
        firstParagraph: '첫 문단 작성 전문가입니다.'
      };
    }
  }

  async generateContent(systemPrompt, userPrompt, options = {}) {
    const response = await this.openai.chat.completions.create({
      model: options.model || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 2000
    });
    return response.choices[0]?.message?.content?.trim();
  }

  async generateTitles(topic) {
    const prompt = `주제: ${topic}에 대한 매력적인 블로그 제목 5개를 생성해주세요.`;
    return this.generateContent(this.systemPrompts.title, prompt);
  }

  async generateFirstParagraph(topic) {
    const prompt = `주제: ${topic}에 대한 흥미로운 첫 문단을 작성해주세요.`;
    return this.generateContent(this.systemPrompts.firstParagraph, prompt);
  }

  async generateMainContent(topic, mode) {
    const systemPrompt = mode === 'knowledge' 
      ? this.getKnowledgeSystemPrompt() 
      : this.getStorySystemPrompt();
    
    const prompt = `주제: ${topic}에 대한 ${mode === 'knowledge' ? '정보성' : '스토리형'} 콘텐츠를 작성해주세요.`;
    return this.generateContent(systemPrompt, prompt, { maxTokens: 3000 });
  }

  async generateClosing(content) {
    const systemPrompt = `감성적이고 임팩트 있는 마무리 전문가입니다.`;
    const prompt = `다음 내용을 감정적으로 마무리해주세요:\n${content.slice(-500)}`;
    return this.generateContent(systemPrompt, prompt);
  }

  async generateBrandStrength(topic, brandInfo = '') {
    const systemPrompt = `브랜드 강점 부각 전문가입니다.`;
    const prompt = `주제: ${topic}에서 ${brandInfo} 브랜드의 강점을 자연스럽게 부각시켜주세요.`;
    return this.generateContent(systemPrompt, prompt);
  }

  getKnowledgeSystemPrompt() {
    return `[역할] 전문 정보성 콘텐츠 작가
[목표] 실제 문제 해결에 도움되는 근거 기반 정보 제공
[요구사항] 
- 신뢰할 수 있는 정보
- 쉬운 설명
- SEO 최적화
- 출처 명시`;
  }

  getStorySystemPrompt() {
    return `[역할] 스토리텔링 전문가
[목표] 독자의 감정적 공감과 몰입 유도
[요구사항]
- 관련성 있는 스토리
- 감정적 연결
- 자연스러운 교훈 도출`;
  }

  async saveBlogContent(filename, content) {
    const outputPath = path.join(__dirname, '../generated_blogs', filename);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, content, 'utf8');
    console.log(`✅ 블로그 콘텐츠 저장: ${outputPath}`);
    return outputPath;
  }
}

module.exports = BlogGenerator;