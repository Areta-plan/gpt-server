const express = require('express');
const ClassificationManager = require('../lib/classificationManager');
const OpenAIClassificationClient = require('../lib/openaiClassificationClient');
const CLASSIFICATION_PROMPTS = require('../lib/classificationPrompts');
const RLHFManager = require('../lib/rlhfManager');
const { asyncHandler } = require('../middleware/errorHandler');
const { successResponse, errorResponse, logError } = require('../lib/utils');

const router = express.Router();
const manager = new ClassificationManager();
const openaiClient = new OpenAIClassificationClient();

// 텍스트 분류 처리 (RLHF 개선 적용)
router.post('/', asyncHandler(async (req, res) => {
  const { text } = req.body;
  
  if (!text || text.trim() === '') {
    return res.status(400).json(errorResponse('분류할 텍스트를 입력하세요.', 400));
  }


  const results = {};
  const categories = ['title', 'firstparagraph', 'closing', 'story', 'usp'];
  
  try {
    // 각 카테고리별로 RLHF 개선이 적용된 분류 수행
    for (const category of categories) {
      const prompt = CLASSIFICATION_PROMPTS[category];
      if (prompt) {
        const result = await openaiClient.classify(prompt, text, [], category);
        if (result && result.trim()) {
          results[category] = result;
        }
      }
    }

    // 스토리 탐지 추가
    const hasStory = await openaiClient.detectStory(text);

    res.json(successResponse(results, '분류가 완료되었습니다.'));
  } catch (error) {
    logError('Classification error', error);
    res.status(500).json(errorResponse('분류 처리 중 오류가 발생했습니다.'));
  }
}));

// 미평가 항목 목록 조회
router.get('/unrated', (req, res) => {
  try {
    const unrated = manager.getUnratedClassifications();
    const stats = manager.getEvaluationStats();
    
    res.json({
      success: true,
      data: {
        unrated,
        stats,
        totalUnrated: Object.values(unrated).reduce((total, items) => total + items.length, 0)
      }
    });
  } catch (error) {
    console.error('Error getting unrated items:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 평가 저장
router.post('/evaluate', (req, res) => {
  try {
    const { category, filename, rating, feedback, improvements } = req.body;
    
    if (!category || !filename || !rating) {
      return res.status(400).json({
        success: false,
        error: 'category, filename, rating are required'
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        error: 'rating must be between 1 and 5'
      });
    }

    const success = manager.saveEvaluation(category, filename, rating, feedback || '', improvements || '');
    
    if (success) {
      res.json({
        success: true,
        message: 'Evaluation saved successfully',
        approved: rating >= 4
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to save evaluation'
      });
    }
  } catch (error) {
    console.error('Error saving evaluation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 평가 통계 조회
router.get('/stats', (req, res) => {
  try {
    const stats = manager.getEvaluationStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 낮은 점수 항목 조회
router.get('/lowrated', (req, res) => {
  try {
    const threshold = parseInt(req.query.threshold) || 2;
    const lowRated = manager.getLowRatedItems(threshold);
    
    res.json({
      success: true,
      data: lowRated
    });
  } catch (error) {
    console.error('Error getting low rated items:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 카테고리별 현황
router.get('/status', (req, res) => {
  try {
    const categories = ['title', 'firstparagraph', 'closing', 'story', 'usp'];
    const status = {};
    
    for (const category of categories) {
      status[category] = {
        unrated: manager.getUnratedCount(category)
      };
    }
    
    status.total = {
      unrated: manager.getUnratedCount()
    };
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Error getting status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 파일 삭제
router.delete('/delete-file', asyncHandler(async (req, res) => {
  console.log('🗑️ DELETE /classification/delete-file 요청 받음');
  console.log('🗑️ Request headers:', req.headers);
  console.log('🗑️ Request body:', req.body);
  
  const { category, filename, reason } = req.body;
  
  if (!category || !filename) {
    console.log('❌ 필수 파라미터 누락:', { category, filename });
    return res.status(400).json({
      success: false,
      error: 'category와 filename이 필요합니다.'
    });
  }
  
  console.log(`🗑️ 파일 삭제 요청: ${category}/${filename} (이유: ${reason || '없음'})`);
  
  try {
    // ClassificationManager를 통해 삭제 처리
    const success = manager.deleteFile(category, filename, reason);
    
    if (success) {
      console.log(`✅ 파일 삭제 완료: ${category}/${filename}`);
      
      const response = {
        success: true,
        message: `파일 ${filename}이 성공적으로 삭제되었습니다.`,
        category,
        filename,
        deletedAt: new Date().toISOString()
      };
      
      console.log('✅ 성공 응답 전송:', response);
      res.json(response);
    } else {
      console.log(`❌ 파일 삭제 실패: ${category}/${filename}`);
      
      const errorResponse = {
        success: false,
        error: '파일을 찾을 수 없거나 삭제할 수 없습니다.'
      };
      
      console.log('❌ 실패 응답 전송:', errorResponse);
      res.status(404).json(errorResponse);
    }
  } catch (error) {
    console.error('파일 삭제 중 오류:', error);
    console.error('Stack trace:', error.stack);
    
    const errorResponse = {
      success: false,
      error: '파일 삭제 중 오류가 발생했습니다.',
      details: error.message
    };
    
    console.log('❌ 서버 오류 응답 전송:', errorResponse);
    res.status(500).json(errorResponse);
  }
}));

// 반복 문구 관리 엔드포인트들

// 반복 문구 추가
router.post('/repetitive/add', asyncHandler(async (req, res) => {
  console.log('🚫 반복 문구 추가 요청:', req.body);
  
  const { phrase, category = 'general' } = req.body;
  
  if (!phrase || phrase.trim() === '') {
    return res.status(400).json({
      success: false,
      error: '추가할 반복 문구를 입력하세요.'
    });
  }
  
  try {
    const result = RLHFManager.addRepetitivePhrase(phrase.trim(), category);
    
    console.log('✅ 반복 문구 추가 완료:', result);
    res.json(result);
  } catch (error) {
    console.error('❌ 반복 문구 추가 오류:', error);
    res.status(500).json({
      success: false,
      error: '반복 문구 추가 중 오류가 발생했습니다.',
      details: error.message
    });
  }
}));

// 반복 문구 목록 조회
router.get('/repetitive/list', asyncHandler(async (req, res) => {
  try {
    const result = RLHFManager.getRepetitivePhrases();
    
    console.log('📋 반복 문구 목록 조회:', {
      totalCount: result.totalCount,
      isActive: result.isActive
    });
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ 반복 문구 목록 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: '반복 문구 목록 조회 중 오류가 발생했습니다.',
      details: error.message
    });
  }
}));

// 반복 문구 제거
router.delete('/repetitive/remove', asyncHandler(async (req, res) => {
  console.log('✅ 반복 문구 제거 요청:', req.body);
  
  const { phrase } = req.body;
  
  if (!phrase || phrase.trim() === '') {
    return res.status(400).json({
      success: false,
      error: '제거할 반복 문구를 입력하세요.'
    });
  }
  
  try {
    const result = RLHFManager.removeRepetitivePhrase(phrase.trim());
    
    console.log('✅ 반복 문구 제거 완료:', result);
    res.json(result);
  } catch (error) {
    console.error('❌ 반복 문구 제거 오류:', error);
    res.status(500).json({
      success: false,
      error: '반복 문구 제거 중 오류가 발생했습니다.',
      details: error.message
    });
  }
}));

// 반복 문구 피드백 제출
router.post('/repetitive/feedback', asyncHandler(async (req, res) => {
  console.log('📝 반복 문구 피드백 제출:', req.body);
  
  const { content, feedback, category = 'general' } = req.body;
  
  if (!content || !feedback) {
    return res.status(400).json({
      success: false,
      error: '내용과 피드백을 모두 입력하세요.'
    });
  }
  
  try {
    // 피드백에서 반복 문구를 자동으로 추출하여 처리
    const feedbackData = {
      type: 'repetitive_complaint',
      classification: content,
      userFeedback: feedback,
      category: category,
      timestamp: new Date().toISOString(),
      source: 'web_feedback'
    };
    
    const result = await RLHFManager.processNewFeedback(feedbackData);
    
    console.log('✅ 반복 문구 피드백 처리 완료:', result);
    
    res.json({
      success: true,
      message: '반복 문구 피드백이 처리되어 AI가 개선되었습니다.',
      data: result
    });
    
  } catch (error) {
    console.error('❌ 반복 문구 피드백 처리 오류:', error);
    res.status(500).json({
      success: false,
      error: '피드백 처리 중 오류가 발생했습니다.',
      details: error.message
    });
  }
}));

module.exports = router;