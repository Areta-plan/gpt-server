// src/config/index.js
const cors = require("cors");
const path = require("path");
const express = require("express");

function initConfig(app) {
  // 1) CORS 허용 도메인 설정 (환경변수 ALLOWED_ORIGINS = "https://your.domain.com,https://...")  
  const origins = process.env.ALLOWED_ORIGINS?.split(",") || ["*"];
  app.use(cors({ origin: origins, methods: ["GET","POST"] }));

  // 2) JSON Body 파싱  
  app.use(express.json());

  // 3) 정적 파일 서빙 (프론트 React/Vue 등)  
  app.use(express.static(path.join(__dirname, "../../chatgpt-client")));

  // 4) 기타 (로깅, rate-limit 등)  
  // app.use(rateLimit({ windowMs:60000, max: 100 }));
}

module.exports = { initConfig };
