// Mock fetch for Node.js environment - use native fetch when available
if (typeof global.fetch === 'undefined') {
  const fetch = require('node-fetch');
  global.fetch = fetch;
}
