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
    
    return content
      .replace(/​/g, '')
      .replace(/https?:\/\/[^\s]+/g, '')
      .replace(/\b(?:010|1544|02|051|053|032|062|042|052|044)[-\s]?\d{3,4}[-\s]?\d{4}\b/g, '')
      .replace(/\S+@\S+\.\S+/g, '')
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      .trim();
  }
  
  formatOutput(type, classification, content) {
    const maxLength = type === 'title' ? 50 : 500;
    const trimmedContent = content.length > maxLength ? 
      content.substring(0, maxLength).trim() : content;
    
    return `===user===\n${classification}\n\n===assistant===\n${trimmedContent}`;
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