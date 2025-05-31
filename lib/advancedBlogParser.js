const axios = require('axios');
const cheerio = require('cheerio');

class AdvancedBlogParser {
  constructor() {
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    this.naverClientId = process.env.NAVER_CLIENT_ID;
    this.naverClientSecret = process.env.NAVER_CLIENT_SECRET;
    
    if (this.naverClientId && this.naverClientSecret) {
      console.log('✅ [AdvancedParser] Naver API credentials loaded');
    } else {
      console.warn('⚠️ [AdvancedParser] Naver API credentials not found');
    }
  }

  /**
   * 네이버 블로그 URL을 Java 코드 방식으로 변환
   * PostView.naver 형태로 접근하여 더 안정적인 추출
   */
  convertToDirectUrl(url) {
    try {
      // Java 코드 패턴: PostView.naver?blogId=username&logNo=postId
      const match = url.match(/blog\.naver\.com\/([^\/]+)\/(\d+)/);
      if (match) {
        const [, blogId, postId] = match;
        
        // Java 코드와 동일한 URL 구조 사용
        const postViewUrl = `http://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${postId}`;
        console.log(`🔄 [AdvancedParser] Using PostView.naver format: ${postViewUrl}`);
        return postViewUrl;
      }

      // 이미 PostView.naver 형태인 경우
      if (url.includes('PostView.naver')) {
        return url;
      }

      // 패턴 매치 실패 시 원본 URL 반환
      console.warn(`⚠️ [AdvancedParser] Could not parse URL pattern: ${url}`);
      return url;
    } catch (error) {
      console.warn(`⚠️ [AdvancedParser] URL conversion failed: ${error.message}`);
      return url;
    }
  }

  /**
   * Java 코드의 postId 추출 로직을 JavaScript로 구현
   */
  extractPostIdFromUrl(url) {
    try {
      const splits = url.split('/');
      const postId = splits[splits.length - 1];
      return postId;
    } catch (error) {
      console.warn(`⚠️ [AdvancedParser] PostId extraction failed: ${error.message}`);
      return null;
    }
  }

  /**
   * 네이버 블로그 URL에서 순수 콘텐츠 추출
   * Python BeautifulSoup 방식을 Node.js로 구현
   */
  async extractNaverBlogContent(url) {
    try {
      console.log(`📖 [AdvancedParser] Parsing: ${url}`);
      
      // Java 코드 방식으로 URL 변환
      const directUrl = this.convertToDirectUrl(url);
      const originalPostId = this.extractPostIdFromUrl(url);
      console.log(`🔄 [AdvancedParser] PostID: ${originalPostId}, Direct URL: ${directUrl}`);
      
      // HTTP 요청으로 페이지 가져오기
      const response = await axios.get(directUrl, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Referer': 'https://blog.naver.com',
        },
        timeout: 15000,
        maxRedirects: 5
      });

      const $ = cheerio.load(response.data);
      
      // 1. 제목 추출
      let title = this.extractTitle($);
      
      // 2. Java 코드의 정확한 셀렉터 패턴 적용
      const javaSelectors = originalPostId ? [
        `#post-view${originalPostId} > div > div > div.se-main-container`,  // Java 코드 1순위
        `#post-view${originalPostId} > div > div.se-main-container`,        // Java 코드 2순위
        `#post-view${originalPostId} .se-main-container`,                   // 간소화 버전
        `#post-view .se-main-container`,                                    // postId 없는 버전
        'div.se-main-container'                                             // 일반 버전
      ] : [
        'div.se-main-container',
        '#post-view .se-main-container',
        '.se-main-container'
      ];

      // 3. 추가 대체 셀렉터들
      const fallbackSelectors = [
        '.post_ct',               // 모바일 버전
        '.post-view',             // 일반적인 패턴
        '#post-view',             // ID 버전
        '.blog-content',          // 대체 패턴
        'article',                // HTML5 시맨틱
        '.entry-content'          // 워드프레스 스타일
      ];

      const contentSelectors = [...javaSelectors, ...fallbackSelectors];

      let mainContainer = null;
      let usedSelector = '';

      for (const selector of contentSelectors) {
        mainContainer = $(selector).first();
        if (mainContainer.length > 0) {
          usedSelector = selector;
          console.log(`✅ [AdvancedParser] Found content with: ${selector}`);
          break;
        }
      }
      
      if (!mainContainer || mainContainer.length === 0) {
        console.warn('⚠️ No content container found, trying alternative extraction');
        return this.tryAlternativeSelectors($, directUrl);
      }

      // 3. Java 코드 방식으로 텍스트 추출 (item.text() 패턴)
      const contentElements = [];
      let rawText = '';

      // Java 코드와 동일하게 mainContainer에서 모든 텍스트 추출
      if (mainContainer && mainContainer.length > 0) {
        rawText = mainContainer.text().trim();
        console.log(`📝 [AdvancedParser] Raw text length: ${rawText.length}`);
        
        // 추가로 구조화된 요소들도 수집 (BeautifulSoup 방식 보완)
        mainContainer.find('p, div, span, img, h1, h2, h3, h4, h5, h6').each((index, element) => {
          const tagContent = this.tagHelper($, element);
          if (tagContent && tagContent.trim() && tagContent.length > 3) {
            contentElements.push(tagContent.trim());
          }
        });
      }

      // 4. 결과 정리 (Java 코드 우선, BeautifulSoup 방식 보조)
      let finalContent = '';
      
      if (rawText && rawText.length > 100) {
        // Java 방식 성공: 원시 텍스트 사용
        finalContent = this.cleanJavaExtractedText(rawText);
        console.log(`✅ [AdvancedParser] Using Java-style extraction (${finalContent.length} chars)`);
      } else if (contentElements.length > 0) {
        // BeautifulSoup 방식 fallback: 구조화된 요소 사용
        finalContent = this.cleanAndStructureContent(contentElements);
        console.log(`✅ [AdvancedParser] Using BeautifulSoup-style extraction (${finalContent.length} chars)`);
      } else {
        throw new Error('No content could be extracted');
      }
      
      return {
        title: title || 'Unknown Title',
        content: finalContent,
        url: url,
        method: usedSelector.includes('post-view') ? 'Java-style PostView' : 'BeautifulSoup-style',
        elementsFound: contentElements.length || 1,
        postId: originalPostId,
        selector: usedSelector
      };

    } catch (error) {
      console.error(`❌ [AdvancedParser] Error parsing ${url}:`, error.message);
      return {
        title: 'Parsing Failed',
        content: '',
        url: url,
        error: error.message
      };
    }
  }

  /**
   * Python의 tag_helper 함수를 JavaScript로 구현 (향상된 버전)
   */
  tagHelper($, element) {
    const tagName = element.tagName?.toLowerCase();
    
    if (tagName === 'img') {
      // img 태그 - 이미지 표시
      const alt = $(element).attr('alt') || '';
      const src = $(element).attr('src') || '';
      return `[IMG${alt ? ': ' + alt : ''}]`;
    } else if (['p', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
      // 텍스트 컨테이너 태그들 - 텍스트 추출
      let text = $(element).text().trim();
      
      // 빈 텍스트나 너무 짧은 텍스트 제외
      if (!text || text.length < 3) {
        return '';
      }
      
      // 네이버 블로그 특수 문자 정리
      text = text
        .replace(/​/g, '')  // 네이버 특수 문자
        .replace(/\s+/g, ' ')  // 연속 공백 정리
        .trim();

      // 광고나 네비게이션 텍스트 필터링
      const skipPatterns = [
        /^(공감|댓글|조회|좋아요|구독|이웃추가)\s*\d*$/,
        /^(이전글|다음글|목록)$/,
        /^(카테고리|태그)$/,
        /궁금할\s?땐\s?네이버\s?톡톡/,
        /blog\.naver\.com/,
        /^\d+\.\d+\.\d+$/  // 날짜 패턴
      ];
      
      for (const pattern of skipPatterns) {
        if (pattern.test(text)) {
          return '';
        }
      }
      
      return text;
    } else {
      return '';
    }
  }

  /**
   * 제목 추출 (Python 코드에 추가하여 개선)
   */
  extractTitle($) {
    // 네이버 블로그 제목 추출 방법들 (모바일 포함)
    const titleSelectors = [
      'title',                    // HTML title
      '.se-title-text',          // 데스크톱 네이버 블로그
      '.se-title',               // 대체 데스크톱 패턴
      '.post_tit',               // 모바일 네이버 블로그
      '.post-title',             // 일반 블로그
      '.blog-title',             // 블로그 제목
      'h1',                      // 메인 헤딩
      '.entry-title',            // 워드프레스 스타일
      '[data-post-title]'        // 데이터 속성
    ];

    for (const selector of titleSelectors) {
      const titleElement = $(selector).first();
      if (titleElement.length > 0) {
        let title = titleElement.text().trim();
        
        // 네이버 블로그 특유의 형식 정리
        title = title
          .replace(/\s*:\s*네이버 블로그$/, '')
          .replace(/\s*\|\s*네이버 블로그$/, '')
          .replace(/\s*-\s*네이버 블로그$/, '')
          .trim();
          
        if (title && title.length > 0) {
          return title;
        }
      }
    }
    
    return null;
  }

  /**
   * 대체 셀렉터 시도 (메인 컨테이너를 찾을 수 없는 경우)
   */
  tryAlternativeSelectors($, url) {
    console.log('🔍 [AdvancedParser] Trying alternative extraction methods...');
    
    // 1. 전체 body에서 텍스트 추출 시도
    const bodyText = $('body').text().trim();
    if (bodyText && bodyText.length > 100) {
      console.log('✅ [AdvancedParser] Extracted from body text');
      
      // 기본적인 정리
      const cleanedText = bodyText
        .replace(/\s+/g, ' ')
        .substring(0, 2000)  // 처음 2000자만
        .trim();
        
      return {
        title: this.extractTitle($) || 'Body Text Extraction',
        content: cleanedText,
        url: url,
        method: 'Body text extraction',
        elementsFound: 1
      };
    }

    // 2. 모든 p 태그에서 추출 시도
    const allParagraphs = [];
    $('p').each((index, element) => {
      const text = $(element).text().trim();
      if (text && text.length > 10) {
        allParagraphs.push(text);
      }
    });

    if (allParagraphs.length > 0) {
      console.log(`✅ [AdvancedParser] Extracted ${allParagraphs.length} paragraphs`);
      return {
        title: this.extractTitle($) || 'Paragraph Extraction',
        content: allParagraphs.join('\n\n'),
        url: url,
        method: 'Paragraph extraction',
        elementsFound: allParagraphs.length
      };
    }

    // 3. 최후의 대안 - 사용할 수 있는 모든 텍스트
    const alternativeSelectors = [
      '.se-main-container',
      '.post-view',
      '.blog-content',
      '.entry-content',
      '#postViewArea',
      '.se-component',
      'main',
      'article',
      '.content'
    ];

    for (const selector of alternativeSelectors) {
      const container = $(selector).first();
      if (container.length > 0) {
        console.log(`✅ [AdvancedParser] Found content with: ${selector}`);
        
        const contentElements = [];
        container.find('img, p, div').each((index, element) => {
          const tagContent = this.tagHelper($, element);
          if (tagContent && tagContent.trim()) {
            contentElements.push(tagContent.trim());
          }
        });

        if (contentElements.length > 0) {
          return {
            title: this.extractTitle($) || 'Alternative Extraction',
            content: this.cleanAndStructureContent(contentElements),
            url: url,
            method: `Alternative: ${selector}`,
            elementsFound: contentElements.length
          };
        }
      }
    }

    // 모든 방법 실패
    console.warn('⚠️ [AdvancedParser] All selectors failed');
    return {
      title: 'Extraction Failed',
      content: $('body').text().substring(0, 1000) + '...',
      url: url,
      method: 'Fallback body text',
      elementsFound: 0
    };
  }

  /**
   * Java 코드 방식으로 추출된 원시 텍스트 정리
   */
  cleanJavaExtractedText(rawText) {
    if (!rawText) return '';

    return rawText
      // 기본 정리 (줄바꿈 보존)
      .replace(/[ \t]+/g, ' ')  // 탭과 공백만 단일 공백으로 (줄바꿈 보존)
      .replace(/​/g, '')     // 네이버 특수 문자
      
      // 네이버 블로그 특유 제거
      .replace(/공감\s*\d*/g, '')
      .replace(/댓글\s*\d*/g, '')
      .replace(/조회\s*\d*/g, '')
      .replace(/좋아요\s*\d*/g, '')
      .replace(/구독\s*\d*/g, '')
      .replace(/이웃추가/g, '')
      .replace(/궁금할\s?땐\s?네이버\s?톡톡하세요[^\s]*/g, '')
      
      // 연락처 정보 제거
      .replace(/\b(?:010|1544|02|051|053|032|062|042|052|044)[-\s]?\d{3,4}[-\s]?\d{4}\b/g, '')
      .replace(/\S+@\S+\.\S+/g, '')
      
      // 최종 정리 (과도한 줄바꿈만 정리)
      .replace(/\n{3,}/g, '\n\n')  // 3개 이상 줄바꿈을 2개로
      .replace(/[ \t]{2,}/g, ' ')  // 2개 이상 공백을 1개로
      .trim();
  }

  /**
   * 추출된 콘텐츠 정리 및 구조화 (BeautifulSoup 방식)
   */
  cleanAndStructureContent(contentElements) {
    if (!contentElements || contentElements.length === 0) {
      return '';
    }

    return contentElements
      .filter(element => element && element.trim())
      .map(element => element.trim())
      .join('\n\n')
      .replace(/\n\s*\n\s*\n+/g, '\n\n') // 과도한 줄바꿈 정리
      .trim();
  }

  /**
   * 여러 URL 배치 처리
   */
  async parseBlogUrls(urls) {
    const results = [];
    
    for (const url of urls) {
      const result = await this.extractNaverBlogContent(url);
      results.push(result);
      
      // 서버 부하 방지를 위한 딜레이
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return results;
  }
}

module.exports = AdvancedBlogParser;