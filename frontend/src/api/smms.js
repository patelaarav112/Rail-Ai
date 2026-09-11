import client from './client';
export const getAssets = (params) => client.get('/smms/assets', { params }).then(r => r.data);
export const syncSMMS = () => client.post('/smms/sync').then(r => r.data);
export const setAssetWorkStatus = (id, work_status) => client.patch(`/smms/assets/${id}/work-status`, { work_status }).then(r => r.data);
