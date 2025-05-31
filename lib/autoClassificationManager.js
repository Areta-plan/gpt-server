const fs = require('fs');
const path = require('path');
const OpenAIClassificationClient = require('./openaiClassificationClient');
const CLASSIFICATION_PROMPTS = require('./classificationPrompts');

class AutoClassificationManager {
  constructor() {
    this.openaiClient = new OpenAIClassificationClient();
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
    
    // Story 감지 먼저 수행
    const isStory = await this.openaiClient.detectStory(structuredData.body || '');
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
          
          // 2. user 부분의 본문 추출 (태그가 아닌 부분) - assistant로 이동용
          const userTextLines = userLines.filter(line => 
            !line.trim().startsWith('[') && 
            !line.trim().endsWith(']') && 
            line.trim().length > 5 &&
            line.trim() !== ''
          );
          
          // 모든 타입에서 assistant 부분을 우선 사용
          if (assistantMatch) {
            contentOnly = assistantMatch[1].trim();
            
            // firstparagraph에서 user 부분에 본문이 있으면 assistant로 합치기
            if (type === 'firstparagraph' && userTextLines.length > 0) {
              const userText = userTextLines.join(' ').trim();
              // assistant 내용이 짧고 user에 좋은 내용이 있을 때 대체
              if (contentOnly.length < userText.length * 0.5) {
                contentOnly = userText;
              }
            }
          } else if (userTextLines.length > 0) {
            // assistant가 없으면 user 부분 사용
            contentOnly = userTextLines.join(' ').trim();
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
        
        // firstparagraph의 경우 최종 포맷 검증 및 수정
        if (type === 'firstparagraph') {
          // user 섹션에서 assistant로 이동된 본문을 정리
          contentOnly = contentOnly
            .replace(/===user===[\s\S]*?===assistant===/g, '') // 기존 서식 제거
            .replace(/\[.*?\]/g, '') // 남은 태그 제거
            .trim();
        }
        contentOnly = contentOnly
          .replace(/^[가-힣]+\s+\S+$/gm, '') // "부산 지적장애" 같은 지역+키워드 패턴 제거
          .replace(/​/g, '') // 네이버 특수문자 제거
          .replace(/https?:\/\/[^\s]+/g, '') // URL 제거
          .replace(/\b(?:010|1544|02|051|053|032|062|042|052|044)[-\s]?\d{3,4}[-\s]?\d{4}\b/g, '') // 전화번호 제거 (지역번호 포함)
          .replace(/\S+@\S+\.\S+/g, '') // 이메일 제거
          
          // 강화된 주소 제거 패턴
          .replace(/경상남도.*?상가.*?호/g, '') // 경상남도 김해시 번화1로84번길 28 탑스코아상가 306호
          .replace(/부산광역시.*?\d+층/g, '') // 부산광역시 부산진구 가야대로 586 8층
          .replace(/(?:서울|부산|대구|인천|광주|대전|울산|세종|경기도|강원도|충청북도|충청남도|전라북도|전라남도|경상북도|경상남도|제주)(?:특별시|광역시|특별자치시|도|특별자치도)?.*?(?:구|시|군).*?(?:로|길|동).*?(?:\d+호|\d+층|상가|빌딩|센터|타워)/g, '') // 일반 주소 패턴
          
          // 링크 텍스트 껍데기 제거 (범용적 패턴)
          .replace(/함께\s*읽으면\s*좋은\s*글[\s\S]*$/g, '') // "함께 읽으면 좋은 글" 이후 모든 내용 제거
          .replace(/관련\s*포스팅[\s\S]*$/g, '') // "관련 포스팅" 이후 모든 내용 제거
          .replace(/다음\s*글[\s\S]*$/g, '') // "다음 글" 이후 모든 내용 제거
          .replace(/이전\s*글[\s\S]*$/g, '') // "이전 글" 이후 모든 내용 제거
          
          // 네이버 관련 정크 제거
          .replace(/blog\.naver\.com.*$/gm, '') // 네이버 블로그 링크 제거
          .replace(/궁금할\s*땐\s*네이버\s*톡톡하세요!?/g, '') // 네이버 톡톡 문구 제거
          .replace(/톡톡이나\s*번호를\s*통해.*$/gm, '') // 톡톡 관련 문구 제거
          .replace(/톡톡이나\s*번호를\s*통해[\s\S]*?말씀드리겠습니다\.?/g, '') // 톡톡이나 번호를 통해 연락을 주시면 더욱 자세하게 말씀드리겠습니다
          
          // 네이버 지도 관련 텍스트 제거
          .replace(/\d+m\s*©\s*NAVER\s*Corp\.[\s\S]*?국가\]/g, '') // 50m © NAVER Corp. 더보기 /OpenStreetMap 지도 데이터 x © NAVER Corp. /OpenStreetMap 지도 컨트롤러 범례 부동산 거리 읍,면,동 시,군,구 시,도 국가]
          .replace(/©\s*NAVER\s*Corp\.[\s\S]*?OpenStreetMap[\s\S]*?지도[\s\S]*?/g, '') // © NAVER Corp. /OpenStreetMap 지도 관련
          .replace(/지도\s*데이터[\s\S]*?지도\s*컨트롤러[\s\S]*?범례[\s\S]*?부동산[\s\S]*?거리[\s\S]*?읍,면,동[\s\S]*?시,군,구[\s\S]*?시,도[\s\S]*?국가/g, '') // 지도 데이터 컨트롤러 범례 부동산 거리 읍,면,동 시,군,구 시,도 국가
          .replace(/더보기\s*\/OpenStreetMap/g, '') // 더보기 /OpenStreetMap
          .replace(/\d+m\s*©/g, '') // 50m © 패턴
          
          // 범용적 연락처/안내 정보 제거
          .replace(/예약제로\s*운영[\s\S]*?문의[\s\S]*?주세요\.?/g, '') // 예약제 운영 관련 안내
          .replace(/\d+년차.*?대표.*?원장.*?졸업.*?석사.*?/g, '') // 원장 경력 정보
          
          // 기타 정리
          .replace(/안녕하세요\.\s*안녕하세요\./g, '안녕하세요.') // 중복 인사말 제거
          .replace(/예약.*?문의.*?연락.*?주세요[\s\S]*?/g, '') // 예약/문의 관련 안내 제거
          .replace(/[\s\n]*\[\s*\]$/g, '') // 끝에 남은 빈 대괄호 제거
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
        console.log(`🎉 ${type} 최종 결과 - user 길이: ${tagsOnly.length}, assistant 길이: ${contentOnly.length}`);
        console.log(`🔍 ${type} user 내용: ${tagsOnly}`);
        console.log(`🔍 ${type} assistant 내용 미리보기: ${contentOnly.substring(0, 100)}...`);
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