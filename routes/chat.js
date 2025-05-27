const express = require('express');
const router = express.Router();
const { handleChatHistoryRequest } = require('../services/chatService');
const { asyncHandler } = require('../middleware/errorHandler');

// POST /chat: 채팅 히스토리와 함께 처리 (파일 업로드 제거)
router.post('/', asyncHandler(async (req, res) => {
  const { messages } = req.body;
  
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages 배열이 필요합니다.' });
  }

  const answer = await handleChatHistoryRequest(messages, []);
  res.json({ answer });
}));

module.exports = router;