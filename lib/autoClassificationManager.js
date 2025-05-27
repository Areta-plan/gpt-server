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
      
      const output = `===user===\n${classification}\n\n===assistant===\n${content}`;
      
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