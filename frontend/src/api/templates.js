import api from './index'

// 获取所有模板
export const getTemplates = () => api.get('/templates')

// 获取单个模板
export const getTemplate = (id) => api.get(`/templates/${id}`)

// 从账号创建模板
export const createTemplateFromAccount = (accountId, data) => 
  api.post(`/templates/from-account/${accountId}`, data)

// 创建模板
export const createTemplate = (data) => api.post('/templates', data)

// 更新模板
export const updateTemplate = (id, data) => api.put(`/templates/${id}`, data)

// 删除模板
export const deleteTemplate = (id) => api.delete(`/templates/${id}`)

// 应用模板到账号
export const applyTemplateToAccount = (templateId, accountId) =>
  api.post(`/templates/${templateId}/apply/${accountId}`)




