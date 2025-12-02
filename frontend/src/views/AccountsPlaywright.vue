<template>
  <div class="accounts">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>账号管理 <el-tag size="small" type="success">Playwright 版</el-tag></span>
          <el-button type="primary" @click="handleAdd">添加账号</el-button>
        </div>
      </template>

      <!-- 提示信息 -->
      <el-alert
        title="新版本说明"
        type="info"
        :closable="true"
        show-icon
        style="margin-bottom: 20px"
      >
        <template #default>
          <p>Playwright 版本通过浏览器自动化操作 Telegram Web，<strong>无需配置 API ID 和 API Hash</strong>。</p>
          <p>只需输入手机号和 AI API Key，然后点击「登录」，系统会自动发送验证码到您的 Telegram 客户端。</p>
        </template>
      </el-alert>

      <!-- 搜索栏 -->
      <div class="search-bar">
        <el-input
          v-model="searchText"
          placeholder="搜索手机号或昵称"
          style="width: 300px"
          clearable
          @clear="loadAccounts"
          @keyup.enter="loadAccounts"
        >
          <template #append>
            <el-button @click="loadAccounts">搜索</el-button>
          </template>
        </el-input>
        <el-select
          v-model="statusFilter"
          placeholder="状态筛选"
          style="width: 150px; margin-left: 10px"
          clearable
          @change="loadAccounts"
        >
          <el-option label="在线" value="online" />
          <el-option label="离线" value="offline" />
          <el-option label="认证中" value="authenticating" />
          <el-option label="错误" value="error" />
        </el-select>
      </div>

      <!-- 账号表格 -->
      <el-table
        v-loading="loading"
        :data="accounts"
        style="width: 100%; margin-top: 20px"
        stripe
      >
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="phone_number" label="手机号" />
        <el-table-column prop="nickname" label="昵称" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="ai_model" label="AI模型" width="120" />
        <el-table-column prop="auto_reply" label="自动回复" width="100">
          <template #default="{ row }">
            <el-switch :model-value="row.auto_reply" disabled />
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="handleEdit(row)">编辑</el-button>
            <el-button
              size="small"
              type="success"
              :disabled="row.status === 'online'"
              @click="handleLogin(row)"
            >
              登录
            </el-button>
            <el-button
              v-if="row.status === 'online'"
              size="small"
              type="warning"
              @click="handleLogout(row)"
            >
              登出
            </el-button>
            <el-button
              size="small"
              type="danger"
              @click="handleDelete(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="loadAccounts"
          @current-change="loadAccounts"
        />
      </div>
    </el-card>

    <!-- 登录认证对话框 -->
    <el-dialog
      v-model="authDialogVisible"
      :title="authAccount ? `账号登录认证 - ${authAccount.phone_number}` : '账号登录认证'"
      width="450px"
    >
      <div v-if="authAccount">
        <el-steps :active="getAuthStep(authStatus.state)" finish-status="success" simple>
          <el-step title="发送验证码" />
          <el-step title="输入验证码" />
          <el-step title="完成登录" />
        </el-steps>

        <el-alert
          :title="authStatus.message || '等待中...'"
          :type="authStatus.state === 'authenticated' ? 'success' : 'info'"
          :closable="false"
          show-icon
          style="margin: 20px 0"
        />

        <el-form label-width="100px">
          <el-form-item label="验证码" v-if="authStatus.state === 'code_required'">
            <el-input
              v-model="authCode"
              placeholder="请输入收到的验证码"
              style="width: 200px"
            />
            <el-button
              type="primary"
              size="small"
              style="margin-left: 8px"
              :loading="authLoading"
              @click="handleSubmitCode"
            >
              提交
            </el-button>
          </el-form-item>

          <el-form-item label="2FA密码" v-if="authStatus.state === 'password_required'">
            <el-input
              v-model="authPassword"
              type="password"
              show-password
              placeholder="请输入两步验证密码"
              style="width: 200px"
            />
            <el-button
              type="primary"
              size="small"
              style="margin-left: 8px"
              :loading="authLoading"
              @click="handleSubmitPassword"
            >
              提交
            </el-button>
          </el-form-item>
        </el-form>

        <div style="margin-top: 16px; text-align: right">
          <el-button size="small" @click="loadAuthStatus(authAccount.id)">
            刷新状态
          </el-button>
          <el-button
            size="small"
            type="primary"
            @click="() => { loadAccounts(); authDialogVisible = false }"
          >
            关闭
          </el-button>
        </div>
      </div>
    </el-dialog>

    <!-- 添加/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="600px"
      @close="resetForm"
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="120px"
      >
        <el-form-item label="手机号" prop="phone_number">
          <el-input v-model="form.phone_number" placeholder="+8613800138000" />
          <div class="form-tip">请输入完整的国际格式手机号（包含国家码）</div>
        </el-form-item>

        <!-- 不再需要 API ID 和 API Hash！ -->

        <el-form-item label="AI API Key" prop="ai_api_key">
          <el-input v-model="form.ai_api_key" type="password" show-password />
        </el-form-item>

        <el-form-item label="AI API 地址" prop="ai_api_base_url">
          <el-input v-model="form.ai_api_base_url" placeholder="留空使用默认地址" />
          <div class="form-tip">可选，用于自定义 API 地址（如代理或其他兼容服务）</div>
        </el-form-item>

        <el-form-item label="昵称" prop="nickname">
          <el-input v-model="form.nickname" placeholder="可选，用于显示" />
        </el-form-item>

        <el-form-item label="AI模型" prop="ai_model">
          <el-select v-model="form.ai_model" style="width: 100%">
            <el-option-group label="OpenAI">
              <el-option label="GPT-4o Mini" value="gpt-4o-mini" />
              <el-option label="GPT-4o" value="gpt-4o" />
              <el-option label="GPT-4 Turbo" value="gpt-4-turbo" />
              <el-option label="GPT-3.5 Turbo" value="gpt-3.5-turbo" />
            </el-option-group>
            <el-option-group label="DeepSeek">
              <el-option label="DeepSeek Chat" value="deepseek-chat" />
              <el-option label="DeepSeek Coder" value="deepseek-coder" />
            </el-option-group>
            <el-option-group label="Claude">
              <el-option label="Claude 3.5 Sonnet" value="claude-3-5-sonnet-20241022" />
              <el-option label="Claude 3 Opus" value="claude-3-opus-20240229" />
            </el-option-group>
          </el-select>
        </el-form-item>

        <el-form-item label="系统提示词" prop="system_prompt">
          <el-input
            v-model="form.system_prompt"
            type="textarea"
            :rows="4"
            placeholder="定义AI的说话风格和行为"
          />
        </el-form-item>

        <el-divider content-position="left">消息处理参数</el-divider>

        <el-form-item label="监听间隔(秒)" prop="listen_interval">
          <el-input-number v-model="form.listen_interval" :min="3" :max="60" style="width: 100%" />
          <div class="form-tip">每隔多少秒检查一次新消息</div>
        </el-form-item>

        <el-form-item label="缓冲消息数" prop="buffer_size">
          <el-input-number v-model="form.buffer_size" :min="1" :max="50" style="width: 100%" />
          <div class="form-tip">收集多少条消息后生成回复</div>
        </el-form-item>

        <el-form-item label="发言间隔(秒)" prop="reply_interval">
          <el-input-number v-model="form.reply_interval" :min="5" :max="3600" style="width: 100%" />
          <div class="form-tip">同一群组内两次发言的最小间隔</div>
        </el-form-item>

        <el-form-item label="回复概率(%)" prop="reply_probability">
          <el-slider v-model="form.reply_probability" :min="0" :max="100" show-input style="width: 100%" />
        </el-form-item>

        <el-form-item label="自动回复" prop="auto_reply">
          <el-switch v-model="form.auto_reply" />
        </el-form-item>

        <el-form-item label="图片识别" prop="enable_image_recognition">
          <el-switch v-model="form.enable_image_recognition" />
          <div class="form-tip">开启后AI会尝试读取群里的图片，能理解更多上下文，但会增加token消耗</div>
        </el-form-item>

        <el-form-item label="拆分多条消息" prop="split_by_newline">
          <el-switch v-model="form.split_by_newline" />
        </el-form-item>

        <el-form-item label="多消息间隔(秒)" prop="multi_msg_interval" v-if="form.split_by_newline">
          <el-input-number v-model="form.multi_msg_interval" :min="1" :max="30" style="width: 100%" />
        </el-form-item>

        <el-divider content-position="left">其他设置</el-divider>

        <el-form-item label="优先级" prop="priority">
          <el-input-number v-model="form.priority" :min="1" :max="10" style="width: 100%" />
        </el-form-item>

        <el-form-item label="启用账号" prop="enabled">
          <el-switch v-model="form.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  loginAccount,
  logoutAccount
} from '@/api/accounts'
import {
  getAuthStatus,
  submitAuthCode,
  submitAuthPassword
} from '@/api/auth'

const accounts = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const dialogTitle = ref('添加账号')
const formRef = ref(null)
const searchText = ref('')
const statusFilter = ref('')

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
})

// 表单数据 - 移除了 api_id 和 api_hash
const form = reactive({
  phone_number: '',
  ai_api_key: '',
  ai_api_base_url: '',
  nickname: '',
  ai_model: 'gpt-4o-mini',
  system_prompt: '你是一个友好、有帮助的AI助手，会在Telegram群组中自然地参与对话。保持简洁、有趣的回复风格。',
  reply_interval: 60,
  listen_interval: 5,
  buffer_size: 10,
  auto_reply: true,
  enable_image_recognition: false,
  reply_probability: 100,
  split_by_newline: true,
  multi_msg_interval: 5,
  priority: 5,
  enabled: true
})

// 验证规则 - 不再需要 api_id 和 api_hash
const rules = {
  phone_number: [{ required: true, message: '请输入手机号', trigger: 'blur' }],
  ai_api_key: [{ required: true, message: '请输入AI API Key', trigger: 'blur' }]
}

let editingId = null

// 登录认证相关
const authDialogVisible = ref(false)
const authLoading = ref(false)
const authAccount = ref(null)
const authStatus = ref({ state: 'none', message: '' })
const authCode = ref('')
const authPassword = ref('')

const getStatusType = (status) => {
  const types = {
    online: 'success',
    offline: 'info',
    authenticating: 'warning',
    error: 'danger'
  }
  return types[status] || 'info'
}

const getStatusText = (status) => {
  const texts = {
    online: '在线',
    offline: '离线',
    authenticating: '认证中',
    error: '错误'
  }
  return texts[status] || status
}

const getAuthStep = (state) => {
  const steps = {
    none: 0,
    code_sent: 1,
    code_required: 1,
    password_required: 2,
    authenticated: 3
  }
  return steps[state] || 0
}

const loadAuthStatus = async (accountId) => {
  try {
    const res = await getAuthStatus(accountId)
    authStatus.value = res
  } catch (error) {
    console.error('获取认证状态失败:', error)
  }
}

const loadAccounts = async () => {
  loading.value = true
  try {
    const params = {
      page: pagination.page,
      page_size: pagination.pageSize
    }
    if (searchText.value) params.search = searchText.value
    if (statusFilter.value) params.status = statusFilter.value

    const response = await getAccounts(params)
    if (response.data) {
      accounts.value = response.data
      pagination.total = response.total || 0
    }
  } catch (error) {
    console.error('获取账号列表失败:', error)
    ElMessage.error('获取账号列表失败')
  } finally {
    loading.value = false
  }
}

const handleAdd = () => {
  dialogTitle.value = '添加账号'
  editingId = null
  resetForm()
  dialogVisible.value = true
}

const handleEdit = (row) => {
  dialogTitle.value = '编辑账号'
  editingId = row.id
  Object.assign(form, {
    phone_number: row.phone_number,
    ai_api_key: row.ai_api_key,
    ai_api_base_url: row.ai_api_base_url || '',
    nickname: row.nickname,
    ai_model: row.ai_model,
    system_prompt: row.system_prompt,
    reply_interval: row.reply_interval || 60,
    listen_interval: row.listen_interval || 5,
    buffer_size: row.buffer_size || 10,
    auto_reply: row.auto_reply !== false,
    enable_image_recognition: row.enable_image_recognition || false,
    reply_probability: row.reply_probability ?? 100,
    split_by_newline: row.split_by_newline !== false,
    multi_msg_interval: row.multi_msg_interval || 5,
    priority: row.priority || 5,
    enabled: row.enabled !== false
  })
  dialogVisible.value = true
}

const handleSubmit = async () => {
  if (!formRef.value) return

  await formRef.value.validate(async (valid) => {
    if (valid) {
      try {
        if (editingId) {
          await updateAccount(editingId, form)
          ElMessage.success('账号更新成功')
        } else {
          await createAccount(form)
          ElMessage.success('账号创建成功')
        }
        dialogVisible.value = false
        loadAccounts()
      } catch (error) {
        console.error('保存失败:', error)
        ElMessage.error(error.response?.data?.error || '保存失败')
      }
    }
  })
}

const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm('确定要删除这个账号吗？', '提示', { type: 'warning' })
    await deleteAccount(row.id)
    ElMessage.success('删除成功')
    loadAccounts()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除失败:', error)
      ElMessage.error('删除失败')
    }
  }
}

const handleLogin = async (row) => {
  try {
    await loginAccount(row.id)
    ElMessage.success('登录请求已提交，请查收验证码')

    authAccount.value = row
    authCode.value = ''
    authPassword.value = ''
    await loadAuthStatus(row.id)
    authDialogVisible.value = true
  } catch (error) {
    console.error('登录失败:', error)
    ElMessage.error(error.response?.data?.error || '登录失败')
  }
}

const handleLogout = async (row) => {
  try {
    await ElMessageBox.confirm('确定要登出这个账号吗？', '提示', { type: 'warning' })
    await logoutAccount(row.id)
    ElMessage.success('已登出')
    loadAccounts()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('登出失败:', error)
      ElMessage.error('登出失败')
    }
  }
}

const handleSubmitCode = async () => {
  if (!authAccount.value || !authCode.value) {
    ElMessage.error('请输入验证码')
    return
  }
  authLoading.value = true
  try {
    await submitAuthCode(authAccount.value.id, { code: authCode.value })
    ElMessage.success('验证码已提交')
    await loadAuthStatus(authAccount.value.id)
  } catch (error) {
    ElMessage.error(error.response?.data?.error || '提交验证码失败')
  } finally {
    authLoading.value = false
  }
}

const handleSubmitPassword = async () => {
  if (!authAccount.value || !authPassword.value) {
    ElMessage.error('请输入2FA密码')
    return
  }
  authLoading.value = true
  try {
    await submitAuthPassword(authAccount.value.id, { password: authPassword.value })
    ElMessage.success('密码已提交')
    await loadAuthStatus(authAccount.value.id)
  } catch (error) {
    ElMessage.error(error.response?.data?.error || '提交密码失败')
  } finally {
    authLoading.value = false
  }
}

const resetForm = () => {
  Object.assign(form, {
    phone_number: '',
    ai_api_key: '',
    ai_api_base_url: '',
    nickname: '',
    ai_model: 'gpt-4o-mini',
    system_prompt: '你是一个友好、有帮助的AI助手，会在Telegram群组中自然地参与对话。保持简洁、有趣的回复风格。',
    reply_interval: 60,
    listen_interval: 5,
    buffer_size: 10,
    auto_reply: true,
    enable_image_recognition: false,
    reply_probability: 100,
    split_by_newline: true,
    multi_msg_interval: 5,
    priority: 5,
    enabled: true
  })
  if (formRef.value) formRef.value.resetFields()
}

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString('zh-CN')
}

onMounted(() => {
  loadAccounts()
})
</script>

<style scoped>
.accounts {
  padding: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.search-bar {
  display: flex;
  align-items: center;
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.form-tip {
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
  margin-top: 4px;
}
</style>


