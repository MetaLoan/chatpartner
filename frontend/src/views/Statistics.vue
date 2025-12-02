<template>
  <div class="statistics">
    <!-- 全局统计 -->
    <el-card style="margin-bottom: 20px">
      <template #header>
        <span>全局统计</span>
      </template>
      <el-row :gutter="20" v-loading="loading">
        <el-col :span="6">
          <div class="stat-item">
            <div class="stat-value">{{ globalStats.total_accounts || 0 }}</div>
            <div class="stat-label">账号总数</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-item">
            <div class="stat-value">{{ globalStats.online_accounts || 0 }}</div>
            <div class="stat-label">在线账号</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-item">
            <div class="stat-value">{{ globalStats.total_groups || 0 }}</div>
            <div class="stat-label">群组总数</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-item">
            <div class="stat-value">{{ globalStats.today_messages || 0 }}</div>
            <div class="stat-label">今日发言</div>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <!-- 发言趋势 -->
    <el-card style="margin-bottom: 20px">
      <template #header>
        <span>最近7天发言趋势</span>
      </template>
      <div style="height: 300px" v-loading="loading">
        <v-chart
          v-if="dailyTrend.length > 0"
          :option="trendOption"
          style="height: 100%"
        />
        <div v-else style="text-align: center; padding: 50px; color: #909399">
          暂无数据
        </div>
      </div>
    </el-card>

    <!-- 账号排行 -->
    <el-row :gutter="20">
      <el-col :span="12">
        <el-card>
          <template #header>
            <span>账号发言排行 (Top 10)</span>
          </template>
          <el-table
            :data="accountRanking"
            style="width: 100%"
            v-loading="loading"
            stripe
          >
            <el-table-column type="index" label="排名" width="80" />
            <el-table-column prop="phone_number" label="手机号" />
            <el-table-column prop="nickname" label="昵称" />
            <el-table-column prop="count" label="发言数" width="100" align="right" />
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card>
          <template #header>
            <span>群组活跃度排行 (Top 10)</span>
          </template>
          <el-table
            :data="groupRanking"
            style="width: 100%"
            v-loading="loading"
            stripe
          >
            <el-table-column type="index" label="排名" width="80" />
            <el-table-column prop="title" label="群组名称" />
            <el-table-column prop="count" label="发言数" width="100" align="right" />
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent
} from 'echarts/components'
import VChart from 'vue-echarts'
import { getStatistics } from '@/api/statistics'

// 注册ECharts组件
use([
  CanvasRenderer,
  LineChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent
])

const loading = ref(false)
const globalStats = ref({})
const dailyTrend = ref([])
const accountRanking = ref([])
const groupRanking = ref([])

const trendOption = computed(() => {
  return {
    tooltip: {
      trigger: 'axis'
    },
    xAxis: {
      type: 'category',
      data: dailyTrend.value.map(item => item.date)
    },
    yAxis: {
      type: 'value',
      name: '发言数'
    },
    series: [
      {
        name: '发言数',
        type: 'line',
        data: dailyTrend.value.map(item => item.count),
        smooth: true,
        areaStyle: {}
      }
    ]
  }
})

const loadStatistics = async () => {
  loading.value = true
  try {
    const response = await getStatistics()
    if (response.data) {
      globalStats.value = {
        total_accounts: response.data.total_accounts,
        online_accounts: response.data.online_accounts,
        total_groups: response.data.total_groups,
        today_messages: response.data.today_messages
      }
      dailyTrend.value = response.data.daily_trend || []
      accountRanking.value = response.data.account_ranking || []
      groupRanking.value = response.data.group_ranking || []
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
  // 每60秒刷新一次
  setInterval(loadStatistics, 60000)
})
</script>

<style scoped>
.statistics {
  padding: 20px;
}

.stat-item {
  text-align: center;
  padding: 20px;
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
</style>

<style scoped>
.statistics {
  padding: 20px;
}

.stats-content {
  padding: 20px;
  text-align: center;
}
</style>

