// server.js
require('dotenv').config();

// 환경변수 유효성 검증
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY가 설정되지 않았습니다.');
  process.exit(1);
}

const express = require('express');
const cors    = require('cors');
const path    = require('path');

const { initializeVectorStore, chunks } = require('./vectorStore');
const askRouter  = require('./routes/ask');
const blogRouter = require('./routes/blog');
const chatRouter = require('./routes/chat');

const app = express();
const PORT = process.env.PORT || 3000;

// 1) 공통 미들웨어
const allowedOrigins = process.env.ALLOWED_ORIGINS ? 
  process.env.ALLOWED_ORIGINS.split(',') : 
  ['http://localhost:3000', 'http://localhost:3001'];

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'DELETE', 'PUT', 'PATCH'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

const { globalErrorHandler } = require('./middleware/errorHandler');

// 2) 정적 파일 서빙 (chatgpt-client 폴더)
const clientDir = path.join(__dirname, 'chatgpt-client');
app.use(express.static(clientDir));

// (선택) 루트 경로에서 index.html 제공
app.get('/', (req, res) => {
  res.sendFile(path.join(clientDir, 'index.html'));
});

// 4) API 라우터 연결
app.use('/ask', askRouter);
app.use('/blog', blogRouter);
app.use('/chat', chatRouter);
app.use('/classification', require('./routes/classification'));
app.use('/api/finetune', require('./routes/finetune'));

// RLHF 피드백 엔드포인트
const rlhfManager = require('./lib/rlhfManager');

app.post('/rlhf-feedback', async (req, res) => {
  try {
    const feedbackData = req.body;
    
    
    // 개별 평가 vs 일괄 평가 구분
    let processedFeedback;
    if (feedbackData.type === 'individual_evaluation') {
      // 새로운 개별 평가 형태
      processedFeedback = {
        type: 'individual_evaluation',
        filename: feedbackData.filename,
        category: feedbackData.category,
        classificationScore: feedbackData.classificationScore,
        taggingScore: feedbackData.taggingScore,
        improvement: feedbackData.improvement,
        timestamp: feedbackData.timestamp
      };
    } else {
      // 기존 일괄 평가 형태
      processedFeedback = {
        timestamp: feedbackData.timestamp,
        overallScore: feedbackData.overallScore,
        classificationScores: feedbackData.classificationScores,
        taggingScores: feedbackData.taggingScores
      };
    }
    
    // RLHF 매니저를 통한 피드백 처리 및 성능 개선
    const result = await rlhfManager.processNewFeedback(processedFeedback);
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      error: 'RLHF 피드백 처리 중 오류가 발생했습니다.' 
    });
  }
});

// RLHF 성능 통계 조회 엔드포인트
app.get('/rlhf-stats', (req, res) => {
  try {
    const stats = rlhfManager.getPerformanceStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ 
      error: 'RLHF 통계 조회 중 오류가 발생했습니다.' 
    });
  }
});

// 블로그 추출 및 분류 엔드포인트
app.post('/extract-blog', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL이 필요합니다.'
      });
    }
    
    
    // 블로그 추출 및 분류 실행
    const result = await extractAndClassifyBlog(url);
    
    res.json({
      success: true,
      message: '블로그 추출 및 분류 완료',
      newFiles: result.newFiles || 0,
      categories: result.categories || []
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || '블로그 추출 중 오류가 발생했습니다.'
    });
  }
});

// 블로그 본문 정리 함수 (링크 및 불필요한 요소 제거)
function cleanBlogContent(content) {
  if (!content) return '';
  
  const lines = content.split('\n');
  const cleanedLines = [];
  
  // URL 패턴 정의
  const urlPatterns = [
    /https?:\/\/[^\s]+/gi,
    /www\.[^\s]+/gi,
    /[a-zA-Z0-9.-]+\.(com|net|org|kr|io|me|co\.kr|naver\.com|tistory\.com|youtube\.com|instagram\.com|kakao\.com|google\.com|facebook\.com)[^\s]*/gi
  ];
  
  // 링크 도메인 패턴 (단독 URL 검사용)
  const linkDomains = [
    'naver.me', 'blog.naver.com', 'post.naver.com', 'smartstore.naver.com',
    'youtube.com', 'youtu.be', 'tistory.com', 'instagram.com', 'kakao.com',
    'google.com', 'facebook.com', 'fb.com', 'twitter.com', 'x.com'
  ];
  
  // 먼저 링크가 있는 줄의 인덱스를 찾아서 역방향 제거할 구간 표시
  const toRemove = new Set();
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // 링크 줄을 찾으면 위쪽 줄들도 확인
    if (isStandaloneLinkLine(line, urlPatterns, linkDomains)) {
      toRemove.add(i); // 링크 줄 자체 제거
      
      // 2줄 위가 제목이고 1줄 위가 설명인 경우
      if (i >= 2) {
        const prevLine1 = lines[i - 2].trim();
        const prevLine2 = lines[i - 1].trim();
        if (isLinkPreviewTitle(prevLine1) && isLinkPreviewDescription(prevLine2)) {
          toRemove.add(i - 2);
          toRemove.add(i - 1);
        }
      }
      // 1줄 위가 제목인 경우
      else if (i >= 1) {
        const prevLine = lines[i - 1].trim();
        if (isLinkPreviewTitle(prevLine)) {
          toRemove.add(i - 1);
        }
      }
    }
  }
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // 빈 줄 건너뛰기
    if (!line) continue;
    
    // 이미 제거 대상으로 표시된 줄 건너뛰기
    if (toRemove.has(i)) {
      continue;
    }
    
    // ① 단독 링크 줄 제거
    if (isStandaloneLinkLine(line, urlPatterns, linkDomains)) {
      continue;
    }
    
    // ② 본문 속에 URL이 포함된 줄 삭제
    if (containsUrlInText(line, urlPatterns)) {
      continue;
    }
    
    // ③ 링크 프리뷰 블록 제거 (2~3줄 연속)
    if (isLinkPreviewBlock(lines, i, urlPatterns, linkDomains)) {
      // 링크 프리뷰 블록의 길이만큼 건너뛰기
      const blockLength = getLinkPreviewBlockLength(lines, i, urlPatterns, linkDomains);
      i += blockLength - 1; // -1은 for loop에서 i++가 되므로
      continue;
    }
    
    // ③-1. 단독 링크 프리뷰 제목 제거 (위에서 블록으로 안 잡힌 경우)
    if (isLinkPreviewTitle(line)) {
      continue;
    }
    
    // ④ 네이버 블로그 특유의 불필요한 요소 제거
    if (isNaverBlogJunk(line)) {
      continue;
    }
    
    // ⑤ 광고성 문구 제거
    if (isAdvertisementText(line)) {
      continue;
    }
    
    // 정리된 줄 추가
    cleanedLines.push(line);
  }
  
  return cleanedLines.join('\n').trim();
}

// 단독 링크 줄인지 확인
function isStandaloneLinkLine(line, urlPatterns, linkDomains) {
  // 도메인만 있는 경우 (blog.naver.com 등)
  if (linkDomains.some(domain => line.trim() === domain)) {
    return true;
  }
  
  // URL 패턴으로 전체가 링크인지 확인
  for (const pattern of urlPatterns) {
    if (pattern.test(line)) {
      // 링크가 포함되어 있다면, 전체가 링크인지 확인
      const cleanLine = line.replace(/\s+/g, '');
      if (cleanLine.length > 0 && (
        cleanLine.startsWith('http') || 
        cleanLine.startsWith('www.') ||
        linkDomains.some(domain => cleanLine.includes(domain))
      )) {
        // 링크 외에 의미있는 텍스트가 있는지 확인
        const textWithoutUrls = line.replace(/https?:\/\/[^\s]+/g, '')
                                   .replace(/www\.[^\s]+/g, '')
                                   .replace(/[a-zA-Z0-9.-]+\.(com|net|org|kr|io|me|co\.kr|naver\.com|tistory\.com|youtube\.com|instagram\.com|kakao\.com|google\.com|facebook\.com)[^\s]*/g, '')
                                   .trim();
        if (textWithoutUrls.length < 10) { // 링크 외 텍스트가 10자 미만이면 링크 줄로 간주
          return true;
        }
      }
    }
  }
  
  // 순수 도메인 패턴 추가 체크
  const pureDomainPattern = /^[a-zA-Z0-9.-]+\.(com|net|org|kr|io|me|co\.kr)[\s]*$/;
  if (pureDomainPattern.test(line.trim())) {
    return true;
  }
  
  return false;
}

// 본문에 URL이 포함된 줄인지 확인
function containsUrlInText(line, urlPatterns) {
  // URL 패턴 재초기화 (플래그 문제 해결)
  const patterns = [
    /https?:\/\/[^\s]+/g,
    /www\.[^\s]+/g,
    /[a-zA-Z0-9.-]+\.(com|net|org|kr|io|me|co\.kr|naver\.com|tistory\.com|youtube\.com|instagram\.com|kakao\.com|google\.com|facebook\.com)[^\s]*/g
  ];
  
  for (const pattern of patterns) {
    if (pattern.test(line)) {
      return true;
    }
  }
  return false;
}

// 링크 프리뷰 블록인지 확인 (2~3줄 연속)
function isLinkPreviewBlock(lines, startIndex, urlPatterns, linkDomains) {
  if (startIndex + 1 >= lines.length) return false;
  
  const line1 = lines[startIndex].trim();
  const line2 = lines[startIndex + 1].trim();
  const line3 = startIndex + 2 < lines.length ? lines[startIndex + 2].trim() : '';
  
  // 패턴 1: 제목 + 설명 + URL (3줄) - 순방향
  if (line3) {
    if (
      isLinkPreviewTitle(line1) &&
      isLinkPreviewDescription(line2) &&
      isStandaloneLinkLine(line3, urlPatterns, linkDomains)
    ) {
      return true;
    }
  }
  
  // 패턴 2: 제목 + URL (2줄) - 순방향
  if (
    isLinkPreviewTitle(line1) &&
    isStandaloneLinkLine(line2, urlPatterns, linkDomains)
  ) {
    return true;
  }
  
  // 패턴 3: 역방향 검사 - 현재 줄이 URL이고 위 2줄이 제목+설명인 경우
  if (isStandaloneLinkLine(line1, urlPatterns, linkDomains)) {
    if (startIndex >= 2) {
      const prevLine1 = lines[startIndex - 2].trim(); // 2줄 위
      const prevLine2 = lines[startIndex - 1].trim(); // 1줄 위
      
      if (isLinkPreviewTitle(prevLine1) && isLinkPreviewDescription(prevLine2)) {
        return true; // 이 경우는 특별 처리 필요
      }
    }
    if (startIndex >= 1) {
      const prevLine = lines[startIndex - 1].trim(); // 1줄 위
      if (isLinkPreviewTitle(prevLine)) {
        return true; // 이 경우도 특별 처리 필요
      }
    }
  }
  
  return false;
}

// 링크 프리뷰 블록의 길이 반환
function getLinkPreviewBlockLength(lines, startIndex, urlPatterns, linkDomains) {
  if (startIndex + 2 < lines.length) {
    const line3 = lines[startIndex + 2].trim();
    if (isStandaloneLinkLine(line3, urlPatterns, linkDomains)) {
      return 3; // 3줄 블록
    }
  }
  return 2; // 2줄 블록
}

// 링크 프리뷰 제목인지 확인
function isLinkPreviewTitle(line) {
  // 너무 짧거나 긴 제목은 제외
  if (line.length < 5 || line.length > 100) return false;
  
  // 명확한 링크 프리뷰 제목 패턴
  const linkPreviewPatterns = [
    /^\[.*\]/, // [상담접수], [필독] 등
    /^【.*】/, // 【필독】 등
    /컨설팅|접수|상담|문의/,
    /필독|먼저.*읽/,
  ];
  
  // 특정 패턴의 제목 형태
  const titlePatterns = [
    /^.+\s\|\s.+$/, // "제목 | 사이트명" 형태
    /^.+\s-\s.+$/, // "제목 - 사이트명" 형태
    /^.+:\s.+$/, // "카테고리: 제목" 형태
  ];
  
  return linkPreviewPatterns.some(pattern => pattern.test(line)) ||
         titlePatterns.some(pattern => pattern.test(line));
}

// 링크 프리뷰 설명인지 확인
function isLinkPreviewDescription(line) {
  // 너무 짧거나 긴 설명은 제외
  if (line.length < 10 || line.length > 200) return false;
  
  // 설명글 특징
  const descPatterns = [
    /^.+입니다\.?$/,
    /^.+습니다\.?$/,
    /^.+해보세요\.?$/,
    /^.+확인.+$/,
    /^.+자세히.+$/,
  ];
  
  return descPatterns.some(pattern => pattern.test(line)) || 
         (line.length > 15 && line.length < 150);
}

// 네이버 블로그 특유의 불필요한 요소
function isNaverBlogJunk(line) {
  const junkPatterns = [
    /^궁금할\s?땐\s?네이버\s?톡톡/,
    /^네이버\s?블로그/,
    /^이웃추가$/,
    /^구독하기$/,
    /^좋아요$/,
    /^공감\d+$/,
    /^댓글\d+$/,
    /^조회\s?\d+$/,
    /^이 글이 좋으셨다면/,
    /^더보기$/,
    /^접기$/,
    /^\[출처\]/,
    /^\[원문\]/,
    /^출처\s?:/,
    /^원문\s?:/,
    /^사진\s?출처/,
    /^이미지\s?출처/,
    /blog\.naver\.com/,
    /post\.naver\.com/,
    /smartstore\.naver\.com/,
    /^m\.blog\.naver\.com/,
    /^naver\.me/,
    // 범용적 패턴만 유지
    /\[후기\]$/, // 블로그 포스트 제목 끝의 [후기]
    /\[사연\]$/, // 블로그 포스트 제목 끝의 [사연]
    /\[노하우\]$/, // 블로그 포스트 제목 끝의 [노하우]
    /\[리뷰\]$/, // 블로그 포스트 제목 끝의 [리뷰]
    /\[추천\]$/, // 블로그 포스트 제목 끝의 [추천]
    /\[정보\]$/, // 블로그 포스트 제목 끝의 [정보]
  ];
  
  return junkPatterns.some(pattern => pattern.test(line));
}

// 광고성 문구 확인
function isAdvertisementText(line) {
  const adPatterns = [
    /할인|특가|이벤트|쿠폰|적립|무료배송/,
    /구매하기|주문하기|장바구니|바로가기/,
    /^AD$|^광고$|^협찬$/,
    /협찬.*받았|제공.*받았|협업/,
    /구매링크|상품링크|제품링크/,
  ];
  
  return adPatterns.some(pattern => pattern.test(line));
}

// 분류 파일 저장 헬퍼 함수
async function saveClassificationFile(category, prefix, classification, content) {
  const fs = require('fs');
  const path = require('path');
  
  try {
    const categoryDir = path.join(__dirname, 'auto_classified', category);
    
    if (!fs.existsSync(categoryDir)) {
      fs.mkdirSync(categoryDir, { recursive: true });
    }
    
    const existingFiles = fs.readdirSync(categoryDir).filter(f => f.endsWith('.txt'));
    const nextIndex = existingFiles.length + 1;
    const filename = prefix + String(nextIndex).padStart(3, '0') + '.txt';
    
    // firstparagraph와 closing에 정리 로직 적용
    let cleanedContent = content;
    if (category === 'firstparagraph' || category === 'closing') {
      console.log(`🔧 ${category} 정리 로직 적용 시작...`);
      console.log(`🔧 정리 전 길이: ${content.length}`);
      
      cleanedContent = content
        .replace(/​+/g, '') // 네이버 특수문자 제거
        .replace(/https?:\/\/[^\s]+/g, '') // URL 제거
        .replace(/\b(?:010|1544|02|051|053|032|062|042|052|044)[-\s]?\d{3,4}[-\s]?\d{4}\b/g, '') // 전화번호 제거
        .replace(/\S+@\S+\.\S+/g, '') // 이메일 제거
        
        // 주소 제거
        .replace(/경상남도.*?상가.*?호/g, '')
        .replace(/부산광역시.*?\d+층/g, '')
        .replace(/(?:서울|부산|대구|인천|광주|대전|울산|세종|경기도|강원도|충청북도|충청남도|전라북도|전라남도|경상북도|경상남도|제주)(?:특별시|광역시|특별자치시|도|특별자치도)?.*?(?:구|시|군).*?(?:로|길|동).*?(?:\d+호|\d+층|상가|빌딩|센터|타워)/g, '')
        
        // 링크 텍스트 껍데기 제거
        .replace(/함께\s*읽으면\s*좋은\s*글[\s\S]*$/g, '')
        
        // 네이버 지도 관련 텍스트 제거
        .replace(/\d+m\s*©\s*NAVER\s*Corp\.[\s\S]*?국가\]/g, '') // 50m © NAVER Corp. 더보기 /OpenStreetMap 지도 데이터 x © NAVER Corp. /OpenStreetMap 지도 컨트롤러 범례 부동산 거리 읍,면,동 시,군,구 시,도 국가]
        .replace(/©\s*NAVER\s*Corp\.[\s\S]*?OpenStreetMap[\s\S]*?지도[\s\S]*?/g, '') // © NAVER Corp. /OpenStreetMap 지도 관련
        .replace(/지도\s*데이터[\s\S]*?지도\s*컨트롤러[\s\S]*?범례[\s\S]*?부동산[\s\S]*?거리[\s\S]*?읍,면,동[\s\S]*?시,군,구[\s\S]*?시,도[\s\S]*?국가/g, '') // 지도 데이터 컨트롤러 범례 부동산 거리 읍,면,동 시,군,구 시,도 국가
        .replace(/더보기\s*\/OpenStreetMap/g, '') // 더보기 /OpenStreetMap
        .replace(/\d+m\s*©/g, '') // 50m © 패턴
        
        // 범용적 연락처/예약 제거
        .replace(/예약제로\s*운영[\s\S]*?(전화|문의|예약)[\s\S]*?말씀드리겠습니다\.?/g, '')
        .replace(/톡톡이나\s*전화[\s\S]*?문의[\s\S]*?주세요\.?/g, '')
        .replace(/예약.*?문의.*?전화.*?카카오톡톡.*?부탁드려요\.?/g, '')
        
        // 기타 정리  
        .replace(/[\s\n]*\[\s*\]$/g, '') // 끝에 남은 빈 대괄호 제거
        .replace(/\n\s*\n\s*\n+/g, '\n\n')
        .trim();
      
      console.log(`🔧 정리 후 길이: ${cleanedContent.length}`);
    }
    
    const fileContent = `===user===
${classification}
===assistant===
${cleanedContent}`;
    
    const filePath = path.join(categoryDir, filename);
    fs.writeFileSync(filePath, fileContent, 'utf8');
    
    console.log(`✅ ${category} 저장됨: ${filename}`);
    return true;
  } catch (error) {
    console.error(`❌ ${category} 파일 저장 오류:`, error.message);
    return false;
  }
}

// 블로그 추출 및 분류 함수 (Puppeteer 기반)
async function extractAndClassifyBlog(url) {
  const AutoClassificationManager = require('./lib/autoClassificationManager');
  const fs = require('fs');
  const path = require('path');
  
  console.log('📥 블로그 내용 추출 시작...');
  
  // 스코프 문제 해결을 위한 변수 선언
  let cleanTitle = '';
  let blogContent = '';
  
  // 추출 방법 체인 설정
  const extractionChain = url.includes('blog.naver.com') ? [
    { name: 'Puppeteer', method: () => extractWithPuppeteer(url) },
    { name: 'Mobile', method: () => extractWithFetch(url.replace('blog.naver.com', 'm.blog.naver.com')) },
    { name: 'Fetch Fallback', method: () => extractWithFetch(url) }
  ] : [
    { name: 'Fetch', method: () => extractWithFetch(url) }
  ];
  
  try {
    // 순차적 추출 시도
    for (const { name, method } of extractionChain) {
      try {
        console.log(`🔧 ${name} 시도...`);
        const result = await method();
        if (result && result.content && result.content.trim().length >= 50) {
          console.log(`✅ ${name} 성공 (${result.content.length}자)`);
          blogContent = result.content;
          cleanTitle = result.title || '';
          break;
        }
      } catch (error) {
        console.log(`⚠️ ${name} 실패: ${error.message}`);
      }
    }
    
    // 추출된 내용 검증
    if (!blogContent || blogContent.trim().length < 50) {
      throw new Error('추출된 블로그 내용이 너무 짧습니다.');
    }
    
    // 링크 및 불필요한 요소 제거 (개선된 필터링)
    blogContent = cleanBlogContent(blogContent);
    console.log(`✅ 블로그 내용 추출 완료 (${blogContent.length}자)`);
    
    // iframe에서 추출한 제목을 그대로 사용 (이미 cleanTitle로 정리됨)
    // 블로그 내용은 본문으로만 사용
    const lines = blogContent.split('\n').filter(line => line.trim().length > 0);
    let bodyContent = lines.join('\n').trim();
    
    console.log(`📝 제목 추출 완료: "${cleanTitle}" (${cleanTitle.length}자)`);
    
    const classifier = new AutoClassificationManager();
    let newFiles = 0;
    const processedCategories = [];
    
    // 분류 작업 정의
    const classificationTasks = [
      {
        name: 'title',
        condition: () => cleanTitle.length > 5,
        content: () => cleanTitle,
        prefix: 'ti_'
      },
      {
        name: 'firstparagraph', 
        condition: () => bodyContent.length > 50,
        content: () => bodyContent.substring(0, Math.min(1000, bodyContent.length)),
        prefix: 'fp_'
      },
      {
        name: 'closing',
        condition: () => bodyContent.length > 100,
        content: () => bodyContent.substring(Math.max(0, bodyContent.length - 800)),
        prefix: 'cl_'
      }
    ];
    
    // 분류 작업 실행
    for (const task of classificationTasks) {
      if (task.condition()) {
        try {
          console.log(`🎯 ${task.name} 분류 시작...`);
          const content = task.content();
          const result = await classifier.classifyContent(task.name, content);
          
          if (result) {
            const success = await saveClassificationFile(task.name, task.prefix, result, content);
            if (success) {
              newFiles++;
              processedCategories.push(task.name);
            }
          }
        } catch (error) {
          console.error(`❌ ${task.name} 분류 오류:`, error.message);
        }
      }
    }
    
    
    return {
      newFiles,
      categories: processedCategories
    };
    
  } catch (error) {
    console.error('❌ 블로그 추출 실패:', error.message);
    throw new Error(`블로그 추출 실패: ${error.message}`);
  }
}

// 네이버 블로그 직접 추출 함수
// Puppeteer를 사용한 네이버 블로그 추출 (Python selenium 코드와 동일한 방식)
async function extractWithPuppeteer(url) {
  let browser = null;
  
  try {
    console.log('🤖 Puppeteer 추출 시도 (Python 방식)...');
    
    const puppeteer = require('puppeteer');
    browser = await puppeteer.launch({ 
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--no-first-run',
        '--disable-default-apps'
      ]
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 720 });
    
    // 1. Navigate to the Naver blog URL
    console.log('📍 네이버 블로그 URL로 이동 중...');
    await page.goto(url, { 
      waitUntil: 'domcontentloaded', 
      timeout: 20000 
    });
    
    // 2. Wait for page to load (5 seconds like in Python code)
    console.log('⏳ 페이지 로딩 대기 (5초)...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 3. Find iframe with id="mainFrame" specifically
    console.log('🔍 mainFrame iframe 검색 중...');
    const mainFrameElement = await page.$('#mainFrame');
    
    if (!mainFrameElement) {
      throw new Error('mainFrame iframe을 찾을 수 없습니다');
    }
    
    console.log('✅ mainFrame iframe 발견');
    
    // 4. Switch to that iframe
    const mainFrame = await mainFrameElement.contentFrame();
    if (!mainFrame) {
      throw new Error('mainFrame iframe으로 전환할 수 없습니다');
    }
    
    console.log('🔄 mainFrame iframe으로 전환 완료');
    
    // 5. Extract content using "div.se-main-container" selector (same as Python)
    console.log('📄 div.se-main-container에서 콘텐츠 추출 중...');
    const content = await mainFrame.evaluate(() => {
      const container = document.querySelector('div.se-main-container');
      if (!container) {
        return null;
      }
      
      // Get raw HTML content
      return container.innerHTML;
    });
    
    if (!content) {
      throw new Error('div.se-main-container를 찾을 수 없습니다');
    }
    
    // 6. Clean the HTML tags and text like in the Python code
    console.log('🧹 HTML 태그 정리 및 텍스트 클리닝 중...');
    
    // Remove script and style tags
    let cleanContent = content
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '');
    
    // Convert HTML to text (similar to Python's approach)
    cleanContent = cleanContent
      .replace(/<br\s*\/?>/gi, '\n')           // Convert <br> to newlines
      .replace(/<\/p>/gi, '\n\n')              // Convert </p> to double newlines
      .replace(/<\/div>/gi, '\n')              // Convert </div> to newlines
      .replace(/<\/h[1-6]>/gi, '\n\n')         // Convert heading endings to double newlines
      .replace(/<[^>]*>/g, ' ')                // Remove all remaining HTML tags
      .replace(/&nbsp;/g, ' ')                 // Convert &nbsp; to space
      .replace(/&amp;/g, '&')                  // Convert HTML entities
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&[a-zA-Z0-9#]+;/g, ' ')        // Remove other HTML entities
      .replace(/\s*\n\s*/g, '\n')              // Clean up whitespace around newlines
      .replace(/\n{3,}/g, '\n\n')              // Replace multiple newlines with double newlines
      .replace(/[ \t]+/g, ' ')                 // Replace multiple spaces with single space
      .trim();                                 // Remove leading/trailing whitespace
    
    // iframe 전환 후 페이지 소스에서 제목 추출 (Python 코드 방식)
    // iframe 전환 후 전체 HTML 소스 가져오기
    const iframeSource = await mainFrame.content();
    let title = '';
    
    // 1. HTML title 태그에서 추출
    const titleMatch = iframeSource.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (titleMatch) {
      const htmlTitle = titleMatch[1].trim();
      
      // 네이버 블로그 제목 형식 처리
      if (htmlTitle.includes(' : ')) {
        title = htmlTitle.split(' : ')[0].trim();
      } else if (htmlTitle.includes(' | ')) {
        title = htmlTitle.split(' | ')[0].trim();
      } else {
        title = htmlTitle;
      }
    }
    
    // 2. iframe 내 DOM에서 제목 요소 찾기 (fallback)
    if (!title || title.length < 10) {
      console.log('🔄 DOM에서 제목 요소 찾기...');
      title = await mainFrame.evaluate(() => {
        // 제목 요소들 우선순위 순으로 검색
        const titleSelectors = [
          '.se-title-text',
          '.se-text-paragraph:first-of-type',
          'h1',
          '.se-text-paragraph[data-se-type="text"]',
          '.se-module-text .se-text-paragraph'
        ];
        
        for (const selector of titleSelectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent.trim().length > 10) {
            console.log(`✅ DOM에서 제목 발견 (${selector}): "${element.textContent.trim()}"`);
            return element.textContent.trim();
          }
        }
        
        return '';
      });
    }
    
    
    console.log(`🔍 추출된 원본 제목: "${title}" (${title.length}자)`);
    
    let cleanTitle = title.trim();
    console.log(`🔍 정리 전 제목: "${cleanTitle}" (${cleanTitle.length}자)`);
    
    if (cleanTitle.includes(' : ')) {
      const before = cleanTitle;
      cleanTitle = cleanTitle.split(' : ')[0].trim();
      console.log(`🔧 ' : ' 분리: "${before}" → "${cleanTitle}"`);
    }
    if (cleanTitle.includes(' | ')) {
      const before = cleanTitle;
      cleanTitle = cleanTitle.split(' | ')[0].trim();
      console.log(`🔧 ' | ' 분리: "${before}" → "${cleanTitle}"`);
    }
    if (cleanTitle.includes(' - ')) {
      const before = cleanTitle;
      cleanTitle = cleanTitle.split(' - ')[0].trim();
      console.log(`🔧 ' - ' 분리: "${before}" → "${cleanTitle}"`);
    }
    
    console.log(`🔍 정리 후 제목: "${cleanTitle}" (${cleanTitle.length}자)`);
    
    // 7. Return the cleaned content
    let result = (cleanTitle ? cleanTitle + '\n\n' : '') + cleanContent;
    
    // 추가 정리 (기본적인 정크 제거)
    result = result
      .replace(/궁금할\s?땐\s?네이버\s?톡톡[^\n]*/gi, '')
      .replace(/^(공감|댓글|조회)\s?\d+$/gm, '')
      .replace(/^(좋아요|구독하기|이웃추가)$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    
    if (result.length > 50) {
      console.log(`✅ Puppeteer 추출 성공 (${result.length}자)`);
      return {
        title: cleanTitle,
        content: result
      };
    } else {
      throw new Error('추출된 컨텐츠가 충분하지 않습니다');
    }
    
  } catch (puppeteerError) {
    console.error(`❌ Puppeteer 오류:`, puppeteerError.message);
    
    // Fallback to fetch method
    console.log('🔄 Puppeteer 실패로 인한 Fetch 대체 시도');
    return await extractWithFetch(url);
    
  } finally {
    // 브라우저 정리
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error('⚠️ 브라우저 종료 오류:', closeError.message);
      }
    }
  }
}

// Fetch를 사용한 일반 웹사이트 추출 (네이버 블로그 fallback 강화)
async function extractWithFetch(url) {
  console.log('🌐 Fetch 추출 시도...');
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.8,en-US;q=0.5,en;q=0.3',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    }
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  const html = await response.text();
  
  // 제목 추출 (다양한 패턴 지원)
  const titlePatterns = [
    /<title[^>]*>([^<]*)<\/title>/i,
    /<meta[^>]*property="og:title"[^>]*content="([^"]*)"[^>]*>/i,
    /<meta[^>]*name="title"[^>]*content="([^"]*)"[^>]*>/i,
    /<h1[^>]*class="[^"]*title[^"]*"[^>]*>([^<]*)<\/h1>/i,
    /<h1[^>]*>([^<]*)<\/h1>/i
  ];
  
  let title = '';
  for (const pattern of titlePatterns) {
    const match = html.match(pattern);
    if (match && match[1] && match[1].trim()) {
      title = match[1].trim();
      break;
    }
  }
  
  // 제목 정리 (사이트명, 카테고리 제거)
  if (title) {
    const separators = [' - ', ' | ', ' :: ', ' : ', ' › ', ' » '];
    for (const sep of separators) {
      if (title.includes(sep)) {
        title = title.split(sep)[0].trim();
        break;
      }
    }
    // HTML 엔티티 디코딩
    title = title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'");
  }
  
  // 네이버 블로그 특화 본문 추출 패턴 (우선순위 순)
  const naverBlogPatterns = [
    // 새로운 네이버 블로그 에디터
    /<div[^>]*class="[^"]*se-main-container[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*se-component[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /<div[^>]*class="[^"]*se-text[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    // 구 에디터
    /<div[^>]*class="[^"]*postViewArea[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*post_ct[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*id="[^"]*postViewArea[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    // iframe 내부 콘텐츠 (네이버 블로그)
    /<iframe[^>]*src="[^"]*postView[^"]*"[^>]*>([\s\S]*?)<\/iframe>/i
  ];
  
  // 일반 웹사이트 본문 추출 패턴
  const generalContentPatterns = [
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*post[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*entry[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*id="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<section[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/section>/i
  ];
  
  let content = '';
  let extractedParts = [];
  
  // 네이버 블로그인 경우 특화 패턴 우선 적용
  const isNaverBlog = url.includes('blog.naver.com');
  const patterns = isNaverBlog ? [...naverBlogPatterns, ...generalContentPatterns] : generalContentPatterns;
  
  // 패턴별 추출 시도
  for (const pattern of patterns) {
    const isGlobalPattern = pattern.flags && pattern.flags.includes('g');
    
    if (isGlobalPattern) {
      // 전역 매칭 (여러 부분 추출)
      let match;
      while ((match = pattern.exec(html)) !== null) {
        if (match[1] && match[1].trim().length > 30) {
          extractedParts.push(match[1]);
        }
      }
    } else {
      // 단일 매칭
      const match = html.match(pattern);
      if (match && match[1] && match[1].trim().length > 100) {
        content = match[1];
        break;
      }
    }
  }
  
  // 전역 매칭으로 수집된 부분들 조합
  if (!content && extractedParts.length > 0) {
    content = extractedParts.join('\n\n');
  }
  
  // 추가 fallback: 본문이 없으면 전체 body 내용 분석
  if (!content || content.trim().length < 100) {
    console.log('⚠️ 기본 패턴 실패, 고급 분석 시도...');
    
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      let bodyContent = bodyMatch[1];
      
      // 불필요한 대형 블록 제거
      bodyContent = bodyContent
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[\s\S]*?<\/nav>/gi, '')
        .replace(/<header[\s\S]*?<\/header>/gi, '')
        .replace(/<footer[\s\S]*?<\/footer>/gi, '')
        .replace(/<aside[\s\S]*?<\/aside>/gi, '')
        .replace(/<div[^>]*class="[^"]*(?:sidebar|menu|navigation|ad|banner|social)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');
      
      // 텍스트 밀도가 높은 div 찾기
      const divMatches = bodyContent.match(/<div[^>]*>([\s\S]*?)<\/div>/gi) || [];
      let bestDiv = '';
      let maxTextLength = 0;
      
      for (const divMatch of divMatches) {
        const cleanText = divMatch.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        if (cleanText.length > maxTextLength && cleanText.length > 200) {
          maxTextLength = cleanText.length;
          bestDiv = divMatch;
        }
      }
      
      if (bestDiv) {
        content = bestDiv;
      }
    }
  }
  
  if (content && content.trim()) {
    // 콘텐츠 정리 및 최적화
    content = content
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[\s\S]*?<\/aside>/gi, '')
      .replace(/<form[\s\S]*?<\/form>/gi, '')
      .replace(/<div[^>]*class="[^"]*(?:ad|advertisement|banner|social|share|comment)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    
    // HTML 태그 제거 및 텍스트 정리
    const cleanContent = content
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&[a-zA-Z0-9#]+;/g, ' ')
      .replace(/\s*\n\s*/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim();
    
    // 최소 길이 검증
    if (cleanContent.length > 50) {
      let result = (title ? title + '\n\n' : '') + cleanContent;
      
      // 기본적인 정크 제거
      result = result
        .replace(/궁금할\s?땐\s?네이버\s?톡톡[^\n]*/gi, '')
        .replace(/^(공감|댓글|조회)\s?\d+$/gm, '')
        .replace(/^(좋아요|구독하기|이웃추가)$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      
      console.log(`✅ Fetch 추출 성공 (${result.length}자)`);
      
      // 적절한 길이로 자르기 (네이버 블로그는 더 긴 텍스트 허용)
      const maxLength = url.includes('blog.naver.com') ? 4000 : 2000;
      if (result.length > maxLength) {
        const halfLength = Math.floor(maxLength / 2);
        return result.substring(0, halfLength) + '\n\n...[중략]...\n\n' + result.substring(result.length - halfLength);
      }
      
      return result;
    }
  }
  
  // 마지막 fallback: 메타 description 사용
  const descMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i) ||
                   html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"[^>]*>/i);
  
  if (descMatch && descMatch[1] && descMatch[1].trim().length > 30) {
    const desc = descMatch[1].trim().replace(/&[a-zA-Z0-9#]+;/g, ' ');
    const result = (title ? title + '\n\n' : '') + desc;
    console.log(`⚠️ Fallback: 메타 설명 사용 (${result.length}자)`);
    return result;
  }
  
  throw new Error('충분한 텍스트를 추출할 수 없습니다. 페이지 구조가 복잡하거나 동적 콘텐츠일 수 있습니다.');
}

// 시스템 상태 체크 엔드포인트 (디버깅용)
app.get('/debug/system-status', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    const status = {
      server: {
        status: 'running',
        timestamp: new Date().toISOString(),
        node_version: process.version,
        uptime: process.uptime()
      },
      directories: {
        auto_classified: fs.existsSync('./auto_classified'),
        claude_approved: fs.existsSync('./claude_approved'),
        training_data: fs.existsSync('./training_data'),
        deleted_files: fs.existsSync('./deleted_files'),
        negative_training: fs.existsSync('./negative_training')
      },
      files: {
        rlhf_feedback: fs.existsSync('./rlhf_feedback.jsonl'),
        latest_model: fs.existsSync('./latest_model.txt')
      },
      routes: {
        ask: true,
        blog: true,
        chat: true,
        classification: true
      }
    };
    
    // 각 카테고리별 파일 수 확인
    const categories = ['title', 'firstparagraph', 'closing', 'story', 'usp'];
    status.file_counts = {};
    
    categories.forEach(category => {
      const categoryPath = `./auto_classified/${category}`;
      if (fs.existsSync(categoryPath)) {
        const files = fs.readdirSync(categoryPath).filter(f => f.endsWith('.txt'));
        status.file_counts[category] = files.length;
      } else {
        status.file_counts[category] = 0;
      }
    });
    
    console.log('🔍 시스템 상태 체크 요청:', req.ip);
    res.json(status);
    
  } catch (error) {
    console.error('❌ 시스템 상태 체크 오류:', error);
    res.status(500).json({
      error: '시스템 상태 체크 중 오류가 발생했습니다.',
      details: error.message
    });
  }
});

// 5) 글로벌 에러 핸들러
app.use(globalErrorHandler);

// 5) 벡터 스토어 초기화 후 서버 기동
(async () => {
  console.log('➡️ [vectorStore] initializing...');
  try {
    await initializeVectorStore(process.env.OPENAI_API_KEY);
    console.log(`✅ [vectorStore] ready with ${chunks.length} chunks`);
    
    const server = app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('🔄 SIGTERM received, shutting down gracefully');
      server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
      });
    });
    
    process.on('SIGINT', () => {
      console.log('🔄 SIGINT received, shutting down gracefully');
      server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
      });
    });
    
  } catch (e) {
    console.error('🔥 [vectorStore] initialization failed:', e);
    console.error('🔄 Shutting down server due to initialization failure');
    process.exit(1);
  }
})();
