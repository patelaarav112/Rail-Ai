import client from './client';
export const getTrains = () => client.get('/coa/trains').then(r => r.data);
export const getWindows = () => client.get('/coa/windows').then(r => r.data);
export const getGoodsForecast = () => client.get('/coa/goods-forecast').then(r => r.data);
