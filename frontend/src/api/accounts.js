import api from './index'

// 获取账号列表
export const getAccounts = (params = {}) => {
  return api.get('/accounts', { params })
}

// 获取单个账号
export const getAccount = (id) => {
  return api.get(`/accounts/${id}`)
}

// 创建账号
export const createAccount = (data) => {
  return api.post('/accounts', data)
}

// 更新账号
export const updateAccount = (id, data) => {
  return api.put(`/accounts/${id}`, data)
}

// 删除账号
export const deleteAccount = (id) => {
  return api.delete(`/accounts/${id}`)
}

// 登录账号
export const loginAccount = (id) => {
  return api.post(`/accounts/${id}/login`)
}

// 登出账号
export const logoutAccount = (id) => {
  return api.post(`/accounts/${id}/logout`)
}

// 保存所有登录状态
export const saveAllSessions = () => {
  return api.post('/accounts/save-sessions')
}

