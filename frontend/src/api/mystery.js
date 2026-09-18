import { http } from './client.js';

export const mysteryApi = {
  // 暗访任务
  listTasks: (params) => http.get('/mystery-tasks', params),
  taskDetail: (id) => http.get(`/mystery-tasks/${id}`),
  createTask: (payload) => http.post('/mystery-tasks', payload),
  updateTask: (id, payload) => http.patch(`/mystery-tasks/${id}`, payload),
  removeTask: (id) => http.delete(`/mystery-tasks/${id}`),
  taskTransitions: (id) => http.get(`/mystery-tasks/${id}/transitions`),
  changeTaskStatus: (id, payload) => http.post(`/mystery-tasks/${id}/transitions`, payload),
  periods: () => http.get('/mystery-tasks/periods'),
  // 暗访记录
  listVisits: (params) => http.get('/mystery-visits', params),
  visitDetail: (id) => http.get(`/mystery-visits/${id}`),
  createVisit: (payload) => http.post('/mystery-visits', payload),
  removeVisit: (id) => http.delete(`/mystery-visits/${id}`),
};
