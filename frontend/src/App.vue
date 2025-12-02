<template>
  <el-container class="app-container">
    <el-header class="app-header">
      <div class="header-content">
        <h1>🤖 AI群营销工具</h1>
        <el-menu
          mode="horizontal"
          :default-active="activeMenu"
          router
          class="header-menu"
        >
          <el-menu-item index="/dashboard">仪表盘</el-menu-item>
          <el-menu-item index="/accounts">账号管理</el-menu-item>
          <el-menu-item index="/groups">群组管理</el-menu-item>
          <el-menu-item index="/messages">消息记录</el-menu-item>
          <el-menu-item index="/statistics">数据统计</el-menu-item>
          <el-menu-item index="/settings">系统设置</el-menu-item>
        </el-menu>
      </div>
    </el-header>
    <el-main class="app-main">
      <router-view />
    </el-main>
  </el-container>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const activeMenu = computed(() => route.path)
</script>

<style scoped>
.app-container {
  height: 100vh;
}

.app-header {
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  padding: 0;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  padding: 0 20px;
}

.header-content h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.header-menu {
  border-bottom: none;
}

.app-main {
  background: #f5f7fa;
  padding: 20px;
}
</style>

