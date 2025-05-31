// 분류 문제 디버깅 스크립트
require('dotenv').config();

const AutoClassificationManager = require('./lib/autoClassificationManager');
const TextAnalyzer = require('./lib/textAnalyzer');
const AdvancedBlogParser = require('./lib/advancedBlogParser');

async function debugClassificationIssues() {
  const url = "https://blog.naver.com/easy-communication/222983364554";
  console.log('🔍 분류 문제 디버깅');
  console.log('📝 URL:', url);
  
  try {
    // 1. 블로그 내용 추출
    const parser = new AdvancedBlogParser();
    const result = await parser.extractNaverBlogContent(url);
    
    if (!result.content || result.content.length < 50) {
      throw new Error('블로그 내용 추출 실패');
    }
    
    console.log(`✅ 블로그 내용 추출 성공 (${result.content.length}자)`);
    console.log(`📝 제목: "${result.title}"`);
    
    // 2. TextAnalyzer로 문단 분석
    const textAnalyzer = new TextAnalyzer();
    const analysis = textAnalyzer.extractStructuredSections(result.content);
    
    console.log('\n📊 문단 분석 결과:');
    console.log(`   전체 문단 수: ${analysis.totalParagraphs}개`);
    console.log(`   첫 문단 길이: ${analysis.firstParagraph ? analysis.firstParagraph.length : 0}자`);
    console.log(`   마지막 문단 길이: ${analysis.closingParagraph ? analysis.closingParagraph.length : 0}자`);
    
    // 3. 분류 시스템 테스트
    const classifier = new AutoClassificationManager();
    
    // 제목 분류 테스트
    console.log('\n🎯 1. 제목 분류 테스트:');
    try {
      const titleResult = await classifier.classifyContent('title', result.title);
      console.log('✅ 제목 분류 완료');
      console.log('📄 원시 결과:');
      console.log(titleResult);
      console.log('\n📄 결과 분석:');
      if (titleResult.includes('===user===') && titleResult.includes('===assistant===')) {
        const userPart = titleResult.split('===user===')[1].split('===assistant===')[0].trim();
        const assistantPart = titleResult.split('===assistant===')[1].trim();
        console.log('USER 부분:', userPart);
        console.log('ASSISTANT 부분:', assistantPart);
      } else {
        console.log('❌ 올바른 형식이 아님');
      }
    } catch (error) {
      console.error('❌ 제목 분류 오류:', error.message);
    }
    
    // FirstParagraph 분류 테스트
    console.log('\n🎯 2. FirstParagraph 분류 테스트:');
    if (analysis.firstParagraph) {
      try {
        const extended = textAnalyzer.getExtendedFirstParagraph(result.content, 300);
        const fpContent = extended || analysis.firstParagraph;
        console.log(`📝 입력 내용 (${fpContent.length}자):`);
        console.log('---');
        console.log(fpContent.substring(0, 200) + '...');
        console.log('---');
        
        const fpResult = await classifier.classifyContent('firstparagraph', fpContent);
        console.log('✅ FirstParagraph 분류 완료');
        console.log('📄 결과 분석:');
        if (fpResult.includes('===user===') && fpResult.includes('===assistant===')) {
          const userPart = fpResult.split('===user===')[1].split('===assistant===')[0].trim();
          const assistantPart = fpResult.split('===assistant===')[1].trim();
          console.log('USER 부분:', userPart.substring(0, 200) + (userPart.length > 200 ? '...' : ''));
          console.log('ASSISTANT 부분 길이:', assistantPart.length);
          console.log('ASSISTANT 미리보기:', assistantPart.substring(0, 200) + (assistantPart.length > 200 ? '...' : ''));
          console.log('ASSISTANT 끝부분:', assistantPart.substring(Math.max(0, assistantPart.length - 200)));
        }
      } catch (error) {
        console.error('❌ FirstParagraph 분류 오류:', error.message);
      }
    }
    
    // Closing 분류 테스트
    console.log('\n🎯 3. Closing 분류 테스트:');
    if (analysis.closingParagraph) {
      try {
        const extended = textAnalyzer.getExtendedClosingParagraph(result.content, 200);
        const closingContent = extended || analysis.closingParagraph;
        console.log(`📝 입력 내용 (${closingContent.length}자):`);
        console.log('---');
        console.log(closingContent.substring(0, 200) + '...');
        console.log('---');
        
        const closingResult = await classifier.classifyContent('closing', closingContent);
        console.log('✅ Closing 분류 완료');
        console.log('📄 결과 분석:');
        if (closingResult.includes('===user===') && closingResult.includes('===assistant===')) {
          const userPart = closingResult.split('===user===')[1].split('===assistant===')[0].trim();
          const assistantPart = closingResult.split('===assistant===')[1].trim();
          console.log('USER 부분:', userPart);
          console.log('ASSISTANT 부분 길이:', assistantPart.length);
          console.log('ASSISTANT 미리보기:', assistantPart.substring(0, 200) + (assistantPart.length > 200 ? '...' : ''));
          console.log('ASSISTANT 끝부분:', assistantPart.substring(Math.max(0, assistantPart.length - 200)));
        } else {
          console.log('❌ 올바른 형식이 아님');
          console.log('원시 결과:', closingResult);
        }
      } catch (error) {
        console.error('❌ Closing 분류 오류:', error.message);
      }
    }
    
  } catch (error) {
    console.error('❌ 디버깅 오류:', error.message);
    console.error(error.stack);
  }
  
  console.log('\n🔍 디버깅 완료!');
}

debugClassificationIssues().catch(console.error);