import client from './client';
export const getKPIs = () => client.get('/dashboard/kpis').then(r => r.data);
export const getRecommendations = () => client.get('/dashboard/recommendations').then(r => r.data);
export const getActivity = () => client.get('/dashboard/activity').then(r => r.data);
export const getTicker = () => client.get('/dashboard/ticker').then(r => r.data);
export const getCorridorMapStatus = () => client.get('/dashboard/corridor-map').then(r => r.data);
export const getKPIDetails = () => client.get('/dashboard/kpi-details').then(r => r.data);
