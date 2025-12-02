<template>
  <div class="info-pool">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>公共信息池管理</span>
          <div>
            <el-button type="primary" @click="handleAddSource">添加信息源</el-button>
            <el-button @click="loadStats">刷新统计</el-button>
          </div>
        </div>
      </template>

      <!-- 统计信息 -->
      <el-row :gutter="20" class="stats-row">
        <el-col :span="6">
          <el-statistic title="信息源总数" :value="stats.totalSources" />
        </el-col>
        <el-col :span="6">
          <el-statistic title="已启用" :value="stats.enabledSources" />
        </el-col>
        <el-col :span="6">
          <el-statistic title="可用内容" :value="stats.availableItems" />
        </el-col>
        <el-col :span="6">
          <el-statistic title="已使用" :value="stats.usedItems" />
        </el-col>
      </el-row>

      <!-- 信息源列表 -->
      <el-divider content-position="left">信息源配置</el-divider>
      
      <el-table :data="sources" style="width: 100%" v-loading="loading">
        <el-table-column prop="name" label="名称" width="150" />
        <el-table-column prop="type" label="类型" width="120">
          <template #default="{ row }">
            <el-tag :type="getTypeColor(row.type)">{{ getTypeName(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="work_mode" label="工作方式" width="100">
          <template #default="{ row }">
            <el-tag :type="row.work_mode === 'forward' ? 'info' : 'success'" size="small">
              {{ row.work_mode === 'forward' ? '直接转发' : '输出观点' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="reusable" label="可复用" width="80">
          <template #default="{ row }">
            <el-tag :type="row.reusable ? 'success' : 'info'" size="small">
              {{ row.reusable ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="item_count" label="内容数" width="80" />
        <el-table-column prop="fetch_interval" label="拉取间隔" width="100">
          <template #default="{ row }">
            {{ formatInterval(row.fetch_interval) }}
          </template>
        </el-table-column>
        <el-table-column prop="enabled" label="状态" width="80">
          <template #default="{ row }">
            <el-switch v-model="row.enabled" @change="handleToggleSource(row)" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <el-button size="small" @click="handleEditSource(row)">编辑</el-button>
            <el-button size="small" type="success" @click="handleFetchSource(row)">拉取</el-button>
            <el-button size="small" type="danger" @click="handleDeleteSource(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 内容列表 -->
      <el-divider content-position="left">内容列表</el-divider>

      <div class="filter-bar">
        <el-select v-model="itemFilter.sourceId" placeholder="选择信息源" clearable @change="loadItems">
          <el-option v-for="s in sources" :key="s.id" :label="s.name" :value="s.id" />
        </el-select>
        <el-select v-model="itemFilter.expired" placeholder="过期状态" clearable @change="loadItems" style="margin-left: 10px;">
          <el-option label="未过期" :value="false" />
          <el-option label="已过期" :value="true" />
        </el-select>
        <el-button style="margin-left: 10px;" @click="handleAddManualText" v-if="hasManualTextSource">
          添加文字
        </el-button>
        <el-button @click="handleAddManualImage" v-if="hasManualImageSource">
          添加图片
        </el-button>
      </div>

      <el-table :data="items" style="width: 100%; margin-top: 10px;" v-loading="itemsLoading">
        <el-table-column prop="source_name" label="来源" width="120" />
        <el-table-column prop="title" label="标题" width="200" show-overflow-tooltip />
        <el-table-column prop="content" label="内容" show-overflow-tooltip>
          <template #default="{ row }">
            <div v-if="row.content_type === 'image'" class="image-preview">
              <el-image 
                :src="`/api/v1/info-pool/uploads/${row.image_path}`" 
                style="width: 60px; height: 60px; object-fit: cover;"
                :preview-src-list="[`/api/v1/info-pool/uploads/${row.image_path}`]"
              />
              <span v-if="row.content" class="image-caption">{{ row.content }}</span>
            </div>
            <span v-else>{{ row.content }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="usages" label="使用情况" width="150">
          <template #default="{ row }">
            <el-tag v-if="row.usages.length === 0" type="success" size="small">未使用</el-tag>
            <el-tooltip v-else :content="row.usages.map(u => u.account_name).join(', ')">
              <el-tag type="warning" size="small">已用 {{ row.usages.length }} 次</el-tag>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column prop="published_at" label="发布时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.published_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <el-button size="small" @click="handleClearUsage(row)" v-if="row.usages.length > 0">
              清除标记
            </el-button>
            <el-button size="small" type="danger" @click="handleDeleteItem(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="itemPagination.page"
        v-model:page-size="itemPagination.pageSize"
        :total="itemPagination.total"
        layout="total, prev, pager, next"
        @current-change="loadItems"
        style="margin-top: 20px; justify-content: flex-end;"
      />
    </el-card>

    <!-- 信息源编辑对话框 -->
    <el-dialog v-model="sourceDialogVisible" :title="sourceDialogTitle" width="500px">
      <el-form :model="sourceForm" label-width="100px">
        <el-form-item label="名称" required>
          <el-input v-model="sourceForm.name" placeholder="信息源名称" />
        </el-form-item>
        <el-form-item label="类型" required>
          <el-select v-model="sourceForm.type" style="width: 100%" :disabled="!!editingSourceId">
            <el-option label="RSS订阅" value="rss" />
            <el-option label="BTC价格" value="btc_price" />
            <el-option label="ETH价格" value="eth_price" />
            <el-option label="手动文字" value="manual_text" />
            <el-option label="手动图片" value="manual_image" />
          </el-select>
        </el-form-item>
        <el-form-item label="RSS地址" v-if="sourceForm.type === 'rss'">
          <el-input v-model="sourceForm.rss_url" placeholder="https://example.com/rss.xml" />
        </el-form-item>
        <el-form-item label="工作方式">
          <el-radio-group v-model="sourceForm.work_mode">
            <el-radio value="forward">直接转发</el-radio>
            <el-radio value="comment">输出观点</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="可复用">
          <el-switch v-model="sourceForm.reusable" />
          <div class="form-tip">开启后，已使用的内容可被其他账号再次使用</div>
        </el-form-item>
        <el-form-item label="拉取间隔" v-if="['rss', 'btc_price', 'eth_price'].includes(sourceForm.type)">
          <el-input-number v-model="sourceForm.fetch_interval" :min="60" :max="86400" />
          <span style="margin-left: 10px;">秒</span>
        </el-form-item>
        <el-form-item label="过期时间">
          <el-input-number v-model="sourceForm.expire_hours" :min="0" :max="720" />
          <span style="margin-left: 10px;">小时 (0表示不过期)</span>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="sourceForm.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="sourceDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSaveSource">保存</el-button>
      </template>
    </el-dialog>

    <!-- 添加手动文字对话框 -->
    <el-dialog v-model="textDialogVisible" title="添加文字内容" width="500px">
      <el-form :model="textForm" label-width="80px">
        <el-form-item label="信息源">
          <el-select v-model="textForm.source_id" style="width: 100%">
            <el-option 
              v-for="s in sources.filter(s => s.type === 'manual_text')" 
              :key="s.id" 
              :label="s.name" 
              :value="s.id" 
            />
          </el-select>
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-model="textForm.title" placeholder="可选" />
        </el-form-item>
        <el-form-item label="内容" required>
          <el-input v-model="textForm.content" type="textarea" :rows="5" placeholder="输入要发送的文字内容" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="textDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSaveText">添加</el-button>
      </template>
    </el-dialog>

    <!-- 添加手动图片对话框 -->
    <el-dialog v-model="imageDialogVisible" title="批量添加图片" width="600px">
      <el-form :model="imageForm" label-width="80px">
        <el-form-item label="信息源">
          <el-select v-model="imageForm.source_id" style="width: 100%">
            <el-option 
              v-for="s in sources.filter(s => s.type === 'manual_image')" 
              :key="s.id" 
              :label="s.name" 
              :value="s.id" 
            />
          </el-select>
        </el-form-item>
        <el-form-item label="图片" required>
          <el-upload
            ref="uploadRef"
            :auto-upload="false"
            :limit="50"
            multiple
            accept="image/*"
            :file-list="selectedImages"
            :on-change="handleImageChange"
            :on-remove="handleImageRemove"
            list-type="picture-card"
          >
            <el-icon><Plus /></el-icon>
            <template #tip>
              <div class="el-upload__tip">支持批量选择，最多50张图片（jpg/png/gif）</div>
            </template>
          </el-upload>
        </el-form-item>
      </el-form>
      <template #footer>
        <span style="float: left; color: #909399;">已选择 {{ selectedImages.length }} 张图片</span>
        <el-button @click="imageDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSaveImages" :loading="uploadLoading">
          批量上传
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import api from '@/api/index'

// 统计数据
const stats = reactive({
  totalSources: 0,
  enabledSources: 0,
  totalItems: 0,
  availableItems: 0,
  usedItems: 0
})

// 信息源列表
const sources = ref([])
const loading = ref(false)

// 内容列表
const items = ref([])
const itemsLoading = ref(false)
const itemFilter = reactive({
  sourceId: null,
  expired: null
})
const itemPagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
})

// 信息源对话框
const sourceDialogVisible = ref(false)
const sourceDialogTitle = ref('添加信息源')
const editingSourceId = ref(null)
const sourceForm = reactive({
  name: '',
  type: 'rss',
  rss_url: '',
  work_mode: 'comment',
  reusable: false,
  fetch_interval: 300,
  expire_hours: 24,
  enabled: true
})

// 手动文字对话框
const textDialogVisible = ref(false)
const textForm = reactive({
  source_id: null,
  title: '',
  content: ''
})

// 手动图片对话框
const imageDialogVisible = ref(false)
const imageForm = reactive({
  source_id: null
})
const selectedImages = ref([])
const uploadLoading = ref(false)

// 计算属性
const hasManualTextSource = computed(() => sources.value.some(s => s.type === 'manual_text'))
const hasManualImageSource = computed(() => sources.value.some(s => s.type === 'manual_image'))

// 加载数据
const loadStats = async () => {
  try {
    const res = await api.get('/info-pool/stats')
    Object.assign(stats, res.data)
  } catch (error) {
    console.error('加载统计失败:', error)
  }
}

const loadSources = async () => {
  loading.value = true
  try {
    const res = await api.get('/info-pool/sources')
    sources.value = res.data
  } catch (error) {
    console.error('加载信息源失败:', error)
    ElMessage.error('加载信息源失败')
  } finally {
    loading.value = false
  }
}

const loadItems = async () => {
  itemsLoading.value = true
  try {
    const params = {
      page: itemPagination.page,
      page_size: itemPagination.pageSize
    }
    if (itemFilter.sourceId) params.source_id = itemFilter.sourceId
    if (itemFilter.expired !== null) params.expired = itemFilter.expired
    
    const res = await api.get('/info-pool/items', { params })
    items.value = res.data
    itemPagination.total = res.total
  } catch (error) {
    console.error('加载内容失败:', error)
    ElMessage.error('加载内容失败')
  } finally {
    itemsLoading.value = false
  }
}

// 信息源操作
const handleAddSource = () => {
  editingSourceId.value = null
  sourceDialogTitle.value = '添加信息源'
  Object.assign(sourceForm, {
    name: '',
    type: 'rss',
    rss_url: '',
    work_mode: 'comment',
    reusable: false,
    fetch_interval: 300,
    expire_hours: 24,
    enabled: true
  })
  sourceDialogVisible.value = true
}

const handleEditSource = (row) => {
  editingSourceId.value = row.id
  sourceDialogTitle.value = '编辑信息源'
  Object.assign(sourceForm, {
    name: row.name,
    type: row.type,
    rss_url: row.rss_url || '',
    work_mode: row.work_mode,
    reusable: row.reusable,
    fetch_interval: row.fetch_interval,
    expire_hours: row.expire_hours,
    enabled: row.enabled
  })
  sourceDialogVisible.value = true
}

const handleSaveSource = async () => {
  try {
    if (editingSourceId.value) {
      await api.put(`/info-pool/sources/${editingSourceId.value}`, sourceForm)
      ElMessage.success('更新成功')
    } else {
      await api.post('/info-pool/sources', sourceForm)
      ElMessage.success('创建成功')
    }
    sourceDialogVisible.value = false
    loadSources()
    loadStats()
  } catch (error) {
    console.error('保存失败:', error)
    ElMessage.error('保存失败')
  }
}

const handleToggleSource = async (row) => {
  try {
    await api.put(`/info-pool/sources/${row.id}`, { enabled: row.enabled })
    ElMessage.success(row.enabled ? '已启用' : '已停用')
  } catch (error) {
    console.error('切换失败:', error)
    row.enabled = !row.enabled
    ElMessage.error('操作失败')
  }
}

const handleFetchSource = async (row) => {
  try {
    await api.post(`/info-pool/sources/${row.id}/fetch`)
    ElMessage.success('拉取完成')
    loadSources()
    loadItems()
    loadStats()
  } catch (error) {
    console.error('拉取失败:', error)
    ElMessage.error('拉取失败')
  }
}

const handleDeleteSource = async (row) => {
  try {
    await ElMessageBox.confirm(`确定要删除信息源 "${row.name}" 吗？相关内容也会被删除。`, '确认删除', { type: 'warning' })
    await api.delete(`/info-pool/sources/${row.id}`)
    ElMessage.success('删除成功')
    loadSources()
    loadItems()
    loadStats()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除失败:', error)
      ElMessage.error('删除失败')
    }
  }
}

// 内容操作
const handleClearUsage = async (row) => {
  try {
    await api.post(`/info-pool/items/${row.id}/clear-usage`)
    ElMessage.success('已清除使用标记')
    loadItems()
    loadStats()
  } catch (error) {
    console.error('清除失败:', error)
    ElMessage.error('清除失败')
  }
}

const handleDeleteItem = async (row) => {
  try {
    await ElMessageBox.confirm('确定要删除这条内容吗？', '确认删除', { type: 'warning' })
    await api.delete(`/info-pool/items/${row.id}`)
    ElMessage.success('删除成功')
    loadItems()
    loadStats()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除失败:', error)
      ElMessage.error('删除失败')
    }
  }
}

// 手动添加文字
const handleAddManualText = () => {
  const manualTextSource = sources.value.find(s => s.type === 'manual_text')
  if (!manualTextSource) {
    ElMessage.warning('请先添加一个"手动文字"类型的信息源')
    return
  }
  textForm.source_id = manualTextSource.id
  textForm.title = ''
  textForm.content = ''
  textDialogVisible.value = true
}

const handleSaveText = async () => {
  if (!textForm.source_id || !textForm.content) {
    ElMessage.warning('请填写必填项')
    return
  }
  try {
    await api.post('/info-pool/items/text', textForm)
    ElMessage.success('添加成功')
    textDialogVisible.value = false
    loadItems()
    loadStats()
  } catch (error) {
    console.error('添加失败:', error)
    ElMessage.error('添加失败')
  }
}

// 手动添加图片
const handleAddManualImage = () => {
  const manualImageSource = sources.value.find(s => s.type === 'manual_image')
  if (!manualImageSource) {
    ElMessage.warning('请先添加一个"手动图片"类型的信息源')
    return
  }
  imageForm.source_id = manualImageSource.id
  selectedImages.value = []
  imageDialogVisible.value = true
}

const handleImageChange = (file, fileList) => {
  selectedImages.value = fileList
}

const handleImageRemove = (file, fileList) => {
  selectedImages.value = fileList
}

const handleSaveImages = async () => {
  if (!imageForm.source_id) {
    ElMessage.warning('请选择信息源')
    return
  }
  if (selectedImages.value.length === 0) {
    ElMessage.warning('请选择至少一张图片')
    return
  }
  
  uploadLoading.value = true
  let successCount = 0
  let failCount = 0
  
  try {
    for (const file of selectedImages.value) {
      try {
        const formData = new FormData()
        formData.append('source_id', imageForm.source_id)
        formData.append('image', file.raw)
        
        await api.post('/info-pool/items/image', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
        successCount++
      } catch (error) {
        console.error('上传失败:', file.name, error)
        failCount++
      }
    }
    
    if (failCount === 0) {
      ElMessage.success(`成功上传 ${successCount} 张图片`)
    } else {
      ElMessage.warning(`上传完成：成功 ${successCount} 张，失败 ${failCount} 张`)
    }
    
    imageDialogVisible.value = false
    selectedImages.value = []
    loadItems()
    loadStats()
  } catch (error) {
    console.error('批量上传失败:', error)
    ElMessage.error('批量上传失败')
  } finally {
    uploadLoading.value = false
  }
}

// 工具函数
const getTypeName = (type) => {
  const names = {
    rss: 'RSS订阅',
    btc_price: 'BTC价格',
    eth_price: 'ETH价格',
    manual_text: '手动文字',
    manual_image: '手动图片'
  }
  return names[type] || type
}

const getTypeColor = (type) => {
  const colors = {
    rss: 'primary',
    btc_price: 'warning',
    eth_price: 'info',
    manual_text: 'success',
    manual_image: 'danger'
  }
  return colors[type] || ''
}

const formatInterval = (seconds) => {
  if (seconds < 60) return `${seconds}秒`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`
  return `${Math.floor(seconds / 3600)}小时`
}

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString('zh-CN')
}

// 初始化
onMounted(() => {
  loadStats()
  loadSources()
  loadItems()
})
</script>

<style scoped>
.info-pool {
  padding: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stats-row {
  margin-bottom: 20px;
}

.filter-bar {
  display: flex;
  align-items: center;
}

.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 5px;
}

.image-preview {
  display: flex;
  align-items: center;
  gap: 10px;
}

.image-caption {
  color: #606266;
  font-size: 13px;
}
</style>

