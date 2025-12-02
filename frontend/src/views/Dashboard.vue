<template>
  <div class="dashboard">
    <el-row :gutter="20">
      <el-col :span="6">
        <el-card v-loading="loading">
          <div class="stat-item">
            <div class="stat-value">{{ stats.total_accounts || 0 }}</div>
            <div class="stat-label">AI账号总数</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card v-loading="loading">
          <div class="stat-item">
            <div class="stat-value">{{ stats.total_groups || 0 }}</div>
            <div class="stat-label">群组总数</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card v-loading="loading">
          <div class="stat-item">
            <div class="stat-value">{{ stats.today_messages || 0 }}</div>
            <div class="stat-label">今日发言数</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card v-loading="loading">
          <div class="stat-item">
            <div class="stat-value">{{ stats.online_accounts || 0 }}</div>
            <div class="stat-label">在线账号</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px">
      <el-col :span="24">
        <el-card>
          <template #header>
            <span>系统概览</span>
          </template>
          <div class="overview">
            <p>欢迎使用AI群营销工具！</p>
            <p>系统正在运行中...</p>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getStatistics } from '@/api/statistics'

const stats = ref({
  total_accounts: 0,
  total_groups: 0,
  today_messages: 0,
  online_accounts: 0,
})

const loading = ref(false)

const loadStatistics = async () => {
  loading.value = true
  try {
    const response = await getStatistics()
    if (response.data) {
      stats.value = response.data
    }
  } catch (error) {
    console.error('获取统计数据失败:', error)
    ElMessage.error('获取统计数据失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadStatistics()
  // 每30秒刷新一次
  setInterval(loadStatistics, 30000)
})
</script>

<style scoped>
.dashboard {
  padding: 20px;
}

.stat-item {
  text-align: center;
}

.stat-value {
  font-size: 32px;
  font-weight: bold;
  color: #409eff;
  margin-bottom: 10px;
}

.stat-label {
  font-size: 14px;
  color: #909399;
}

.overview {
  padding: 20px;
  text-align: center;
}
</style>

