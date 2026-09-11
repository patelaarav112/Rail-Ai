import client from './client';
export const getRisks = () => client.get('/predict/risks').then(r => r.data);
export const getAnomalies = () => client.get('/predict/anomalies').then(r => r.data);
export const getShap = () => client.get('/predict/shap').then(r => r.data);
export const getForecast = () => client.get('/predict/forecast').then(r => r.data);
export const getModelInfo = () => client.get('/predict/model-info').then(r => r.data);
