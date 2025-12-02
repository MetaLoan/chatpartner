import api from './index'

// 获取消息列表
export const getMessages = (params = {}) => {
  return api.get('/messages', { params })
}

// 获取单个消息
export const getMessage = (id) => {
  return api.get(`/messages/${id}`)
}

// 发送消息
export const sendMessage = (data) => {
  return api.post('/messages/send', data)
}

