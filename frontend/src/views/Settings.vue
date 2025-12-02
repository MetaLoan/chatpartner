<template>
  <div class="settings">
    <el-card>
      <template #header>
        <span>系统设置</span>
      </template>
      <el-tabs v-model="activeTab">
        <!-- 全局主线提示词 -->
        <el-tab-pane label="全局主线提示词" name="prompt">
          <el-form :model="promptForm" label-width="150px" style="margin-top: 20px">
            <el-form-item label="提示词内容">
              <el-input
                v-model="promptForm.content"
                type="textarea"
                :rows="10"
                placeholder="输入全局主线提示词，定义整体群营销的聊天框架和策略"
              />
            </el-form-item>
            <el-form-item label="描述">
              <el-input
                v-model="promptForm.description"
                placeholder="提示词的描述和说明"
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleSavePrompt">保存</el-button>
              <el-button @click="handlePreviewPrompt">预览</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 全局配置 -->
        <el-tab-pane label="全局配置" name="config">
          <el-form :model="configForm" label-width="150px" style="margin-top: 20px">
            <el-form-item label="默认发言间隔(秒)">
              <el-input-number
                v-model="configForm.default_reply_interval"
                :min="10"
                :max="3600"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item label="默认回复概率">
              <el-slider
                v-model="configForm.default_reply_probability"
                :min="0"
                :max="100"
                :step="1"
                show-input
                :format-tooltip="(val) => val + '%'"
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleSaveConfig">保存</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 预览对话框 -->
    <el-dialog
      v-model="previewDialogVisible"
      title="提示词预览"
      width="600px"
    >
      <div class="preview-content">
        <h4>提示词内容：</h4>
        <p>{{ promptForm.content }}</p>
        <el-divider />
        <h4>描述：</h4>
        <p>{{ promptForm.description || '无' }}</p>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
// TODO: 实现API调用
// import { getGlobalPrompt, updateGlobalPrompt } from '@/api/config'

const activeTab = ref('prompt')
const previewDialogVisible = ref(false)

const promptForm = reactive({
  content: '',
  description: ''
})

const configForm = reactive({
  default_reply_interval: 60,
  default_reply_probability: 30
})

const handleSavePrompt = async () => {
  if (!promptForm.content.trim()) {
    ElMessage.warning('请输入提示词内容')
    return
  }
  
  try {
    // TODO: 调用API保存
    // await updateGlobalPrompt(promptForm)
    ElMessage.success('保存成功')
  } catch (error) {
    console.error('保存失败:', error)
    ElMessage.error('保存失败')
  }
}

const handlePreviewPrompt = () => {
  if (!promptForm.content.trim()) {
    ElMessage.warning('请输入提示词内容')
    return
  }
  previewDialogVisible.value = true
}

const handleSaveConfig = async () => {
  try {
    // TODO: 调用API保存配置
    ElMessage.success('保存成功')
  } catch (error) {
    console.error('保存失败:', error)
    ElMessage.error('保存失败')
  }
}

const loadSettings = async () => {
  try {
    // TODO: 调用API加载设置
    // const prompt = await getGlobalPrompt()
    // if (prompt) {
    //   promptForm.content = prompt.content
    //   promptForm.description = prompt.description
    // }
  } catch (error) {
    console.error('加载设置失败:', error)
  }
}

onMounted(() => {
  loadSettings()
})
</script>

<style scoped>
.settings {
  padding: 20px;
}

.preview-content {
  padding: 10px;
}

.preview-content h4 {
  margin: 10px 0;
  color: #409eff;
}

.preview-content p {
  margin: 10px 0;
  line-height: 1.6;
  white-space: pre-wrap;
}
</style>

<style scoped>
.settings {
  padding: 20px;
}
</style>

