// lib/cacheManager.js
class LRUCache {
  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
    this.cache = new Map();
    this.accessOrder = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return null;
    
    // LRU 업데이트
    this.updateAccess(key);
    return this.cache.get(key);
  }

  set(key, value) {
    // 크기 제한 확인
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }
    
    this.cache.set(key, value);
    this.updateAccess(key);
  }

  updateAccess(key) {
    const now = Date.now();
    this.accessOrder.set(key, now);
  }

  evictLRU() {
    // 가장 오래된 항목 제거
    let oldestKey = null;
    let oldestTime = Infinity;
    
    for (const [key, time] of this.accessOrder) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.accessOrder.delete(oldestKey);
    }
  }

  has(key) {
    return this.cache.has(key);
  }

  size() {
    return this.cache.size;
  }

  clear() {
    this.cache.clear();
    this.accessOrder.clear();
  }
}

// 응답 캐시 관리
class ResponseCache {
  constructor(ttl = 300000) { // 5분 TTL
    this.cache = new Map();
    this.ttl = ttl;
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }

  set(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  clear() {
    this.cache.clear();
  }
}

module.exports = { LRUCache, ResponseCache };