import client from './client';

export const login = (department, password) =>
  client.post('/auth/login', { department, password }).then(r => r.data);

export const whoAmI = () => client.get('/auth/me').then(r => r.data);
