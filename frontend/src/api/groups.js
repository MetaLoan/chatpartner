import api from './index'

// 获取群组列表
export const getGroups = (params = {}) => {
  return api.get('/groups', { params })
}

// 获取单个群组
export const getGroup = (id) => {
  return api.get(`/groups/${id}`)
}

// 创建群组
export const createGroup = (data) => {
  return api.post('/groups', data)
}

// 更新群组
export const updateGroup = (id, data) => {
  return api.put(`/groups/${id}`, data)
}

// 删除群组
export const deleteGroup = (id) => {
  return api.delete(`/groups/${id}`)
}

// 为群组分配账号
export const assignAccounts = (groupId, accountIds) => {
  return api.post(`/groups/${groupId}/assign-accounts`, {
    account_ids: accountIds
  })
}

// 获取群组的账号列表
export const getGroupAccounts = (groupId) => {
  return api.get(`/groups/${groupId}/accounts`)
}

