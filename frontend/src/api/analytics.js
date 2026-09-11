import client from './client';
export const getKPIs = () => client.get('/analytics/kpis').then(r => r.data);
export const getTrends = () => client.get('/analytics/trends').then(r => r.data);
export const getDeptUtil = () => client.get('/analytics/dept-util').then(r => r.data);
export const getDowntime = () => client.get('/analytics/downtime').then(r => r.data);
export const getPunctuality = () => client.get('/analytics/punctuality').then(r => r.data);
