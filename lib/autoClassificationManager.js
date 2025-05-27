const fs = require('fs');
const path = require('path');
const AnthropicClient = require('./anthropicClient');
const CLASSIFICATION_PROMPTS = require('./classificationPrompts');

class AutoClassificationManager {
  constructor() {
    this.claude = new AnthropicClient();
    this.trainingExamplesDir = path.join(__dirname, '../training_examples');
    this.autoClassifiedDir = path.join(__dirname, '../auto_classified');
    this.claudeApprovedDir = path.join(__dirname, '../claude_approved');
    
    // 디렉토리 생성
    this.ensureDirectories();
  }

  ensureDirectories() {
    const dirs = [
      this.autoClassifiedDir,
      this.claudeApprovedDir,
      ...['title', 'firstparagraph', 'closing', 'story', 'usp'].map(type => 
        path.join(this.autoClassifiedDir, type)
      ),
      ...['title', 'firstparagraph', 'closing', 'story', 'usp'].map(type => 
        path.join(this.claudeApprovedDir, type)
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
      // 컨텐츠 길이 최적화
      const optimizedContent = this.optimizeContentLength(type, content);
      
      // Few-shot 예시를 최소화 (2개만 사용)
      const allExamples = await this.loadTrainingExamples(type);
      const examples = allExamples.slice(0, 2);
      
      const prompt = CLASSIFICATION_PROMPTS[type];
      if (!prompt) {
        throw new Error(`No prompt found for type: ${type}`);
      }

      const result = await this.claude.classify(prompt, optimizedContent, examples);
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
      title: () => content.substring(0, 200),
      closing: () => content.substring(content.length - 500),
      default: () => content.substring(0, 800)
    };
    
    return (strategies[type] || strategies.default)();
  }

  async processStructuredData(structuredData) {
    const results = {};
    
    // Story 감지 먼저 수행
    const isStory = await this.claude.detectStory(structuredData.body || '');
    console.log(`📖 Story detection: ${isStory ? 'YES' : 'NO'}`);

    // title, firstparagraph, closing은 항상 처리
    const basicTypes = ['title', 'firstparagraph', 'closing'];
    
    for (const type of basicTypes) {
      if (structuredData[type]) {
        results[type] = await this.classifyContent(type, structuredData[type]);
      }
    }

    // Story라면 story 분류 추가
    if (isStory && structuredData.body) {
      results.story = await this.classifyContent('story', structuredData.body);
    }

    // USP가 있다면 처리 (추후 추가 예정)
    if (structuredData.usp) {
      results.usp = await this.classifyContent('usp', structuredData.usp);
    }

    return { ...results, isStory };
  }

  saveAutoClassified(type, content, classification, index) {
    try {
      // 디렉토리 존재 확인 및 생성
      const typeDir = path.join(this.autoClassifiedDir, type);
      if (!fs.existsSync(typeDir)) {
        fs.mkdirSync(typeDir, { recursive: true });
      }
      
      const fileName = this.generateFileName(type, index);
      const filePath = path.join(typeDir, fileName);
      
      let output;
      if (type === 'firstparagraph') {
        // Claude 응답에서 ===user=== 와 ===assistant=== 부분을 파싱
        const userMatch = classification.match(/===user===\s*\n([\s\S]*?)(?=\n===assistant===|$)/);
        const assistantMatch = classification.match(/===assistant===\s*\n([\s\S]*?)$/);
        
        let tagsOnly = '';
        let firstParagraphOnly = '';
        
        if (userMatch && assistantMatch) {
          // Claude 응답에 ===user=== 와 ===assistant=== 가 있는 경우
          const userContent = userMatch[1].trim();
          const assistantContent = assistantMatch[1].trim();
          
          // user 부분에서 태그만 추출 (본문 제외)
          const userLines = userContent.split('\n');
          const tags = userLines.filter(line => 
            line.trim().startsWith('[') && line.trim().endsWith(']')
          );
          tagsOnly = tags.join('\n');
          
          // user 부분에서 태그 다음 본문 추출 (태그가 아닌 실제 본문)
          const userContentLines = userLines.filter(line => 
            !line.trim().startsWith('[') && 
            !line.trim().endsWith(']') && 
            line.trim().length > 10
          );
          
          const userFirstParagraph = userContentLines.join(' ').trim();
          
          // user 부분의 본문을 우선 사용, 없으면 assistant 부분 사용
          if (userFirstParagraph) {
            firstParagraphOnly = userFirstParagraph;
          } else {
            // assistant 부분에서 깔끔한 본문 추출
            const cleanContent = assistantContent
              .replace(/^부산\s+\S+$/gm, '') // "부산 지적장애" 같은 키워드 제거
              .replace(/​/g, '') // 네이버 특수문자 제거
              .replace(/https?:\/\/[^\s]+/g, '') // URL 제거
              .replace(/\b(?:010|1544)[-\s]?\d{3,4}[-\s]?\d{4}\b/g, '') // 전화번호 제거
              .replace(/\S+@\S+\.\S+/g, '') // 이메일 제거
              .replace(/(?:서울|부산|대구|인천|광주|대전|울산|세종|경기도|강원도|충청북도|충청남도|전라북도|전라남도|경상북도|경상남도|제주)(?:특별시|광역시|특별자치시|도|특별자치도)?\s*\S*/g, '') // 주소 제거
              .replace(/blog\.naver\.com.*$/gm, '') // 네이버 블로그 링크 제거
              .replace(/궁금할\s*땐\s*네이버\s*톡톡하세요!?/g, '') // 네이버 톡톡 문구 제거
              .split('\n')
              .filter(line => line.trim() && line.trim().length > 10) // 의미있는 문장만
              .join(' ')
              .trim();
            
            firstParagraphOnly = cleanContent;
          }
        } else {
          // 기존 로직 (태그와 본문이 함께 온 경우)
          const lines = classification.split('\n');
          const tags = [];
          const contentLines = [];
          let isInContent = false;
          
          for (const line of lines) {
            if (line.trim().startsWith('[') && line.trim().endsWith(']')) {
              tags.push(line);
            } else if (line.trim() === '') {
              if (tags.length > 0) isInContent = true;
            } else if (isInContent && line.trim()) {
              const cleanLine = line
                .replace(/^부산\s+\S+$/, '')
                .replace(/​/g, '')
                .replace(/https?:\/\/[^\s]+/g, '')
                .replace(/\b(?:010|1544)[-\s]?\d{3,4}[-\s]?\d{4}\b/g, '')
                .replace(/\S+@\S+\.\S+/g, '')
                .replace(/(?:서울|부산|대구|인천|광주|대전|울산|세종|경기도|강원도|충청북도|충청남도|전라북도|전라남도|경상북도|경상남도|제주)(?:특별시|광역시|특별자치시|도|특별자치도)?\s*\S*/g, '')
                .replace(/blog\.naver\.com.*$/g, '')
                .replace(/궁금할\s*땐\s*네이버\s*톡톡하세요!?/g, '')
                .trim();
              
              if (cleanLine && cleanLine.length > 10) {
                contentLines.push(cleanLine);
              }
            }
          }
          
          tagsOnly = tags.join('\n');
          firstParagraphOnly = contentLines.join(' ').trim();
        }
        
        // 350자 제한
        if (firstParagraphOnly.length > 350) {
          firstParagraphOnly = firstParagraphOnly.substring(0, 350).trim();
          const lastPeriod = Math.max(
            firstParagraphOnly.lastIndexOf('.'),
            firstParagraphOnly.lastIndexOf('다'),
            firstParagraphOnly.lastIndexOf('요'),
            firstParagraphOnly.lastIndexOf('니다')
          );
          if (lastPeriod > 200) {
            firstParagraphOnly = firstParagraphOnly.substring(0, lastPeriod + 1);
          }
        }
        
        output = `===user===\n${tagsOnly}\n\n===assistant===\n${firstParagraphOnly}`;
      } else {
        output = `===user===\n${classification}\n\n===assistant===\n${content}`;
      }
      
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