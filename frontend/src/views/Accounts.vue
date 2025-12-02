<template>
  <div class="accounts">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>账号管理</span>
          <el-button type="primary" @click="handleAdd">添加账号</el-button>
        </div>
      </template>

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
            <el-tag
              :type="
                row.status === 'online'
                  ? 'success'
                  : row.status === 'offline'
                  ? 'info'
                  : 'danger'
              "
            >
              {{ row.status === 'online' ? '在线' : row.status === 'offline' ? '离线' : '错误' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="ai_model" label="AI模型" width="120" />
        <el-table-column prop="reply_interval" label="发言间隔(秒)" width="120" />
        <el-table-column prop="created_at" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="250" fixed="right">
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
    width="400px"
  >
    <div v-if="authAccount">
      <p>当前状态：{{ authStatus.message || authStatus.state }}</p>

      <div style="margin-top: 16px">
        <el-form label-width="120px">
          <el-form-item label="短信验证码">
            <el-input
              v-model="authCode"
              placeholder="请输入收到的验证码"
              style="width: 220px"
            />
            <el-button
              type="primary"
              size="small"
              style="margin-left: 8px"
              :loading="authLoading"
              @click="handleSubmitCode"
            >
              提交验证码
            </el-button>
          </el-form-item>

          <el-form-item label="2FA密码（可选）">
            <el-input
              v-model="authPassword"
              type="password"
              show-password
              placeholder="如果账号开启了二步验证，请输入密码"
              style="width: 220px"
            />
            <el-button
              type="primary"
              size="small"
              style="margin-left: 8px"
              :loading="authLoading"
              @click="handleSubmitPassword"
            >
              提交密码
            </el-button>
          </el-form-item>
        </el-form>
      </div>

      <p style="font-size: 12px; color: #909399; margin-top: 8px">
        提交验证码/密码后，可稍等几秒再点击“刷新状态”查看结果。
      </p>

      <div style="margin-top: 8px">
        <el-button
          size="small"
          @click="loadAuthStatus(authAccount.id)"
        >
          刷新状态
        </el-button>
        <el-button
          size="small"
          type="success"
          @click="() => { loadAccounts(); authDialogVisible = false }"
        >
          关闭并刷新列表
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
        </el-form-item>
        <el-form-item label="API ID" prop="api_id">
          <el-input-number v-model="form.api_id" :min="0" style="width: 100%" />
        </el-form-item>
        <el-form-item label="API Hash" prop="api_hash">
          <el-input v-model="form.api_hash" type="password" show-password />
        </el-form-item>
        <el-form-item label="AI API Key" prop="ai_api_key">
          <el-input v-model="form.ai_api_key" type="password" show-password />
        </el-form-item>
        <el-form-item label="昵称" prop="nickname">
          <el-input v-model="form.nickname" />
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
          </el-select>
          <div class="form-tip">DeepSeek 模型需要使用 DeepSeek 的 API Key</div>
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
          <div class="form-tip">每隔多少秒处理一次缓冲区中的消息</div>
        </el-form-item>
        <el-form-item label="缓冲消息数" prop="buffer_size">
          <el-input-number v-model="form.buffer_size" :min="1" :max="50" style="width: 100%" />
          <div class="form-tip">收集最近多少条消息后生成回复</div>
        </el-form-item>
        <el-form-item label="发言间隔(秒)" prop="reply_interval">
          <el-input-number v-model="form.reply_interval" :min="5" :max="3600" style="width: 100%" />
          <div class="form-tip">同一群组内两次发言的最小间隔</div>
        </el-form-item>
        <el-form-item label="回复概率(%)" prop="reply_probability">
          <el-slider v-model="form.reply_probability" :min="0" :max="100" show-input style="width: 100%" />
          <div class="form-tip">收到消息后回复的概率，100表示必定回复</div>
        </el-form-item>
        <el-form-item label="自动回复" prop="auto_reply">
          <el-switch v-model="form.auto_reply" />
          <span style="margin-left: 10px; color: #909399; font-size: 12px">关闭后将不会自动回复群消息</span>
        </el-form-item>
        <el-form-item label="图片识别" prop="enable_image_recognition">
          <el-switch v-model="form.enable_image_recognition" />
          <span style="margin-left: 10px; color: #909399; font-size: 12px">开启后AI可以识别和理解群里的图片（消耗更多token）</span>
        </el-form-item>
        <el-form-item label="拆分多条消息" prop="split_by_newline">
          <el-switch v-model="form.split_by_newline" />
          <span style="margin-left: 10px; color: #909399; font-size: 12px">AI回复包含换行时拆分成多条消息发送</span>
        </el-form-item>
        <el-form-item label="多消息间隔(秒)" prop="multi_msg_interval" v-if="form.split_by_newline">
          <el-input-number v-model="form.multi_msg_interval" :min="1" :max="30" style="width: 100%" />
          <div class="form-tip">拆分后每条消息之间的发送间隔</div>
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
  loginAccount
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

const form = reactive({
  phone_number: '',
  api_id: 0,
  api_hash: '',
  ai_api_key: '',
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

const rules = {
  phone_number: [{ required: true, message: '请输入手机号', trigger: 'blur' }],
  api_id: [{ required: true, message: '请输入API ID', trigger: 'blur' }],
  api_hash: [{ required: true, message: '请输入API Hash', trigger: 'blur' }],
  ai_api_key: [{ required: true, message: '请输入AI API Key', trigger: 'blur' }]
}

let editingId = null

// 登录认证相关状态
const authDialogVisible = ref(false)
const authLoading = ref(false)
const authAccount = ref(null)
const authStatus = ref({
  state: 'none',
  message: ''
})
const authCode = ref('')
const authPassword = ref('')

const loadAuthStatus = async (accountId) => {
  try {
    const res = await getAuthStatus(accountId)
    authStatus.value = res
  } catch (error) {
    console.error('获取认证状态失败:', error)
    ElMessage.error('获取认证状态失败')
  }
}

const loadAccounts = async () => {
  loading.value = true
  try {
    const params = {
      page: pagination.page,
      page_size: pagination.pageSize
    }
    if (searchText.value) {
      params.search = searchText.value
    }
    if (statusFilter.value) {
      params.status = statusFilter.value
    }

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
    api_id: row.api_id,
    api_hash: row.api_hash,
    ai_api_key: row.ai_api_key,
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
    priority: row.priority,
    enabled: row.enabled
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
    await ElMessageBox.confirm('确定要删除这个账号吗？', '提示', {
      type: 'warning'
    })
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
    ElMessage.success('登录请求已提交')

    // 打开认证对话框，让用户输入验证码/密码
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

const resetForm = () => {
  Object.assign(form, {
    phone_number: '',
    api_id: 0,
    api_hash: '',
    ai_api_key: '',
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
  if (formRef.value) {
    formRef.value.resetFields()
  }
}

const handleSubmitCode = async () => {
  if (!authAccount.value) return
  if (!authCode.value) {
    ElMessage.error('请输入验证码')
    return
  }
  authLoading.value = true
  try {
    await submitAuthCode(authAccount.value.id, { code: authCode.value })
    ElMessage.success('验证码已提交')
    await loadAuthStatus(authAccount.value.id)
  } catch (error) {
    console.error('提交验证码失败:', error)
    ElMessage.error(error.response?.data?.error || '提交验证码失败')
  } finally {
    authLoading.value = false
  }
}

const handleSubmitPassword = async () => {
  if (!authAccount.value) return
  if (!authPassword.value) {
    ElMessage.error('请输入2FA密码')
    return
  }
  authLoading.value = true
  try {
    await submitAuthPassword(authAccount.value.id, { password: authPassword.value })
    ElMessage.success('密码已提交')
    await loadAuthStatus(authAccount.value.id)
  } catch (error) {
    console.error('提交密码失败:', error)
    ElMessage.error(error.response?.data?.error || '提交密码失败')
  } finally {
    authLoading.value = false
  }
}

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN')
}

onMounted(() => {
  loadAccounts()
})
</script>

<style scoped>
.accounts {
  padding: 20px;
}

.form-tip {
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
  margin-top: 4px;
}
</style>

