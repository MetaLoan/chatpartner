<template>
  <div class="groups">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>群组管理</span>
          <el-button type="primary" @click="handleAdd">添加群组</el-button>
        </div>
      </template>

      <!-- 搜索栏 -->
      <div class="search-bar">
        <el-input
          v-model="searchText"
          placeholder="搜索群组名称或用户名"
          style="width: 300px"
          clearable
          @clear="loadGroups"
          @keyup.enter="loadGroups"
        >
          <template #append>
            <el-button @click="loadGroups">搜索</el-button>
          </template>
        </el-input>
        <el-select
          v-model="statusFilter"
          placeholder="状态筛选"
          style="width: 150px; margin-left: 10px"
          clearable
          @change="loadGroups"
        >
          <el-option label="活跃" value="active" />
          <el-option label="非活跃" value="inactive" />
        </el-select>
      </div>

      <!-- 群组表格 -->
      <el-table
        v-loading="loading"
        :data="groups"
        style="width: 100%; margin-top: 20px"
        stripe
      >
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="title" label="群组名称" />
        <el-table-column prop="username" label="用户名" />
        <el-table-column prop="chat_id" label="群组ID" width="150" />
        <el-table-column prop="type" label="类型" width="100" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'">
              {{ row.status === 'active' ? '活跃' : '非活跃' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="300" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="handleEdit(row)">编辑</el-button>
            <el-button size="small" type="warning" @click="handleAssignAccounts(row)">
              分配账号
            </el-button>
            <el-button size="small" type="danger" @click="handleDelete(row)">
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
          @size-change="loadGroups"
          @current-change="loadGroups"
        />
      </div>
    </el-card>

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
        <el-form-item label="群组ID" prop="chat_id">
          <el-input-number v-model="form.chat_id" :min="-999999999999" style="width: 100%" />
          <div class="form-tip">从Telegram获取的群组ID（负数）</div>
        </el-form-item>
        <el-form-item label="群组名称" prop="title">
          <el-input v-model="form.title" />
        </el-form-item>
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" placeholder="公开群组的用户名（可选）" />
        </el-form-item>
        <el-form-item label="类型" prop="type">
          <el-select v-model="form.type" style="width: 100%">
            <el-option label="群组" value="group" />
            <el-option label="超级群组" value="supergroup" />
            <el-option label="频道" value="channel" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-select v-model="form.status" style="width: 100%">
            <el-option label="活跃" value="active" />
            <el-option label="非活跃" value="inactive" />
          </el-select>
        </el-form-item>
        <el-form-item label="语言" prop="language">
          <el-input v-model="form.language" placeholder="如: zh-CN, en-US" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 分配账号对话框 -->
    <el-dialog
      v-model="assignDialogVisible"
      title="分配账号"
      width="500px"
    >
      <el-checkbox-group v-model="selectedAccountIds">
        <el-checkbox
          v-for="account in allAccounts"
          :key="account.id"
          :label="account.id"
        >
          {{ account.nickname || account.phone_number }}
          <el-tag size="small" style="margin-left: 10px">
            {{ account.status === 'online' ? '在线' : '离线' }}
          </el-tag>
        </el-checkbox>
      </el-checkbox-group>
      <template #footer>
        <el-button @click="assignDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleAssignSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  assignAccounts,
  getGroupAccounts
} from '@/api/groups'
import { getAccounts } from '@/api/accounts'

const groups = ref([])
const allAccounts = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const assignDialogVisible = ref(false)
const dialogTitle = ref('添加群组')
const formRef = ref(null)
const searchText = ref('')
const statusFilter = ref('')
const selectedAccountIds = ref([])
const currentGroupId = ref(null)

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
})

const form = reactive({
  chat_id: 0,
  title: '',
  username: '',
  type: 'group',
  status: 'active',
  language: ''
})

const rules = {
  chat_id: [{ required: true, message: '请输入群组ID', trigger: 'blur' }],
  title: [{ required: true, message: '请输入群组名称', trigger: 'blur' }]
}

let editingId = null

const loadGroups = async () => {
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

    const response = await getGroups(params)
    if (response.data) {
      groups.value = response.data
      pagination.total = response.total || 0
    }
  } catch (error) {
    console.error('获取群组列表失败:', error)
    ElMessage.error('获取群组列表失败')
  } finally {
    loading.value = false
  }
}

const loadAllAccounts = async () => {
  try {
    const response = await getAccounts({ page_size: 1000 })
    if (response.data) {
      allAccounts.value = response.data
    }
  } catch (error) {
    console.error('获取账号列表失败:', error)
  }
}

const handleAdd = () => {
  dialogTitle.value = '添加群组'
  editingId = null
  resetForm()
  dialogVisible.value = true
}

const handleEdit = (row) => {
  dialogTitle.value = '编辑群组'
  editingId = row.id
  Object.assign(form, {
    chat_id: Number(row.chat_id) || 0,  // 确保是数字类型
    title: row.title || row.name,
    username: row.username || '',
    type: row.type || 'group',
    status: row.status || 'active',
    language: row.language || ''
  })
  dialogVisible.value = true
}

const handleAssignAccounts = async (row) => {
  currentGroupId.value = row.id
  selectedAccountIds.value = []
  
  // 加载当前群组的账号
  try {
    const response = await getGroupAccounts(row.id)
    if (response.data) {
      selectedAccountIds.value = response.data.map(acc => acc.id)
    }
  } catch (error) {
    console.error('获取群组账号失败:', error)
  }
  
  assignDialogVisible.value = true
}

const handleAssignSubmit = async () => {
  try {
    await assignAccounts(currentGroupId.value, selectedAccountIds.value)
    ElMessage.success('账号分配成功')
    assignDialogVisible.value = false
  } catch (error) {
    console.error('分配账号失败:', error)
    ElMessage.error('分配账号失败')
  }
}

const handleSubmit = async () => {
  if (!formRef.value) return

  await formRef.value.validate(async (valid) => {
    if (valid) {
      try {
        if (editingId) {
          await updateGroup(editingId, form)
          ElMessage.success('群组更新成功')
        } else {
          await createGroup(form)
          ElMessage.success('群组创建成功')
        }
        dialogVisible.value = false
        loadGroups()
      } catch (error) {
        console.error('保存失败:', error)
        ElMessage.error(error.response?.data?.error || '保存失败')
      }
    }
  })
}

const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm('确定要删除这个群组吗？', '提示', {
      type: 'warning'
    })
    await deleteGroup(row.id)
    ElMessage.success('删除成功')
    loadGroups()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除失败:', error)
      ElMessage.error('删除失败')
    }
  }
}

const resetForm = () => {
  Object.assign(form, {
    chat_id: 0,
    title: '',
    username: '',
    type: 'group',
    status: 'active',
    language: ''
  })
  if (formRef.value) {
    formRef.value.resetFields()
  }
}

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN')
}

onMounted(() => {
  loadGroups()
  loadAllAccounts()
})
</script>

<style scoped>
.groups {
  padding: 20px;
}
</style>

