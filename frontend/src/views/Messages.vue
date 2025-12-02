<template>
  <div class="messages">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>消息记录</span>
          <el-button type="primary" @click="handleSendMessage">发送消息</el-button>
        </div>
      </template>

      <!-- 筛选栏 -->
      <div class="filter-bar">
        <el-select
          v-model="filters.account_id"
          placeholder="选择账号"
          style="width: 200px"
          clearable
          @change="loadMessages"
        >
          <el-option
            v-for="account in accounts"
            :key="account.id"
            :label="account.nickname || account.phone_number"
            :value="account.id"
          />
        </el-select>
        <el-select
          v-model="filters.group_id"
          placeholder="选择群组"
          style="width: 200px; margin-left: 10px"
          clearable
          @change="loadMessages"
        >
          <el-option
            v-for="group in groups"
            :key="group.id"
            :label="group.title"
            :value="group.id"
          />
        </el-select>
        <el-date-picker
          v-model="dateRange"
          type="datetimerange"
          range-separator="至"
          start-placeholder="开始时间"
          end-placeholder="结束时间"
          style="margin-left: 10px"
          @change="handleDateChange"
        />
        <el-input
          v-model="filters.search"
          placeholder="搜索消息内容"
          style="width: 200px; margin-left: 10px"
          clearable
          @clear="loadMessages"
          @keyup.enter="loadMessages"
        >
          <template #append>
            <el-button @click="loadMessages">搜索</el-button>
          </template>
        </el-input>
      </div>

      <!-- 消息表格 -->
      <el-table
        v-loading="loading"
        :data="messages"
        style="width: 100%; margin-top: 20px"
        stripe
        max-height="600"
      >
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column label="账号" width="150">
          <template #default="{ row }">
            {{ row.account?.nickname || row.account?.phone_number || '未知' }}
          </template>
        </el-table-column>
        <el-table-column label="群组" width="150">
          <template #default="{ row }">
            {{ row.group?.title || '未知' }}
          </template>
        </el-table-column>
        <el-table-column prop="content" label="内容" min-width="300" show-overflow-tooltip />
        <el-table-column prop="topic" label="话题" width="120" />
        <el-table-column prop="sentiment" label="情感" width="100">
          <template #default="{ row }">
            <el-tag
              v-if="row.sentiment"
              :type="
                row.sentiment === 'positive'
                  ? 'success'
                  : row.sentiment === 'negative'
                  ? 'danger'
                  : 'info'
              "
              size="small"
            >
              {{ row.sentiment === 'positive' ? '正面' : row.sentiment === 'negative' ? '负面' : '中性' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[20, 50, 100, 200]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="loadMessages"
          @current-change="loadMessages"
        />
      </div>
    </el-card>

    <!-- 发送消息对话框 -->
    <el-dialog
      v-model="sendDialogVisible"
      title="发送消息"
      width="500px"
    >
      <el-form
        ref="sendFormRef"
        :model="sendForm"
        :rules="sendRules"
        label-width="100px"
      >
        <el-form-item label="账号" prop="account_id">
          <el-select v-model="sendForm.account_id" style="width: 100%">
            <el-option
              v-for="account in accounts"
              :key="account.id"
              :label="account.nickname || account.phone_number"
              :value="account.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="群组" prop="group_id">
          <el-select v-model="sendForm.group_id" style="width: 100%">
            <el-option
              v-for="group in groups"
              :key="group.id"
              :label="group.title"
              :value="group.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="消息内容" prop="content">
          <el-input
            v-model="sendForm.content"
            type="textarea"
            :rows="5"
            placeholder="输入要发送的消息"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="sendDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSendSubmit">发送</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getMessages, sendMessage } from '@/api/messages'
import { getAccounts } from '@/api/accounts'
import { getGroups } from '@/api/groups'

const messages = ref([])
const accounts = ref([])
const groups = ref([])
const loading = ref(false)
const sendDialogVisible = ref(false)
const sendFormRef = ref(null)
const dateRange = ref(null)

const pagination = reactive({
  page: 1,
  pageSize: 50,
  total: 0
})

const filters = reactive({
  account_id: null,
  group_id: null,
  start_time: '',
  end_time: '',
  search: ''
})

const sendForm = reactive({
  account_id: null,
  group_id: null,
  content: ''
})

const sendRules = {
  account_id: [{ required: true, message: '请选择账号', trigger: 'change' }],
  group_id: [{ required: true, message: '请选择群组', trigger: 'change' }],
  content: [{ required: true, message: '请输入消息内容', trigger: 'blur' }]
}

const loadMessages = async () => {
  loading.value = true
  try {
    const params = {
      page: pagination.page,
      page_size: pagination.pageSize
    }
    if (filters.account_id) {
      params.account_id = filters.account_id
    }
    if (filters.group_id) {
      params.group_id = filters.group_id
    }
    if (filters.start_time) {
      params.start_time = filters.start_time
    }
    if (filters.end_time) {
      params.end_time = filters.end_time
    }
    if (filters.search) {
      params.search = filters.search
    }

    const response = await getMessages(params)
    if (response.data) {
      messages.value = response.data
      pagination.total = response.total || 0
    }
  } catch (error) {
    console.error('获取消息列表失败:', error)
    ElMessage.error('获取消息列表失败')
  } finally {
    loading.value = false
  }
}

const loadAccounts = async () => {
  try {
    const response = await getAccounts({ page_size: 1000 })
    if (response.data) {
      accounts.value = response.data
    }
  } catch (error) {
    console.error('获取账号列表失败:', error)
  }
}

const loadGroups = async () => {
  try {
    const response = await getGroups({ page_size: 1000 })
    if (response.data) {
      groups.value = response.data
    }
  } catch (error) {
    console.error('获取群组列表失败:', error)
  }
}

const handleDateChange = (dates) => {
  if (dates && dates.length === 2) {
    filters.start_time = dates[0].toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).replace(/\//g, '-')
    filters.end_time = dates[1].toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).replace(/\//g, '-')
  } else {
    filters.start_time = ''
    filters.end_time = ''
  }
  loadMessages()
}

const handleSendMessage = () => {
  sendForm.account_id = null
  sendForm.group_id = null
  sendForm.content = ''
  sendDialogVisible.value = true
}

const handleSendSubmit = async () => {
  if (!sendFormRef.value) return

  await sendFormRef.value.validate(async (valid) => {
    if (valid) {
      try {
        await sendMessage(sendForm)
        ElMessage.success('消息发送成功')
        sendDialogVisible.value = false
        loadMessages()
      } catch (error) {
        console.error('发送失败:', error)
        ElMessage.error(error.response?.data?.error || '发送失败')
      }
    }
  })
}

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN')
}

onMounted(() => {
  loadMessages()
  loadAccounts()
  loadGroups()
})
</script>

<style scoped>
.messages {
  padding: 20px;
}
</style>

