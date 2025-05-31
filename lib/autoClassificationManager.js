const fs = require('fs');
const path = require('path');
const OpenAIClassificationClient = require('./openaiClassificationClient');
const CLASSIFICATION_PROMPTS = require('./classificationPrompts');

class AutoClassificationManager {
  constructor() {
    this.openaiClient = new OpenAIClassificationClient();
    this.trainingExamplesDir = path.join(__dirname, '../training_examples');
    this.autoClassifiedDir = path.join(__dirname, '../auto_classified');
    this.approvedDir = path.join(__dirname, '../approved_data');
    
    // 각 카테고리별 형식 정의
    this.categoryFormats = {
      title: {
        userTags: ['Keyword:', 'Intent:', 'Tags:'],
        userPattern: /Keyword:\s*\[([^\]]+)\]\s*Intent:\s*\[([^\]]+)\]\s*Tags:\s*\[([^\]]+)\]/,
        maxUserLength: 300,
        maxAssistantLength: 100,
        requiresCompleteFormat: true
      },
      firstparagraph: {
        userTags: ['[키워드:', '[타깃:', '[R:', '[E:', '[M:', '[유도문장:'],
        userPattern: /\[키워드:\s*([^\]]+)\]\s*\[타깃:\s*([^\]]+)\]\s*\[R:\s*([^\]]+)\]\s*\[E:\s*([^\]]+)\]\s*\[M:\s*([^\]]+)\]\s*\[유도문장:\s*([^\]]+)\]/,
        maxUserLength: 500,
        maxAssistantLength: 500,
        requiresCompleteFormat: true
      },
      closing: {
        userTags: ['[톤1]', '[톤2]', '[목표/효과]'],
        userPattern: /\[([^\]]+)\],\s*\[([^\]]+)\],\s*\[([^\]]+)\]/,
        maxUserLength: 200,
        maxAssistantLength: 800,
        requiresCompleteFormat: false
      },
      story: {
        userTags: ['[주제]', '[메시지]', '[문제상황]', '[위기]', '[절정]', '[해소/결말]'],
        userPattern: /\[([^\]]+)\],\s*\[([^\]]+)\],\s*\[([^\]]+)\],\s*\[([^\]]+)\],\s*\[([^\]]+)\],\s*\[([^\]]+)\]/,
        maxUserLength: 300,
        maxAssistantLength: 1000,
        requiresCompleteFormat: false
      },
      usp: {
        userTags: ['[USP 항목:', '[트리거 문장:', '[근거1:', '[근거2:'],
        userPattern: /\[USP 항목:\s*([^\]]+)\][\s\S]*?\[트리거 문장:\s*([^\]]+)\][\s\S]*?\[근거1:\s*([^\]]+)\][\s\S]*?\[근거2:\s*([^\]]+)\]/,
        maxUserLength: 800,
        maxAssistantLength: 200,
        requiresCompleteFormat: false
      }
    };
    
    this.ensureDirectories();
  }

  ensureDirectories() {
    const dirs = [
      this.autoClassifiedDir,
      this.approvedDir,
      ...['title', 'firstparagraph', 'closing', 'story', 'usp'].map(type => 
        path.join(this.autoClassifiedDir, type)
      ),
      ...['title', 'firstparagraph', 'closing', 'story', 'usp'].map(type => 
        path.join(this.approvedDir, type)
      )
    ];

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  async loadTrainingExamples(type) {
    const examplesDir = path.join(this.trainingExamplesDir, type);
    if (!fs.existsSync(examplesDir)) {
      return [];
    }

    const files = fs.readdirSync(examplesDir).filter(f => f.endsWith('.txt'));
    const examples = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(examplesDir, file), 'utf8');
        examples.push(content);
      } catch (error) {
        console.error(`❌ Error reading example ${file}:`, error.message);
      }
    }

    return examples;
  }

  async classifyContent(type, content) {
    try {
      const optimizedContent = this.optimizeContentLength(type, content);
      const allExamples = await this.loadTrainingExamples(type);
      const examples = allExamples.slice(0, 2);
      
      const prompt = CLASSIFICATION_PROMPTS[type];
      if (!prompt) {
        throw new Error(`No prompt found for type: ${type}`);
      }

      const result = await this.openaiClient.classify(prompt, optimizedContent, examples, type);
      return result;
    } catch (error) {
      console.error(`❌ Classification error for ${type}:`, error.message);
      return null;
    }
  }

  optimizeContentLength(type, content) {
    if (content.length <= 1500) {
      return content;
    }
    
    const strategies = {
      title: () => content.substring(0, 35),
      closing: () => content.substring(content.length - 500),
      default: () => content.substring(0, 800)
    };
    
    return (strategies[type] || strategies.default)();
  }

  async processStructuredData(structuredData) {
    const results = {};
    
    const isStory = await this.openaiClient.detectStory(structuredData.body || '');
    
    const basicTypes = ['title', 'firstparagraph', 'closing'];
    
    for (const type of basicTypes) {
      if (structuredData[type]) {
        results[type] = await this.classifyContent(type, structuredData[type]);
      }
    }

    if (isStory && structuredData.body) {
      results.story = await this.classifyContent('story', structuredData.body);
    }

    if (structuredData.usp) {
      results.usp = await this.classifyContent('usp', structuredData.usp);
    }

    return { ...results, isStory };
  }

  cleanContent(content, type) {
    if (!content) return '';
    
    let cleaned = content
      .replace(/​/g, '')
      .replace(/https?:\/\/[^\s]+/g, '')
      .replace(/\b(?:010|1544|02|051|053|032|062|042|052|044)[-\s]?\d{3,4}[-\s]?\d{4}\b/g, '')
      .replace(/\S+@\S+\.\S+/g, '')
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      .trim();

    // firstparagraph 추가 정리
    if (type === 'firstparagraph') {
      cleaned = cleaned
        .replace(/blog\.naver\.com[^\n]*/g, '')
        .replace(/궁금할 땐 네이버 톡톡하세요![^\n]*/g, '')
        .replace(/함께 읽으면 좋은 글[^\n]*/g, '')
        .replace(/\[후기\][^\n]*/g, '')
        .replace(/\[사연\][^\n]*/g, '')
        .replace(/\[노하우\][^\n]*/g, '')
        // 지역명+서비스명 패턴 제거
        .replace(/[가-힣]+구\s+[가-힣]+센터[^\n]*/g, '')
        .replace(/[가-힣]+시\s+[가-힣]+(치료|센터)[^\n]*/g, '')
        // 반복되는 자기소개 (두 번째부터) 제거
        .replace(/(안녕하세요\.\s+\d+년[\s\S]*?입니다\.[\s\S]*?)(안녕하세요\.\s+\d+년[\s\S]*?입니다\.)/g, '$1')
        .replace(/\n\s*\n\s*\n+/g, '\n\n')
        .trim();
    }

    return cleaned;
  }
  
  formatOutput(type, classification, content) {
    const format = this.categoryFormats[type];
    if (!format) {
      console.warn(`⚠️ Unknown category type: ${type}`);
      return this.createFallbackOutput(type, classification, content);
    }

    // 범용적 검증 및 보정
    return this.validateAndFixOutput(type, classification, content, format);
  }

  validateAndFixOutput(type, classification, originalContent, format) {
    if (!classification) {
      console.warn(`⚠️ Empty classification for ${type}, using fallback`);
      return this.createFallbackOutput(type, originalContent, format);
    }

    // 이미 완전한 형식인지 확인
    if (classification.includes('===user===') && classification.includes('===assistant===')) {
      // 형식 검증
      if (this.validateFormat(type, classification, format)) {
        return this.cleanOutput(type, classification, format);
      } else {
        console.warn(`⚠️ Format validation failed for ${type}, reconstructing...`);
        return this.reconstructFromInvalidFormat(type, classification, originalContent, format);
      }
    }

    // OpenAI 모델이 형식 없이 반환한 경우 (title, closing 등)
    console.warn(`⚠️ No format markers for ${type}, reconstructing...`);
    return this.reconstructFromClassification(type, classification, originalContent, format);
  }

  validateFormat(type, text, format) {
    const userSection = this.extractSection(text, '===user===', '===assistant===');
    if (!userSection) return false;

    // 필수 태그 확인
    const hasAllTags = format.userTags.every(tag => userSection.includes(tag));
    
    // 길이 검증
    const isTooLong = userSection.length > format.maxUserLength;
    
    // 완전한 형식이 필요한 카테고리의 경우 추가 검증
    if (format.requiresCompleteFormat) {
      // 스토리나 다른 콘텐츠가 섞여있는지 확인
      const hasContamination = this.detectContentContamination(type, userSection);
      
      if (isTooLong || hasContamination) {
        console.warn(`⚠️ ${type} format contaminated or too long`);
        return false;
      }
    }
    
    return hasAllTags;
  }

  detectContentContamination(type, userSection) {
    // 각 타입별 오염 패턴 정의
    const contaminationPatterns = {
      title: [/안녕하세요/, /센터에서/, /치료받/, /어머님들/],
      firstparagraph: [/그 어머님은/, /센터에서 수업을/, /치료받으셨고/, /라고 하셨습니다/, /것 같았습니다/],
      closing: [/키워드:/, /타깃:/, /유도문장:/],
      story: [/Keyword:/, /Intent:/, /키워드:/],
      usp: [/키워드:/, /타깃:/, /유도문장:/]
    };

    const patterns = contaminationPatterns[type] || [];
    return patterns.some(pattern => pattern.test(userSection));
  }

  cleanOutput(type, text, format) {
    // ===assistant=== 섹션 길이 제한
    const parts = text.split('===assistant===');
    if (parts.length === 2) {
      const userPart = parts[0] + '===assistant===';
      let assistantPart = parts[1].trim();
      
      // assistant 섹션이 너무 길면 자르기
      if (assistantPart.length > format.maxAssistantLength) {
        assistantPart = assistantPart.substring(0, format.maxAssistantLength).trim();
        // 문장 단위로 자르기
        const lastPeriod = assistantPart.lastIndexOf('.');
        if (lastPeriod > format.maxAssistantLength * 0.5) {
          assistantPart = assistantPart.substring(0, lastPeriod + 1);
        }
      }
      
      text = userPart + '\n' + assistantPart;
    }

    return this.applyCommonCleaning(text);
  }

  applyCommonCleaning(text) {
    // 공통 정리 규칙
    return text
      .replace(/​/g, '')
      .replace(/https?:\/\/[^\s]+/g, '')
      .replace(/blog\.naver\.com[^\n]*/g, '')
      .replace(/궁금할 땐 네이버 톡톡하세요![^\n]*/g, '')
      .replace(/\b(?:010|1544|02|051|053|032|062|042)[-\s]?\d{3,4}[-\s]?\d{4}\b/g, '')
      .replace(/\S+@\S+\.\S+/g, '')
      .replace(/함께 읽으면 좋은 글[^\n]*/g, '')
      .replace(/No newline at end of file/g, '')
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      .trim();
  }

  extractSection(text, startMarker, endMarker) {
    const startIndex = text.indexOf(startMarker);
    const endIndex = text.indexOf(endMarker);
    
    if (startIndex === -1) return null;
    if (endIndex === -1) return text.substring(startIndex + startMarker.length).trim();
    
    return text.substring(startIndex + startMarker.length, endIndex).trim();
  }

  reconstructOutput(type, classification, originalContent, format) {
    // 분류 결과를 ===user=== 섹션으로 사용
    const userSection = classification.replace(/^===user===\s*/, '').replace(/\s*===assistant===.*$/s, '');
    
    // 원본 콘텐츠에서 적절한 길이로 추출
    const cleanContent = this.cleanContent(originalContent, type);
    const assistantContent = cleanContent.length > format.maxAssistantLength ? 
      cleanContent.substring(0, format.maxAssistantLength).trim() : cleanContent;

    return `===user===\n${userSection}\n\n===assistant===\n${assistantContent}`;
  }

  /**
   * 잘못된 형식의 분류 결과를 재구성
   */
  reconstructFromInvalidFormat(type, classification, originalContent, format) {
    try {
      const userSection = this.extractSection(classification, '===user===', '===assistant===');
      const assistantSection = this.extractSection(classification, '===assistant===', null);
      
      if (userSection && assistantSection) {
        // User 섹션 정리 - 오염된 내용 제거
        const cleanUser = this.cleanUserSection(userSection, type, format);
        // Assistant 섹션 정리
        const cleanAssistant = this.cleanAssistantSection(assistantSection, type, format);
        
        // User 섹션이 너무 오염되었으면 fallback 사용
        if (cleanUser.length < 20 || this.isUserSectionTooCorrupted(cleanUser, type)) {
          console.warn(`⚠️ User section too corrupted for ${type}, using fallback`);
          return this.createFallbackOutput(type, originalContent, format);
        }
        
        return `===user===\n${cleanUser}\n\n===assistant===\n${cleanAssistant}`;
      }
    } catch (error) {
      console.warn(`⚠️ Failed to reconstruct invalid format for ${type}:`, error.message);
    }
    
    return this.createFallbackOutput(type, originalContent, format);
  }

  /**
   * 형식 마커 없는 분류 결과를 재구성
   */
  reconstructFromClassification(type, classification, originalContent, format) {
    try {
      // 타입별 재구성 로직
      if (type === 'title') {
        return this.reconstructTitleFormat(classification, originalContent, format);
      } else if (type === 'closing') {
        return this.reconstructClosingFormat(classification, originalContent, format);
      } else {
        // 기타 타입은 fallback 사용
        return this.createFallbackOutput(type, originalContent, format);
      }
    } catch (error) {
      console.warn(`⚠️ Failed to reconstruct ${type} format:`, error.message);
      return this.createFallbackOutput(type, originalContent, format);
    }
  }

  /**
   * 제목 형식 재구성
   */
  reconstructTitleFormat(classification, originalContent, format) {
    // 제목에서 키워드와 의도 추출 시도
    const title = originalContent.trim();
    
    // 기본 fallback 사용하되 실제 제목을 assistant에 사용
    const fallbackUser = `Keyword: [${this.extractKeywordFromTitle(title)}]\nIntent: [정보 요청]\nTags: [Gain]`;
    
    return `===user===\n${fallbackUser}\n\n===assistant===\n${title}`;
  }

  /**
   * 클로징 형식 재구성  
   */
  reconstructClosingFormat(classification, originalContent, format) {
    // closing 분류 결과에서 태그 추출
    let userTags = '[전문적인], [친근한], [신뢰 형성]'; // 기본값
    
    // 분류 결과에서 대괄호 태그 찾기
    const tagMatches = classification.match(/\[([^\]]+)\]/g);
    if (tagMatches && tagMatches.length >= 3) {
      userTags = tagMatches.slice(0, 3).join(', ');
    }
    
    const cleanContent = this.cleanContent(originalContent, 'closing');
    const assistantContent = cleanContent.length > (format?.maxAssistantLength || 500) ? 
      cleanContent.substring(0, format?.maxAssistantLength || 500).trim() : cleanContent;
    
    return `===user===\n${userTags}\n\n===assistant===\n${assistantContent}`;
  }

  /**
   * Assistant 섹션 정리 (메타정보 제거)
   */
  cleanAssistantSection(assistantText, type, format) {
    let cleaned = assistantText
      .replace(/You are trained on data up to.*$/gm, '')  // 메타정보 제거
      .replace(/\n\s*\n\s*\n+/g, '\n\n')  // 과도한 줄바꿈 정리
      .trim();
    
    // 길이 제한
    if (format?.maxAssistantLength && cleaned.length > format.maxAssistantLength) {
      cleaned = cleaned.substring(0, format.maxAssistantLength).trim();
      // 문장 단위로 자르기
      const lastPeriod = cleaned.lastIndexOf('.');
      if (lastPeriod > format.maxAssistantLength * 0.7) {
        cleaned = cleaned.substring(0, lastPeriod + 1);
      }
    }
    
    return cleaned;
  }

  /**
   * User 섹션 정리 (오염된 내용 제거)
   */
  cleanUserSection(userSection, type, format) {
    if (!userSection) return '';
    
    let cleaned = userSection.trim();
    
    // 반복되는 제목 제거 (3번 이상 반복되면 제거)
    const lines = cleaned.split('\n');
    const uniqueLines = [];
    const lineCount = {};
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.length === 0) continue;
      
      lineCount[trimmedLine] = (lineCount[trimmedLine] || 0) + 1;
      
      // 같은 라인이 3번 이상 반복되면 처음 것만 유지
      if (lineCount[trimmedLine] <= 2) {
        uniqueLines.push(line);
      }
    }
    
    cleaned = uniqueLines.join('\n');
    
    // 스토리나 본문 내용이 user 섹션에 섞인 경우 제거
    const storyPatterns = [
      /이 글을 클릭하신 분들은/,
      /아마도.*?상황일 거라 생각합니다/,
      /그래서 오늘은.*?전문가인 제가/,
      /차이점과 각각의 장단점을/,
      /어떤 치료를 선택해야 할지/
    ];
    
    // 스토리 패턴이 포함된 라인들 제거
    const cleanLines = cleaned.split('\n').filter(line => {
      return !storyPatterns.some(pattern => pattern.test(line));
    });
    
    cleaned = cleanLines.join('\n').trim();
    
    // 타입별 필수 태그가 있는지 확인하고 없으면 fallback
    if (type === 'title' && !cleaned.includes('Keyword:')) {
      return null; // fallback으로 넘김
    }
    
    return cleaned;
  }

  /**
   * User 섹션이 너무 오염되었는지 확인
   */
  isUserSectionTooCorrupted(userSection, type) {
    if (!userSection || userSection.length < 10) return true;
    
    // 타입별 필수 요소 확인
    const requirements = {
      title: ['Keyword:', 'Intent:', 'Tags:'],
      firstparagraph: ['[키워드:', '[타깃:', '[R:', '[E:', '[M:', '[유도문장:'],
      closing: ['[', ']'], // 최소한 대괄호는 있어야 함
      story: ['[주제]', '[메시지]'],
      usp: ['[USP 항목:', '[트리거 문장:']
    };
    
    const required = requirements[type] || [];
    const foundCount = required.filter(req => userSection.includes(req)).length;
    
    // 필수 요소의 50% 이상이 없으면 오염된 것으로 판단
    return foundCount < Math.ceil(required.length * 0.5);
  }

  /**
   * 제목에서 키워드 추출
   */
  extractKeywordFromTitle(title) {
    // 간단한 키워드 추출 로직
    const keywords = title.split(/[,\s]+/).filter(word => 
      word.length > 1 && !['와', '과', '의', '를', '을', '이', '가', '에', '만', '보세요', '분들'].includes(word)
    );
    return keywords.slice(0, 2).join(' ') || '미분류';
  }

  createFallbackOutput(type, originalContent, format) {
    // 각 타입별 기본 fallback 생성
    const fallbacks = {
      title: `Keyword: [미분류]\nIntent: [정보 필요]\nTags: [Gain]`,
      firstparagraph: `[키워드: 미분류]\n[타깃: 일반 독자]\n[R: 전문가 안내]\n[E: 정보가 필요했을 것이다]\n[M: 올바른 정보를 얻을 수 있다는 점]\n[유도문장: 계속 읽어보세요]`,
      closing: `[전문적인], [친근한], [신뢰 형성]`,
      story: `[일반], [교훈], [문제], [위기], [해결], [결말]`,
      usp: `[USP 항목: 기본 강점]\n이유: 기본 강점 제시\n\n[트리거 문장: 선택 기준 제시]\n이유: 고객 선택 유도\n\n[근거1: 위험 요소]\n이유: 리스크 강조\n\n[근거2: 실질적 이익]\n이유: 혜택 강조`
    };

    const userSection = fallbacks[type] || `[기본 분류]`;
    const cleanContent = this.cleanContent(originalContent || '', type);
    const assistantContent = cleanContent.length > (format?.maxAssistantLength || 500) ? 
      cleanContent.substring(0, format?.maxAssistantLength || 500).trim() : cleanContent;

    return `===user===\n${userSection}\n\n===assistant===\n${assistantContent}`;
  }

  saveAutoClassified(type, content, classification, index) {
    try {
      const typeDir = path.join(this.autoClassifiedDir, type);
      if (!fs.existsSync(typeDir)) {
        fs.mkdirSync(typeDir, { recursive: true });
      }
      
      const fileName = this.generateFileName(type, index);
      const filePath = path.join(typeDir, fileName);
      
      const cleanContent = this.cleanContent(content, type);
      const output = this.formatOutput(type, classification, cleanContent);
      
      fs.writeFileSync(filePath, output, 'utf8');
      return fileName;
    } catch (error) {
      console.error(`❌ Error saving auto-classified ${type}:`, error.message);
      return null;
    }
  }

  generateFileName(type, index) {
    const prefixes = {
      title: 'ti_',
      firstparagraph: 'fp_',
      closing: 'cl_',
      story: 'st_',
      usp: 'usp_'
    };
    
    const prefix = prefixes[type] || 'unknown_';
    return `${prefix}${String(index).padStart(3, '0')}.txt`;
  }

  getNextIndex(type) {
    const dir = path.join(this.autoClassifiedDir, type);
    if (!fs.existsSync(dir)) {
      return 1;
    }

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));
    if (files.length === 0) {
      return 1;
    }

    const indices = files.map(f => {
      const match = f.match(/(\d+)\.txt$/);
      return match ? parseInt(match[1], 10) : 0;
    });

    return Math.max(...indices) + 1;
  }

  async processAndSave(structuredData, blogIndex) {
    const results = await this.processStructuredData(structuredData);
    const savedFiles = {};

    for (const [type, classification] of Object.entries(results)) {
      if (type === 'isStory' || !classification) continue;

      const content = structuredData[type];
      if (content) {
        const index = this.getNextIndex(type);
        const fileName = this.saveAutoClassified(type, content, classification, index);
        if (fileName) {
          savedFiles[type] = fileName;
        }
      }
    }

    return { results, savedFiles };
  }
}

module.exports = AutoClassificationManager;