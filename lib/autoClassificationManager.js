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
    console.log(`🔍 classifyContent 호출됨 - type: '${type}', content 길이: ${content?.length || 0}`);
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
      title: () => content.substring(0, 35),
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
      
      console.log(`🔍 saveAutoClassified 호출됨 - type: '${type}'`);
      
      let output;
      if (type === 'firstparagraph' || type === 'closing') {
        console.log(`🔧 ${type} 정리 로직 시작...`);
        // Claude 응답을 강제로 재구성 (firstparagraph 및 closing)
        let tagsOnly = '';
        let contentOnly = '';  // firstParagraph 또는 closing 내용
        
        // Claude 응답에서 user와 assistant 구분
        const userMatch = classification.match(/===user===\s*\n([\s\S]*?)(?=\n===assistant===|$)/);
        const assistantMatch = classification.match(/===assistant===\s*\n([\s\S]*?)$/);
        
        if (userMatch) {
          const userContent = userMatch[1].trim();
          const userLines = userContent.split('\n');
          
          // 1. 태그 추출
          const tags = userLines.filter(line => 
            line.trim().startsWith('[') && line.trim().endsWith(']')
          );
          tagsOnly = tags.join('\n');
          
          // 2. user 부분의 본문 추출 (태그가 아닌 부분)
          const userTextLines = userLines.filter(line => 
            !line.trim().startsWith('[') && 
            !line.trim().endsWith(']') && 
            line.trim().length > 5 &&
            line.trim() !== ''
          );
          
          if (userTextLines.length > 0 && type === 'firstparagraph') {
            // firstparagraph만 user 부분 본문 사용
            contentOnly = userTextLines.join(' ').trim();
          } else if (assistantMatch) {
            // closing은 항상 assistant 부분 사용
            contentOnly = assistantMatch[1].trim();
          }
        } else {
          // ===user=== 구조가 없는 경우 전체를 파싱
          const lines = classification.split('\n');
          const tags = [];
          const contentLines = [];
          let foundTags = false;
          
          for (const line of lines) {
            if (line.trim().startsWith('[') && line.trim().endsWith(']')) {
              tags.push(line);
              foundTags = true;
            } else if (foundTags && line.trim().length > 5) {
              contentLines.push(line.trim());
            }
          }
          
          tagsOnly = tags.join('\n');
          contentOnly = contentLines.join(' ').trim();
        }
        
        // 방해요소 제거 (강화된 정리)
        console.log(`🔧 ${type} 정리 전 길이:`, contentOnly.length);
        console.log(`🔧 ${type} 정리 전 미리보기:`, contentOnly.substring(0, 200) + '...');
        contentOnly = contentOnly
          .replace(/^부산\s+\S+$/gm, '') // "부산 지적장애" 같은 키워드 제거
          .replace(/​/g, '') // 네이버 특수문자 제거
          .replace(/https?:\/\/[^\s]+/g, '') // URL 제거
          .replace(/\b(?:010|1544|02|051|053|032|062|042|052|044)[-\s]?\d{3,4}[-\s]?\d{4}\b/g, '') // 전화번호 제거 (지역번호 포함)
          .replace(/\S+@\S+\.\S+/g, '') // 이메일 제거
          
          // 강화된 주소 제거 패턴
          .replace(/경상남도.*?상가.*?호/g, '') // 경상남도 김해시 번화1로84번길 28 탑스코아상가 306호
          .replace(/부산광역시.*?\d+층/g, '') // 부산광역시 부산진구 가야대로 586 8층
          .replace(/(?:서울|부산|대구|인천|광주|대전|울산|세종|경기도|강원도|충청북도|충청남도|전라북도|전라남도|경상북도|경상남도|제주)(?:특별시|광역시|특별자치시|도|특별자치도)?.*?(?:구|시|군).*?(?:로|길|동).*?(?:\d+호|\d+층|상가|빌딩|센터|타워)/g, '') // 일반 주소 패턴
          
          // 링크 텍스트 껍데기 제거 (실제 텍스트 기반)
          .replace(/함께\s*읽으면\s*좋은\s*글[\s\S]*$/g, '') // "함께 읽으면 좋은 글" 이후 모든 내용 제거
          .replace(/센터\s*치료사\s*선생님들을\s*소개합니다!?/g, '') // 센터 치료사 선생님들을 소개합니다!
          .replace(/좋은\s*선생님들?\s*있는\s*곳\s*알려주세요\.?.*$/gm, '') // 좋은 선생님들 있는 곳 알려주세요
          .replace(/놀란\s*가슴을\s*부여잡고\s*오신\s*어머님들께\s*드리는\s*편지/g, '') // 놀란 가슴을 부여잡고 오신 어머님들께 드리는 편지
          .replace(/해운대\s*감통치료\s*비용.*?좋을까요\?/g, '') // 해운대 감통치료 비용, 비쌀수록 좋을까요?
          .replace(/감통치료를\s*알아보는데.*?어떤\s*차이가\s*있나요\?.*?/g, '') // 감통치료를 알아보는데 금액대가 다양하더라고요...
          .replace(/\d+년?\s*차\s*치?.*?졸업?.*?석사.*?/g, '') // 14년 차 치... 대표 이지영... 졸업... 석사...
          .replace(/대표\s*이\s*지\s*영.*?석사.*?졸?.*?/g, '') // 대표 이지영 관련 정보
          
          // 네이버 관련 정크 제거
          .replace(/blog\.naver\.com.*$/gm, '') // 네이버 블로그 링크 제거
          .replace(/궁금할\s*땐\s*네이버\s*톡톡하세요!?/g, '') // 네이버 톡톡 문구 제거
          .replace(/톡톡이나\s*번호를\s*통해.*$/gm, '') // 톡톡 관련 문구 제거
          .replace(/톡톡이나\s*번호를\s*통해[\s\S]*?말씀드리겠습니다\.?/g, '') // 톡톡이나 번호를 통해 연락을 주시면 더욱 자세하게 말씀드리겠습니다
          
          // 센터명 및 안내 정보 제거
          .replace(/이지언어행동발달센터.*?부산가야점?/g, '') // 이지언어행동발달센터... 부산가야점
          .replace(/이지언어행동발달센터\s*이지영\s*원장이었습니다\.?/g, '') // 이지언어행동발달센터 이지영 원장이었습니다
          
          // 기타 정리
          .replace(/안녕하세요\.\s*안녕하세요\./g, '안녕하세요.') // 중복 인사말 제거
          .replace(/안내[\s\S]*?예약제로\s*운영.*?진심으로/g, '') // 안내 섹션 전체 제거
          .replace(/모두\s*예약제로\s*운영.*?진심으로/g, '') // 예약제 운영 관련 제거
          .replace(/한\s*명\s*한\s*명과\s*진심으로/g, '') // 한 명 한 명과 진심으로
          .replace(/\n\s*\n\s*\n+/g, '\n\n') // 과도한 줄바꿈 정리
          .replace(/​+/g, '') // 네이버 특수문자 추가 제거
          .trim();
        
        console.log(`🔧 ${type} 정리 후 길이:`, contentOnly.length);
        console.log(`🔧 ${type} 정리 후 미리보기:`, contentOnly.substring(0, 200) + '...');
        
        // 500자 확장 (원본 콘텐츠에서 더 많이 추출)
        if (contentOnly.length < 200 && content) {
          // 너무 짧으면 원본 content에서 더 추출
          const cleanOriginal = content
            .replace(/​/g, '')
            .replace(/https?:\/\/[^\s]+/g, '')
            .replace(/\b(?:010|1544)[-\s]?\d{3,4}[-\s]?\d{4}\b/g, '')
            .replace(/\S+@\S+\.\S+/g, '')
            .trim();
          
          const sentences = cleanOriginal.split(/[\.!?]\s+/);
          const firstFewSentences = sentences.slice(0, 4).join('. ') + '.';
          
          if (firstFewSentences.length > contentOnly.length) {
            contentOnly = firstFewSentences;
          }
        }
        
        // 500자 제한
        if (contentOnly.length > 500) {
          contentOnly = contentOnly.substring(0, 500).trim();
          const lastPeriod = Math.max(
            contentOnly.lastIndexOf('.'),
            contentOnly.lastIndexOf('다'),
            contentOnly.lastIndexOf('요'),
            contentOnly.lastIndexOf('니다')
          );
          if (lastPeriod > 300) {
            contentOnly = contentOnly.substring(0, lastPeriod + 1);
          }
        }
        
        // 문단 나누기
        contentOnly = contentOnly
          .replace(/([다요니다\.]\s*)/g, '$1\n\n')
          .replace(/\n\n\s*\n+/g, '\n\n')
          .trim();
        
        output = `===user===\n${tagsOnly}\n\n===assistant===\n${contentOnly}`;
        console.log(`🔧 ${type} 최종 출력 길이:`, output.length);
        console.log(`🔧 ${type} 최종 태그:`, tagsOnly);
      } else {
        console.log(`🔧 ${type} 기본 출력 사용 (정리 없음)`);
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
    console.log(`🔍 processAndSave 호출됨 - blogIndex: ${blogIndex}`);
    console.log(`🔍 structuredData keys:`, Object.keys(structuredData));
    const results = await this.processStructuredData(structuredData);
    console.log(`🔍 classification results:`, Object.keys(results));
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