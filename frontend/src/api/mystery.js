import { http } from './client.js';

const TASKS = '/mystery/tasks';
const VISITS = '/mystery/visits';

export const mysteryTaskApi = {
  list: (params) => http.get(TASKS, params),
  detail: (id) => http.get(`${TASKS}/${id}`),
  create: (payload) => http.post(TASKS, payload),
  update: (id, payload) => http.patch(`${TASKS}/${id}`, payload),
  remove: (id, params) => http.delete(`${TASKS}/${id}`, params),
};

export const mysteryVisitApi = {
  list: (params) => http.get(VISITS, params),
  detail: (id) => http.get(`${VISITS}/${id}`),
  create: (payload) => http.post(VISITS, payload),
  update: (id, payload) => http.patch(`${VISITS}/${id}`, payload),
  remove: (id) => http.delete(`${VISITS}/${id}`),
};

export const mysteryStatsApi = {
  get: () => http.get('/mystery/stats'),
};
