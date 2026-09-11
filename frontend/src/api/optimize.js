import client from './client';
export const optimize = (params) => client.post('/optimize', params).then(r => r.data);
