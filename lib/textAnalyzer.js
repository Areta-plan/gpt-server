// 텍스트 분석 및 의미 단위 분할 유틸리티
class TextAnalyzer {
  constructor() {
    // 문단 구분자 패턴들
    this.paragraphSeparators = [
      /\n\s*\n+/g,  // 두 개 이상의 줄바꿈
      /\.\s*\n(?=[A-Z가-힣])/g,  // 마침표 + 줄바꿈 + 대문자/한글 시작
      /[.!?]\s*(?=\n|$)/g  // 문장 끝 + 줄바꿈 또는 끝
    ];
    
    // 첫 문단 식별 키워드들
    this.introKeywords = [
      '안녕하세요', '반갑습니다', '소개', '시작', '오늘', '이번', 
      '여러분', '어머님', '부모님', '독자', '클릭', '글을', '포스팅'
    ];
    
    // 마지막 문단 식별 키워드들  
    this.closingKeywords = [
      '감사합니다', '고맙습니다', '마무리', '끝으로', '마지막으로', 
      '결론', '정리하면', '요약', '연락', '문의', '상담', '예약',
      '도움이 되었', '참고하시', '바랍니다', '기원합니다'
    ];
    
    // 제외할 패턴들 (링크, 광고, 내비게이션 등)
    this.excludePatterns = [
      /blog\.naver\.com[^\n]*/g,
      /https?:\/\/[^\s]+/g,
      /함께\s*읽으면\s*좋은\s*글[^\n]*/g,
      /\b(?:010|1544|02|051|053|032|062|042|052|044)[-\s]?\d{3,4}[-\s]?\d{4}\b/g,
      /\S+@\S+\.\S+/g,
      /궁금할\s*땐\s*네이버\s*톡톡[^\n]*/g,
      /©.*?NAVER.*?Corp[^\n]*/g,
      /지도\s*데이터[^\n]*/g
    ];
  }

  /**
   * 텍스트를 의미있는 문단들로 분할
   */
  splitIntoParagraphs(text) {
    if (!text) return [];
    
    // 제외 패턴들 먼저 제거
    let cleanText = text;
    this.excludePatterns.forEach(pattern => {
      cleanText = cleanText.replace(pattern, '');
    });
    
    // 다양한 방법으로 문단 분할 시도
    let paragraphs = [];
    
    // 방법 1: 빈 줄로 분할
    const byEmptyLines = cleanText.split(/\n\s*\n+/).map(p => p.trim()).filter(p => p.length > 20);
    
    // 방법 2: 마침표 + 단어로 시작하는 새 줄로 분할 (빈 줄이 없는 경우)
    if (byEmptyLines.length <= 1) {
      const sentencePattern = /(?<=[.!?])\s*(?=[가-힣A-Z\d])/g;
      const bySentences = cleanText.split(sentencePattern).map(p => p.trim()).filter(p => p.length > 30);
      
      // 문장들을 의미있는 크기의 문단으로 재결합
      if (bySentences.length > 1) {
        let currentParagraph = '';
        for (const sentence of bySentences) {
          if (currentParagraph.length + sentence.length < 500) {
            currentParagraph += (currentParagraph ? ' ' : '') + sentence;
          } else {
            if (currentParagraph.length > 50) {
              paragraphs.push(currentParagraph);
            }
            currentParagraph = sentence;
          }
        }
        if (currentParagraph.length > 50) {
          paragraphs.push(currentParagraph);
        }
      }
    } else {
      paragraphs = byEmptyLines;
    }
    
    // 방법 3: 특정 키워드나 패턴으로 분할 (여전히 큰 덩어리인 경우)
    if (paragraphs.length <= 1 && cleanText.length > 1000) {
      const splitPatterns = [
        /(?=무발화란\?)/g,
        /(?=\d+\.\s*[가-힣])/g,  // 숫자 목록
        /(?=그런데|하지만|그래서|따라서|결론적으로|마지막으로)/g,
        /(?=센터|치료|활동|방법).*?(?=입니다|합니다|해요|해보세요)\./g
      ];
      
      for (const pattern of splitPatterns) {
        const splits = cleanText.split(pattern).map(p => p.trim()).filter(p => p.length > 100);
        if (splits.length > paragraphs.length) {
          paragraphs = splits;
          break;
        }
      }
    }
    
    // 내비게이션 텍스트 제외
    paragraphs = paragraphs.filter(p => !this.isNavigationText(p));
    
    return paragraphs;
  }

  /**
   * 내비게이션이나 메타 텍스트인지 판단
   */
  isNavigationText(text) {
    const navPatterns = [
      /^(다음글|이전글|목록|카테고리|태그)$/,
      /^(공감|댓글|조회|좋아요|구독|이웃추가)\s*\d*$/,
      /^[\d\s.\-]+$/,  // 숫자만 있는 텍스트
      /^[ㄱ-ㅎㅏ-ㅣ가-힣\s]{1,3}$/  // 너무 짧은 한글 (예: "글", "더보기")
    ];
    
    return navPatterns.some(pattern => pattern.test(text.trim()));
  }

  /**
   * 실제 첫 문단 찾기 (하드코딩 없이)
   */
  findFirstParagraph(text) {
    const paragraphs = this.splitIntoParagraphs(text);
    if (paragraphs.length === 0) return null;

    // 1. 가장 긴 첫 번째 의미있는 문단을 찾기
    let bestCandidate = null;
    let bestScore = 0;

    for (let i = 0; i < Math.min(3, paragraphs.length); i++) {  // 처음 3개 문단만 검사
      const paragraph = paragraphs[i];
      const score = this.scoreFirstParagraph(paragraph);
      
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = paragraph;
      }
    }

    return bestCandidate;
  }

  /**
   * 첫 문단 점수 계산
   */
  scoreFirstParagraph(paragraph) {
    let score = 0;
    
    // 길이 점수 (적절한 길이의 문단에 더 높은 점수)
    if (paragraph.length >= 100 && paragraph.length <= 800) {
      score += 10;
    } else if (paragraph.length > 50) {
      score += 5;
    }
    
    // 인트로 키워드 점수
    this.introKeywords.forEach(keyword => {
      if (paragraph.includes(keyword)) {
        score += 3;
      }
    });
    
    // 문장 완성도 점수 (마침표로 끝나는지)
    if (paragraph.endsWith('.') || paragraph.endsWith('!') || paragraph.endsWith('?')) {
      score += 2;
    }
    
    // 숫자나 리스트가 있으면 감점 (목차일 가능성)
    if (/^\d+\./.test(paragraph) || paragraph.includes('1.') && paragraph.includes('2.')) {
      score -= 5;
    }
    
    return score;
  }

  /**
   * 실제 마지막 문단 찾기 (하드코딩 없이)
   */
  findClosingParagraph(text) {
    const paragraphs = this.splitIntoParagraphs(text);
    if (paragraphs.length === 0) return null;

    // 뒤에서부터 검사해서 가장 적절한 마지막 문단 찾기
    let bestCandidate = null;
    let bestScore = 0;

    // 마지막 5개 문단을 검사 (더 넓은 범위)
    const startIndex = Math.max(0, paragraphs.length - 5);
    for (let i = startIndex; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i];
      if (!paragraph || paragraph.trim().length < 10) continue; // 빈 문단 스킵
      
      const score = this.scoreClosingParagraph(paragraph);
      
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = paragraph;
      }
    }

    // 점수가 너무 낮으면 마지막 의미있는 문단 사용
    if (bestScore < 3) {
      for (let i = paragraphs.length - 1; i >= 0; i--) {
        if (paragraphs[i] && paragraphs[i].trim().length > 50) {
          bestCandidate = paragraphs[i];
          break;
        }
      }
    }

    return bestCandidate;
  }

  /**
   * 마지막 문단 점수 계산
   */
  scoreClosingParagraph(paragraph) {
    let score = 0;
    
    // 기본 길이 점수
    if (paragraph.length >= 100 && paragraph.length <= 800) {
      score += 15;
    } else if (paragraph.length >= 50 && paragraph.length <= 1000) {
      score += 10;
    } else if (paragraph.length > 20) {
      score += 5;
    }
    
    // 클로징 키워드 점수 (더 높은 점수)
    this.closingKeywords.forEach(keyword => {
      if (paragraph.includes(keyword)) {
        score += 8;
      }
    });
    
    // 추가 클로징 패턴들
    const additionalClosingPatterns = [
      /읽어주셔서/,
      /원장이었습니다/,
      /센터.*?대표/,
      /연락.*?주시면/,
      /응대.*?드리고/,
      /양해.*?부탁/,
      /결정하시길/,
      /바랄게요/,
      /감사합니다/
    ];
    
    additionalClosingPatterns.forEach(pattern => {
      if (pattern.test(paragraph)) {
        score += 6;
      }
    });
    
    // 주소/연락처가 있으면 감점 (하지만 완전히 배제하지는 않음)
    if (/\d{2,3}-\d{3,4}-\d{4}/.test(paragraph) || 
        /부산광역시|경상남도/.test(paragraph) ||
        paragraph.includes('층') ||
        paragraph.includes('호')) {
      score -= 8;  // 감점을 줄임
    }
    
    // 링크가 많으면 감점
    if ((paragraph.match(/blog\.naver\.com/g) || []).length > 1) {
      score -= 6;  // 감점을 줄임
    }
    
    // "함께 읽으면 좋은 글" 섹션이면 감점
    if (paragraph.includes('함께 읽으면 좋은 글')) {
      score -= 15;
    }
    
    return score;
  }

  /**
   * 문단들을 자연스러운 단위로 결합
   */
  combineRelatedParagraphs(paragraphs, maxLength = 1000) {
    if (!paragraphs || paragraphs.length === 0) return '';
    
    let combined = '';
    let currentLength = 0;
    
    for (const paragraph of paragraphs) {
      if (currentLength + paragraph.length <= maxLength) {
        combined += (combined ? '\n\n' : '') + paragraph;
        currentLength += paragraph.length;
      } else {
        break;
      }
    }
    
    return combined;
  }

  /**
   * 전체 텍스트에서 구조화된 섹션들 추출
   */
  extractStructuredSections(text) {
    const paragraphs = this.splitIntoParagraphs(text);
    
    return {
      allParagraphs: paragraphs,
      firstParagraph: this.findFirstParagraph(text),
      closingParagraph: this.findClosingParagraph(text),
      totalParagraphs: paragraphs.length,
      totalLength: text.length
    };
  }

  /**
   * 컨텍스트를 보존하면서 텍스트 확장
   */
  getExtendedFirstParagraph(text, minLength = 300) {
    const paragraphs = this.splitIntoParagraphs(text);
    const firstParagraph = this.findFirstParagraph(text);
    
    if (!firstParagraph) return null;
    
    const firstIndex = paragraphs.indexOf(firstParagraph);
    if (firstIndex === -1) return firstParagraph;
    
    // 첫 문단이 너무 짧으면 다음 문단들과 결합
    if (firstParagraph.length < minLength && firstIndex < paragraphs.length - 1) {
      const extendedParagraphs = paragraphs.slice(firstIndex, Math.min(firstIndex + 3, paragraphs.length));
      return this.combineRelatedParagraphs(extendedParagraphs, 1200);
    }
    
    return firstParagraph;
  }

  /**
   * 컨텍스트를 보존하면서 마지막 문단 확장
   */
  getExtendedClosingParagraph(text, minLength = 200) {
    const paragraphs = this.splitIntoParagraphs(text);
    const closingParagraph = this.findClosingParagraph(text);
    
    if (!closingParagraph) return null;
    
    const closingIndex = paragraphs.indexOf(closingParagraph);
    if (closingIndex === -1) return closingParagraph;
    
    // 마지막 문단이 너무 짧으면 이전 문단들과 결합
    if (closingParagraph.length < minLength && closingIndex > 0) {
      const startIndex = Math.max(0, closingIndex - 2);
      const extendedParagraphs = paragraphs.slice(startIndex, closingIndex + 1);
      return this.combineRelatedParagraphs(extendedParagraphs, 1000);
    }
    
    return closingParagraph;
  }
}

module.exports = TextAnalyzer;