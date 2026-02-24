import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3100',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

let _accessToken: string | null = null;

export function setApiAccessToken(token: string | null) {
  _accessToken = token;
}

api.interceptors.request.use((config) => {
  if (_accessToken) {
    config.headers.Authorization = `Bearer ${_accessToken}`;
  } else {
    const apiKey = typeof window !== 'undefined' ? localStorage.getItem('apiKey') : null;
    if (apiKey) config.headers['X-API-Key'] = apiKey;
    const envKey = process.env.NEXT_PUBLIC_API_KEY;
    if (!apiKey && envKey) config.headers['X-API-Key'] = envKey;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && _accessToken) {
      try {
        const res = await axios.post(
          `${api.defaults.baseURL}/api/auth/refresh`,
          {},
          { withCredentials: true },
        );
        _accessToken = res.data.accessToken;
        error.config.headers.Authorization = `Bearer ${_accessToken}`;
        return api.request(error.config);
      } catch {
        _accessToken = null;
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  },
);

export default api;
