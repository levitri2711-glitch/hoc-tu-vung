// API_URL: máy chủ Apps Script (…/exec). Chạy thử trên máy (localhost) thì dùng '/api' của dev_server.
window.VOL_CONFIG = {
  API_URL: /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? '/api' : 'https://script.google.com/macros/s/AKfycbzgsVkIh79IEr7li7-Fufq4zLFtVTGs9ILfZAalE_L-gSCVuklm3AQYbsIyfThxd30B/exec',
  APP_NAME: 'Học từ vựng',
};
