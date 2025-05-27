const express = require('express');
const ClassificationManager = require('../lib/classificationManager');
const AnthropicClient = require('../lib/anthropicClient');
const CLASSIFICATION_PROMPTS = require('../lib/classificationPrompts');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
const manager = new ClassificationManager();
const anthropic = new AnthropicClient();

// 텍스트 분류 처리 (RLHF 개선 적용)
router.post('/', asyncHandler(async (req, res) => {
  const { text } = req.body;
  
  if (!text || text.trim() === '') {
    return res.status(400).json({
      error: '분류할 텍스트를 입력하세요.'
    });
  }

  console.log('🤖 RLHF-Enhanced Classification Request:', { textLength: text.length });

  const results = {};
  const categories = ['title', 'firstparagraph', 'closing', 'story', 'usp'];
  
  try {
    // 각 카테고리별로 RLHF 개선이 적용된 분류 수행
    for (const category of categories) {
      const prompt = CLASSIFICATION_PROMPTS[category];
      if (prompt) {
        console.log(`🔍 Classifying ${category} with RLHF enhancements...`);
        const result = await anthropic.classify(prompt, text, [], category);
        if (result && result.trim()) {
          results[category] = result;
          console.log(`✅ ${category} classification completed`);
        }
      }
    }

    // 스토리 탐지 추가
    const hasStory = await anthropic.detectStory(text);
    if (hasStory && results.story) {
      console.log('📖 Story detected and classified');
    } else if (hasStory) {
      console.log('📖 Story detected but classification failed');
    }

    console.log('🎯 RLHF-Enhanced Classification Results:', {
      categoriesProcessed: Object.keys(results).length,
      hasStory: hasStory
    });

    res.json(results);
  } catch (error) {
    console.error('❌ Classification error:', error);
    res.status(500).json({
      error: '분류 처리 중 오류가 발생했습니다.'
    });
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

module.exports = router;