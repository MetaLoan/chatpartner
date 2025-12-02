import api from './index'

// 获取全局统计
export const getStatistics = () => {
  return api.get('/statistics')
}

// 获取账号统计
export const getAccountStatistics = (accountId) => {
  return api.get(`/accounts/${accountId}/statistics`)
}

// 获取群组统计
export const getGroupStatistics = (groupId) => {
  return api.get(`/groups/${groupId}/statistics`)
}

