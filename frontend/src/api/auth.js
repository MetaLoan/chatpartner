import api from './index'

// 获取账号认证状态
export const getAuthStatus = (id) => {
  return api.get(`/accounts/${id}/auth/status`)
}

// 提交短信验证码
export const submitAuthCode = (id, data) => {
  return api.post(`/accounts/${id}/auth/code`, data)
}

// 提交2FA密码
export const submitAuthPassword = (id, data) => {
  return api.post(`/accounts/${id}/auth/password`, data)
}


