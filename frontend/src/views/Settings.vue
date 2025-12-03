<template>
  <div class="settings-container">
    <h2>系统设置</h2>
    
    <!-- 备份与恢复 -->
    <el-card class="settings-card">
      <template #header>
        <div class="card-header">
          <span>📦 配置备份与恢复</span>
        </div>
      </template>
      
      <div class="backup-section">
        <p class="description">
          导出所有配置，包括：AI账号设置、API密钥、Session登录状态、群组配置、信息池素材等。<br>
          备份文件可用于换电脑或重装系统后快速恢复。
        </p>
        
        <div class="button-group">
          <el-button type="primary" size="large" @click="handleExport" :loading="exporting">
            <el-icon><Download /></el-icon>
            导出全部配置
          </el-button>
          
          <el-upload
            ref="uploadRef"
            :auto-upload="false"
            :show-file-list="false"
            :on-change="handleFileChange"
            accept=".zip"
          >
            <el-button type="success" size="large">
              <el-icon><Upload /></el-icon>
              导入配置
            </el-button>
          </el-upload>
        </div>
      </div>
    </el-card>

    <!-- 导入预览对话框 -->
    <el-dialog v-model="previewDialogVisible" title="确认导入" width="500px">
      <div v-if="previewData" class="preview-content">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="备份时间">{{ formatDate(previewData.exportedAt) }}</el-descriptions-item>
          <el-descriptions-item label="版本">{{ previewData.version }}</el-descriptions-item>
          <el-descriptions-item label="账号数量">{{ previewData.accounts }}</el-descriptions-item>
          <el-descriptions-item label="群组数量">{{ previewData.groups }}</el-descriptions-item>
          <el-descriptions-item label="信息源">{{ previewData.infoSources }}</el-descriptions-item>
          <el-descriptions-item label="信息条目">{{ previewData.infoItems }}</el-descriptions-item>
          <el-descriptions-item label="账号模板">{{ previewData.accountTemplates || 0 }}</el-descriptions-item>
          <el-descriptions-item label="Session文件">{{ previewData.sessionFiles }}</el-descriptions-item>
          <el-descriptions-item label="上传图片">{{ previewData.uploadFiles }}</el-descriptions-item>
        </el-descriptions>
        
        <el-divider />
        
        <el-checkbox v-model="clearExisting">
          清空现有数据后导入（推荐）
        </el-checkbox>
        <p class="warning-text" v-if="!clearExisting">
          ⚠️ 不清空现有数据可能导致重复或冲突
        </p>
      </div>
      
      <template #footer>
        <el-button @click="previewDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmImport" :loading="importing">
          确认导入
        </el-button>
      </template>
    </el-dialog>
    
    <!-- 系统信息 -->
    <el-card class="settings-card">
      <template #header>
        <div class="card-header">
          <span>ℹ️ 系统信息</span>
        </div>
      </template>
      
      <el-descriptions :column="1" border>
        <el-descriptions-item label="版本号">2.0.0</el-descriptions-item>
        <el-descriptions-item label="项目名称">ChatPartner - AI 炒群助手</el-descriptions-item>
        <el-descriptions-item label="后端状态">
          <el-tag :type="backendStatus ? 'success' : 'danger'">
            {{ backendStatus ? '在线' : '离线' }}
          </el-tag>
        </el-descriptions-item>
      </el-descriptions>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download, Upload } from '@element-plus/icons-vue'
import api from '@/api/index'

const exporting = ref(false)
const importing = ref(false)
const previewDialogVisible = ref(false)
const previewData = ref(null)
const clearExisting = ref(true)
const selectedFile = ref(null)
const backendStatus = ref(false)

// 检查后端状态
const checkBackend = async () => {
  try {
    await api.get('/health')
    backendStatus.value = true
  } catch (e) {
    backendStatus.value = false
  }
}

onMounted(() => {
  checkBackend()
})

// 格式化日期
const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN')
}

// 导出配置
const handleExport = async () => {
  exporting.value = true
  try {
    const response = await api.get('/backup/export', {
      responseType: 'blob'
    })
    
    // 创建下载链接
    const blob = new Blob([response.data], { type: 'application/zip' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    
    // 生成文件名（带时间戳）
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename = `chatpartner_backup_${timestamp}.zip`
    
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
    
    ElMessage.success('配置导出成功')
  } catch (error) {
    console.error('导出失败:', error)
    ElMessage.error('导出失败')
  } finally {
    exporting.value = false
  }
}

// 选择文件
const handleFileChange = async (file) => {
  selectedFile.value = file.raw
  
  // 预览备份内容
  try {
    const formData = new FormData()
    formData.append('backup', file.raw)
    
    const response = await api.post('/backup/preview', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    
    previewData.value = response.data
    previewDialogVisible.value = true
  } catch (error) {
    console.error('预览失败:', error)
    ElMessage.error('无效的备份文件')
    selectedFile.value = null
  }
}

// 确认导入
const confirmImport = async () => {
  if (!selectedFile.value) return
  
  importing.value = true
  try {
    const formData = new FormData()
    formData.append('backup', selectedFile.value)
    formData.append('clear_existing', clearExisting.value.toString())
    
    const response = await api.post('/backup/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    
    ElMessage.success(`导入成功！账号: ${response.data.accounts}, 群组: ${response.data.groups}`)
    previewDialogVisible.value = false
    selectedFile.value = null
    
    // 提示重启
    ElMessageBox.alert(
      '配置已导入成功，建议重启后端服务以加载新配置。',
      '导入完成',
      { type: 'success' }
    )
  } catch (error) {
    console.error('导入失败:', error)
    ElMessage.error('导入失败: ' + (error.response?.data?.error || error.message))
  } finally {
    importing.value = false
  }
}
</script>

<style scoped>
.settings-container {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

.settings-container h2 {
  margin-bottom: 20px;
  color: #303133;
}

.settings-card {
  margin-bottom: 20px;
}

.card-header {
  font-size: 16px;
  font-weight: bold;
}

.backup-section {
  padding: 10px 0;
}

.description {
  color: #606266;
  margin-bottom: 20px;
  line-height: 1.6;
}

.button-group {
  display: flex;
  gap: 16px;
}

.button-group .el-button {
  min-width: 150px;
}

.preview-content {
  padding: 10px 0;
}

.warning-text {
  color: #e6a23c;
  font-size: 12px;
  margin-top: 8px;
}
</style>
