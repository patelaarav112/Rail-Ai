/**
 * RailMind AI — Axios API Client
 * Base URL: /api  (proxied to http://localhost:8000 via vite.config.js in dev,
 *                   or Netlify _redirects in production)
 */
import axios from 'axios';

// Detect environment: if running on localhost use absolute URL to avoid
// Vite proxy issues; in production Netlify proxies /api → backend
const BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

export const TOKEN_KEY = 'railmind_token';
export const DEPT_KEY = 'railmind_department';

// ─── Request interceptor — attach the department's session token ────────────
client.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (err) => Promise.reject(err),
);

// ─── Response interceptor — structured error logging + forced sign-out ──────
client.interceptors.response.use(
  (res) => res,
  (err) => {
    const url  = err.config?.url ?? '?';
    const code = err.response?.status ?? 'NETWORK';
    console.warn(`[RailMind API] ${code} ${err.config?.method?.toUpperCase()} ${url}`, err.message);
    if (code === 401 && !url.includes('/auth/login')) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(DEPT_KEY);
      window.dispatchEvent(new CustomEvent('railmind:unauthorized'));
    }
    return Promise.reject(err);
  },
);

export default client;
