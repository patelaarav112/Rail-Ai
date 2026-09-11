import client from './client';
export const getDefects = (params) => client.get('/tms/defects', { params }).then(r => r.data);
export const createDefect = (data) => client.post('/tms/defects', data).then(r => r.data);
export const syncTMS = () => client.post('/tms/sync').then(r => r.data);
export const setDefectWorkStatus = (id, work_status) => client.patch(`/tms/defects/${id}/work-status`, { work_status }).then(r => r.data);
