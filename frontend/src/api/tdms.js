import client from './client';
export const getAssets = (params) => client.get('/tdms/assets', { params }).then(r => r.data);
export const syncTDMS = () => client.post('/tdms/sync').then(r => r.data);
export const setAssetWorkStatus = (id, work_status) => client.patch(`/tdms/assets/${id}/work-status`, { work_status }).then(r => r.data);
