/**
 * RailMind AI — Reports API
 * REST endpoints wired to /api/reports/*
 */
import client from './client';

export const getWeeklyReport   = () => client.get('/reports/weekly').then(r => r.data);
export const getReportSummary  = () => client.get('/reports/summary').then(r => r.data);
export const getMonthlyStats   = () => client.get('/reports/monthly-stats').then(r => r.data);
