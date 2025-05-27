const express = require('express');
const multer = require('multer');
const router = express.Router();
const { handleBlogRequest } = require('../services/chatService');
const { asyncHandler } = require('../middleware/errorHandler');

// 파일 업로드 설정 (메모리에 저장)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB 제한
    files: 5 // 최대 5개 파일
  },
  fileFilter: (req, file, cb) => {
    // 텍스트 파일만 허용
    const allowedMimes = [
      'text/plain',
      'text/markdown',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('지원되지 않는 파일 형식입니다. (.txt, .md, .pdf, .doc, .docx만 지원)'));
    }
  }
});

// POST /blog: 블로그 초안 생성 (파일 업로드 지원)
router.post('/', 
  upload.array('files', 5),
  asyncHandler(async (req, res) => {
    const { topic, target, tone, brand, style } = req.body;
    
    if (!topic || !target || !brand) {
      return res.status(400).json({ 
        error: '필수 항목을 모두 입력하세요. (topic, target, brand)' 
      });
    }
    
    // 업로드된 파일 처리
    const files = req.files || [];
    const fileContents = [];
    
    for (const file of files) {
      try {
        let content = '';
        
        if (file.mimetype === 'text/plain' || file.mimetype === 'text/markdown') {
          content = file.buffer.toString('utf-8');
        } else if (file.mimetype === 'application/pdf') {
          // PDF 처리는 별도 라이브러리 필요 - 일단 스킵
          console.log('PDF 파일은 현재 지원되지 않습니다:', file.originalname);
          continue;
        } else {
          // DOC/DOCX 처리는 별도 라이브러리 필요 - 일단 스킵
          console.log('Office 문서는 현재 지원되지 않습니다:', file.originalname);
          continue;
        }
        
        if (content.trim()) {
          fileContents.push({
            filename: file.originalname,
            content: content.trim()
          });
        }
      } catch (error) {
        console.error('파일 처리 오류:', file.originalname, error);
      }
    }
    
    console.log('📁 업로드된 파일들:', files.map(f => f.originalname));
    console.log('📄 처리된 콘텐츠 파일 수:', fileContents.length);
    
    // 블로그 생성 요청
    const userParams = {
      target,
      tone,
      brand,
      style,
      uploadedFiles: fileContents
    };
    
    const blog = await handleBlogRequest({ 
      topic, 
      mode: style, 
      userParams 
    });
    
    res.json({ blog });
  })
);

module.exports = router;
