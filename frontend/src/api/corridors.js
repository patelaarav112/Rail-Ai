import client from './client';
export const getCorridors = () => client.get('/corridors').then(r => r.data);
