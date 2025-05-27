const express = require('express');
const router = express.Router();
const { handleChatRequest } = require('../services/chatService');
const { validateRequest, asyncHandler } = require('../middleware/errorHandler');

// POST /ask: 단순 메시지 받기
router.post('/', 
  validateRequest(['message']),
  asyncHandler(async (req, res) => {
    const { message } = req.body;
    const answer = await handleChatRequest(message);
    res.json({ answer });
  })
);

module.exports = router;
