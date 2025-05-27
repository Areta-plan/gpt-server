/**
 * blog_extract.js
 *
 * Simple CLI utility for crawling blog posts and saving their cleaned text.
 *
 * Usage:
 *   node blog_extract.js <URL1> <URL2> ...
 *
 * The script visits each URL using Puppeteer, extracts the main article
 * content, removes common advertisement phrases and phone numbers, and
 * stores the result in the `raw_corpus` directory.
 */

const fs = require('fs');           // File system utilities
const path = require('path');       // Utility for handling file paths
// const chalk = require('chalk');     // Colored console output
const mkdirp = require('mkdirp');   // Recursive directory creation
// const puppeteer = require('puppeteer'); // Headless browser for scraping
const https = require('https');
const http = require('http');
// const { main: runStructurizer } = require('./gpt_structurizer'); // Removed - Claude handles structuring
const AutoClassificationManager = require('./lib/autoClassificationManager');

// Directory to store raw corpus
const outputDir = path.join(__dirname, 'raw_corpus');
mkdirp.sync(outputDir);

// Determine the next numeric suffix for the output file based on existing files
// e.g. if blog_001.txt and blog_002.txt exist, this returns 3.
function getNextIndex() {
  const files = fs
    .readdirSync(outputDir)
    .filter(f => /^blog_\d{3}\.txt$/.test(f));

  if (files.length === 0) return 1;

  const indices = files.map(f => parseInt(f.match(/(\d{3})/)[0], 10));
  return Math.max(...indices) + 1;
}

// Cleans raw text extracted from a page.
// 1. Remove phone numbers.
// 2. Strip out promotional phrases.
// 3. Collapse consecutive blank lines.
function cleanText(text) {
  if (!text) return '';

  // Regex pattern for phone numbers (e.g. 02-1234-5678, 01012345678)
  text = text.replace(/\d{2,3}[-.\s]?\d{3,4}[-.\s]?\d{4}/g, '');

  // Remove common advertising phrases
  const phrases = ['클릭', '카톡상담', '컨설', '문의', '연락주세요'];
  const phraseRegex = new RegExp(phrases.join('|'), 'g');
  text = text.replace(phraseRegex, '');

  // Reduce multiple blank lines to a single line break
  text = text.replace(/\n{2,}/g, '\n');
  return text.trim();
}

// Simple HTTP fetcher for blog content
async function fetchBlogContent(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    };
    
    client.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}
// Simple HTML text extractor
function extractFromHTML(html, url) {
  const domain = new URL(url).hostname;
  
  // Remove scripts and styles
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<style[\s\S]*?<\/style>/gi, '');
  
  let title = '';
  let content = '';
  
  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch) {
    title = titleMatch[1].trim();
  }
  
  if (domain.includes('naver.com')) {
    // For Naver blogs, try to extract from common content areas
    const contentPatterns = [
      /<div[^>]*se-main-container[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*post-content[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*entry-content[^>]*>([\s\S]*?)<\/div>/i
    ];
    
    for (const pattern of contentPatterns) {
      const match = html.match(pattern);
      if (match) {
        content = match[1];
        break;
      }
    }
  }
  
  // Fallback: extract from body or article tags
  if (!content) {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      content = bodyMatch[1];
    }
  }
  
  // Clean HTML tags
  content = content.replace(/<[^>]*>/g, ' ');
  content = content.replace(/&nbsp;/g, ' ');
  content = content.replace(/&lt;/g, '<');
  content = content.replace(/&gt;/g, '>');
  content = content.replace(/&amp;/g, '&');
  content = content.replace(/\s+/g, ' ').trim();
  
  title = title.replace(/<[^>]*>/g, ' ');
  title = title.replace(/&nbsp;/g, ' ');
  title = title.replace(/&lt;/g, '<');
  title = title.replace(/&gt;/g, '>');
  title = title.replace(/&amp;/g, '&');
  title = title.replace(/\s+/g, ' ').trim();
  
  return { title, content };
}

// Entry point. Processes the URLs provided on the command line.
async function main() {
  const urls = process.argv.slice(2);
  
  // Print usage message when no URLs are supplied
  if (urls.length === 0) {
    console.log('Usage: node blog_extract.js <URL1> <URL2> ...');
    process.exit(1);
  }

  let nextIndex = getNextIndex();            // Starting file index
  let success = 0;
  let fail = 0;

  for (const url of urls) {
    try {
      console.log(`🔍 Fetching ${url}...`);
      const html = await fetchBlogContent(url);
      const { title, content } = extractFromHTML(html, url);
      
      if (content) {
        const cleanedText = cleanText(content);
        if (cleanedText.length > 0) {
          const fileName = `blog_${String(nextIndex).padStart(3, '0')}.txt`;
          const filePath = path.join(outputDir, fileName);

          const output = `===title===\n${title || 'No Title'}\n\n===body===\n${cleanedText}`;

          fs.writeFileSync(filePath, output, 'utf8');
          console.log(`✅ Saved ${url} -> ${fileName}`);

          nextIndex++;
          success++;
        } else {
          console.log(`⚠️ No content after cleaning: ${url}`);
          fail++;
        }
      } else {
        console.log(`⚠️ Failed to extract content: ${url}`);
        fail++;
      }
    } catch (err) {
      console.log(`❌ Error processing ${url}: ${err.message}`);
      fail++;
    }
  }

  // Summary output after processing all URLs
  console.log(
    `\n📊 Processed ${urls.length} URLs -> Success: ${success}, Failed: ${fail}`
  );
  
  // Automatically run Claude classification
  console.log('\n🔄 Starting Claude auto-classification...');
  
  // Claude 자동 분류 실행
  const classifier = new AutoClassificationManager();
  const structuredDir = path.join(__dirname, 'structured');
  
  if (fs.existsSync(structuredDir)) {
    const jsonFiles = fs.readdirSync(structuredDir).filter(f => f.endsWith('.json'));
    
    for (const file of jsonFiles) {
      try {
        const jsonPath = path.join(structuredDir, file);
        const structuredData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        
        console.log(`\n🤖 Processing ${file} with Claude classification...`);
        const { results, savedFiles } = await classifier.processAndSave(structuredData, file);
        
        console.log(`✅ Classification complete for ${file}`);
        if (results.isStory) {
          console.log('📖 Story content detected and classified');
        }
        
      } catch (error) {
        console.error(`❌ Error processing ${file}:`, error.message);
      }
    }
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('❌ Unexpected error:', err);
  });
}

module.exports = { main };
