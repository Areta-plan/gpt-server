// services/webSearch.js
// Google Custom Search 기반 실시간 웹 검색 유틸
// 환경변수: GOOGLE_API_KEY, GOOGLE_CX_ID
const fetch = require('node-fetch');

async function webSearch(query, numResults = 3) {
  const apiKey = process.env.GOOGLE_API_KEY;
  const cx = process.env.GOOGLE_CX_ID;
  if (!apiKey || !cx) {
    throw new Error('환경변수 GOOGLE_API_KEY 또는 GOOGLE_CX_ID가 설정되지 않았습니다.');
  }
  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&num=${numResults}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Google CSE Error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (!data.items) return [];
  return data.items.map(item => ({
    title: item.title,
    snippet: item.snippet,
    link: item.link
  }));
}

module.exports = { webSearch };