import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3100',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const apiKey = typeof window !== 'undefined' ? localStorage.getItem('apiKey') : null;
  if (apiKey) config.headers['X-API-Key'] = apiKey;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('apiKey');
      }
    }
    return Promise.reject(error);
  }
);

export default api;
