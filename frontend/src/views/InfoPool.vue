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
        <el-table-column prop="allow_same_account_reuse" label="单号反复" width="90">
          <template #default="{ row }">
            <el-tag :type="row.allow_same_account_reuse ? 'warning' : 'info'" size="small">
              {{ row.allow_same_account_reuse ? '是' : '否' }}
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
        <el-button @click="handleBatchAddText" v-if="hasManualTextSource" type="success">
          批量添加文字
        </el-button>
        <el-button @click="handleAddManualImage" v-if="hasManualImageSource">
          添加图片
        </el-button>
        <el-button @click="handleAddCryptoFromList" v-if="hasCryptoPriceSource" type="primary">
          添加币种
        </el-button>
        <el-button @click="handleAddAllCrypto" v-if="hasCryptoPriceSource" type="warning">
          添加全部预设币种
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
            <el-option label="实时币价" value="crypto_price" />
            <el-option label="BTC价格（旧）" value="btc_price" disabled />
            <el-option label="ETH价格（旧）" value="eth_price" disabled />
            <el-option label="手动文字" value="manual_text" />
            <el-option label="手动图片" value="manual_image" />
            <el-option label="晒单图" value="contract_image" />
          </el-select>
        </el-form-item>
        <el-form-item label="RSS地址" v-if="sourceForm.type === 'rss'">
          <el-input v-model="sourceForm.rss_url" placeholder="https://example.com/rss.xml" />
        </el-form-item>
        
        <!-- 实时币价配置 -->
        <el-form-item label="历史堆栈大小" v-if="sourceForm.type === 'crypto_price'">
          <el-input-number v-model="sourceForm.history_size" :min="3" :max="20" />
          <span style="margin-left: 10px;">条（保留最近N条历史价格快照供AI分析趋势）</span>
        </el-form-item>
        <el-form-item label="堆栈间隔时长" v-if="sourceForm.type === 'crypto_price'">
          <el-input-number v-model="sourceForm.history_interval" :min="1" :max="1440" />
          <span style="margin-left: 10px;">分钟（每隔N分钟记录一次价格快照到历史堆栈，同时也是价格更新频率）</span>
        </el-form-item>
        <el-alert v-if="sourceForm.type === 'crypto_price'" type="info" :closable="false" style="margin-bottom: 15px;">
          创建信息源后，需要在信息源列表中点击"添加币种"按钮来添加要监控的币种
        </el-alert>
        
        <el-form-item label="API接口地址" v-if="sourceForm.type === 'contract_image'" required>
          <el-input v-model="sourceForm.api_url" placeholder="http://localhost:3000/api/generate" />
          <div class="form-tip">晒单图生成API的完整地址</div>
        </el-form-item>
        <el-form-item label="交易对" v-if="sourceForm.type === 'contract_image'" required>
          <el-input v-model="sourceForm.tradepair" placeholder="ETHUSDT 或 BTCUSDT" />
          <div class="form-tip">需要与API底图文件对应的交易对</div>
        </el-form-item>
        <el-form-item label="杠杆倍数" v-if="sourceForm.type === 'contract_image'" required>
          <el-checkbox-group v-model="sourceForm.leverage_options">
            <el-checkbox :label="50">50倍</el-checkbox>
            <el-checkbox :label="100">100倍</el-checkbox>
          </el-checkbox-group>
          <div class="form-tip">至少选择一个杠杆倍数，系统会随机选择</div>
        </el-form-item>
        <el-form-item v-if="sourceForm.type === 'contract_image'">
          <el-button 
            type="primary" 
            @click="handleTestContractImage"
            :loading="testingContractImage"
            :disabled="!sourceForm.api_url || !sourceForm.tradepair || !sourceForm.leverage_options || sourceForm.leverage_options.length === 0"
          >
            测试API
          </el-button>
        </el-form-item>
        <el-form-item label="开单时间范围" v-if="sourceForm.type === 'contract_image'">
          <el-input-number v-model="sourceForm.open_time_range_hours" :min="1" :max="720" />
          <span style="margin-left: 10px;">小时（最近xx小时内的随机时间）</span>
        </el-form-item>
        <el-form-item label="自动清理时间" v-if="sourceForm.type === 'contract_image'">
          <el-input-number v-model="sourceForm.cleanup_hours" :min="0" :max="720" />
          <span style="margin-left: 10px;">小时（超过xx小时的数据自动删除，0表示不清理）</span>
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
        <el-form-item label="单号反复">
          <el-switch v-model="sourceForm.allow_same_account_reuse" />
          <div class="form-tip">开启后，同一账号可反复使用同一条内容（无限循环）</div>
        </el-form-item>
        <el-form-item label="拉取间隔" v-if="['rss', 'btc_price', 'eth_price', 'contract_image'].includes(sourceForm.type)">
          <el-input-number v-model="sourceForm.fetch_interval" :min="20" :max="86400" />
          <span style="margin-left: 10px;">秒（建议20-50秒）</span>
        </el-form-item>
        <el-alert v-if="sourceForm.type === 'crypto_price'" type="warning" :closable="false" style="margin-bottom: 15px;">
          注意：实时币价的拉取间隔自动等于堆栈间隔时长
        </el-alert>
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

    <!-- 添加币种对话框 -->
    <el-dialog v-model="cryptoDialogVisible" title="添加币种" width="700px">
      <el-form :model="cryptoForm" label-width="100px">
        <el-form-item label="信息源">
          <el-select v-model="cryptoForm.source_id" style="width: 100%" @change="handleCryptoSourceChange">
            <el-option 
              v-for="s in sources.filter(s => s.type === 'crypto_price')" 
              :key="s.id" 
              :label="s.name" 
              :value="s.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="添加方式">
          <el-radio-group v-model="cryptoForm.addMode">
            <el-radio value="select">从预设列表选择</el-radio>
            <el-radio value="custom">输入自定义币种</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="选择币种" v-if="cryptoForm.addMode === 'select'">
          <el-select 
            v-model="cryptoForm.symbols" 
            multiple 
            filterable 
            placeholder="选择要监控的币种"
            style="width: 100%"
          >
            <el-option-group label="主流币">
              <el-option label="BTC - 比特币" value="BTC" :disabled="isSymbolAdded('BTC')" />
              <el-option label="ETH - 以太坊" value="ETH" :disabled="isSymbolAdded('ETH')" />
              <el-option label="BNB - 币安币" value="BNB" :disabled="isSymbolAdded('BNB')" />
              <el-option label="SOL - Solana" value="SOL" :disabled="isSymbolAdded('SOL')" />
              <el-option label="XRP - Ripple" value="XRP" :disabled="isSymbolAdded('XRP')" />
              <el-option label="ADA - Cardano" value="ADA" :disabled="isSymbolAdded('ADA')" />
              <el-option label="AVAX - Avalanche" value="AVAX" :disabled="isSymbolAdded('AVAX')" />
              <el-option label="DOT - Polkadot" value="DOT" :disabled="isSymbolAdded('DOT')" />
            </el-option-group>
            <el-option-group label="热门山寨币">
              <el-option label="DOGE - 狗狗币" value="DOGE" :disabled="isSymbolAdded('DOGE')" />
              <el-option label="SHIB - 柴犬币" value="SHIB" :disabled="isSymbolAdded('SHIB')" />
              <el-option label="MATIC - Polygon" value="MATIC" :disabled="isSymbolAdded('MATIC')" />
              <el-option label="LINK - Chainlink" value="LINK" :disabled="isSymbolAdded('LINK')" />
              <el-option label="UNI - Uniswap" value="UNI" :disabled="isSymbolAdded('UNI')" />
              <el-option label="ATOM - Cosmos" value="ATOM" :disabled="isSymbolAdded('ATOM')" />
              <el-option label="LTC - 莱特币" value="LTC" :disabled="isSymbolAdded('LTC')" />
              <el-option label="FTM - Fantom" value="FTM" :disabled="isSymbolAdded('FTM')" />
            </el-option-group>
            <el-option-group label="Layer 2">
              <el-option label="ARB - Arbitrum" value="ARB" :disabled="isSymbolAdded('ARB')" />
              <el-option label="OP - Optimism" value="OP" :disabled="isSymbolAdded('OP')" />
            </el-option-group>
            <el-option-group label="DeFi">
              <el-option label="AAVE - Aave" value="AAVE" :disabled="isSymbolAdded('AAVE')" />
              <el-option label="MKR - Maker" value="MKR" :disabled="isSymbolAdded('MKR')" />
              <el-option label="CRV - Curve" value="CRV" :disabled="isSymbolAdded('CRV')" />
              <el-option label="SUSHI - SushiSwap" value="SUSHI" :disabled="isSymbolAdded('SUSHI')" />
            </el-option-group>
            <el-option-group label="Meme币">
              <el-option label="PEPE - Pepe" value="PEPE" :disabled="isSymbolAdded('PEPE')" />
              <el-option label="BONK - Bonk" value="BONK" :disabled="isSymbolAdded('BONK')" />
              <el-option label="WIF - dogwifhat" value="WIF" :disabled="isSymbolAdded('WIF')" />
              <el-option label="FLOKI - Floki" value="FLOKI" :disabled="isSymbolAdded('FLOKI')" />
            </el-option-group>
            <el-option-group label="其他热门">
              <el-option label="APT - Aptos" value="APT" :disabled="isSymbolAdded('APT')" />
              <el-option label="SUI - Sui" value="SUI" :disabled="isSymbolAdded('SUI')" />
              <el-option label="TIA - Celestia" value="TIA" :disabled="isSymbolAdded('TIA')" />
              <el-option label="INJ - Injective" value="INJ" :disabled="isSymbolAdded('INJ')" />
            </el-option-group>
          </el-select>
        </el-form-item>
        <el-form-item label="自定义币种" v-if="cryptoForm.addMode === 'custom'">
          <el-input 
            v-model="cryptoForm.customSymbol" 
            placeholder="输入币种符号，如 PEPE（大写）"
            style="width: 100%"
          />
          <div class="form-tip" style="margin-top: 5px; color: #909399; font-size: 12px;">
            提示：请输入币种的交易符号（大写），系统会尝试从 Binance 获取价格。如：BTC, ETH, PEPE 等
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="cryptoDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSaveCrypto">批量添加</el-button>
      </template>
    </el-dialog>

    <!-- 批量添加文字对话框 -->
    <el-dialog v-model="batchTextDialogVisible" title="批量添加文字内容" width="600px">
      <el-form :model="batchTextForm" label-width="80px">
        <el-form-item label="信息源">
          <el-select v-model="batchTextForm.source_id" style="width: 100%">
            <el-option 
              v-for="s in sources.filter(s => s.type === 'manual_text')" 
              :key="s.id" 
              :label="s.name" 
              :value="s.id" 
            />
          </el-select>
        </el-form-item>
        <el-form-item label="内容" required>
          <el-input 
            v-model="batchTextForm.content" 
            type="textarea" 
            :rows="10" 
            placeholder="每行一条内容，支持批量添加多条文字"
          />
        </el-form-item>
        <div class="form-tip" style="margin-left: 80px; color: #909399; font-size: 12px;">
          提示：每行作为一条独立内容，空行会被忽略
        </div>
      </el-form>
      <template #footer>
        <el-button @click="batchTextDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSaveBatchText" :loading="batchTextLoading">
          批量添加
        </el-button>
      </template>
    </el-dialog>

    <!-- 测试晒单图API对话框 -->
    <el-dialog v-model="testContractImageDialogVisible" title="测试晒单图API" width="800px">
      <div v-if="testResult">
        <el-alert
          :type="testResult.success ? 'success' : 'error'"
          :title="testResult.success ? '测试成功' : '测试失败'"
          :description="testResult.message"
          show-icon
          :closable="false"
          style="margin-bottom: 20px;"
        />
        
        <el-divider content-position="left">请求信息</el-divider>
        <div style="background: #f5f5f5; padding: 10px; border-radius: 4px; margin-bottom: 20px;">
          <div><strong>请求URL:</strong></div>
          <div style="word-break: break-all; margin-top: 5px; color: #666;">{{ testResult.requestUrl }}</div>
        </div>
        
        <el-divider content-position="left">响应数据</el-divider>
        <el-scrollbar height="300px" style="background: #f5f5f5; padding: 10px; border-radius: 4px;">
          <pre style="margin: 0; white-space: pre-wrap; word-break: break-all;">{{ JSON.stringify(testResult.data, null, 2) }}</pre>
        </el-scrollbar>
        
        <div v-if="testResult.imageUrl || testResult.data?.image || testResult.data?.data?.image" style="margin-top: 20px;">
          <el-divider content-position="left">图片预览</el-divider>
          <div style="text-align: center;">
            <el-image
              :src="testResult.imageUrl || testResult.data?.image || testResult.data?.data?.image"
              style="max-width: 100%; max-height: 400px; border: 1px solid #ddd; border-radius: 4px;"
              :preview-src-list="[testResult.imageUrl || testResult.data?.image || testResult.data?.data?.image]"
              fit="contain"
            />
          </div>
          <div v-if="testResult.data?.params || testResult.data?.data?.params" style="margin-top: 10px; text-align: center; color: #666;">
            <div>开仓价: {{ (testResult.data?.params || testResult.data?.data?.params)?.entprice }}</div>
            <div>最新价: {{ (testResult.data?.params || testResult.data?.data?.params)?.lastprice }}</div>
            <div>收益率: <strong style="color: #67c23a;">{{ (testResult.data?.params || testResult.data?.data?.params)?.yield }}</strong></div>
          </div>
        </div>
      </div>
      <div v-else style="text-align: center; padding: 40px; color: #999;">
        点击"测试API"按钮开始测试
      </div>
      <template #footer>
        <el-button @click="testContractImageDialogVisible = false">关闭</el-button>
        <el-button type="primary" @click="handleTestContractImage" :loading="testingContractImage">
          重新测试
        </el-button>
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
  api_url: '',
  tradepair: '',
  leverage_options: [50, 100],
  open_time_range_hours: 24,
  cleanup_hours: 48,
  history_size: 5,
  history_interval: 30,
  work_mode: 'comment',
  reusable: false,
  allow_same_account_reuse: false,
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

// 币种对话框
const cryptoDialogVisible = ref(false)
const cryptoForm = reactive({
  source_id: null,
  symbols: [],
  addMode: 'select',
  customSymbol: ''
})
const addedSymbols = ref([]) // 已添加的币种列表

// 批量文字对话框
const batchTextDialogVisible = ref(false)
const batchTextLoading = ref(false)
const batchTextForm = reactive({
  source_id: null,
  content: ''
})

// 手动图片对话框
const imageDialogVisible = ref(false)
const imageForm = reactive({
  source_id: null
})
const selectedImages = ref([])
const uploadLoading = ref(false)

// 测试晒单图API
const testContractImageDialogVisible = ref(false)
const testingContractImage = ref(false)
const testResult = ref(null)

// 计算属性
const hasManualTextSource = computed(() => sources.value.some(s => s.type === 'manual_text'))
const hasManualImageSource = computed(() => sources.value.some(s => s.type === 'manual_image'))
const hasCryptoPriceSource = computed(() => sources.value.some(s => s.type === 'crypto_price'))

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
    api_url: '',
    tradepair: '',
    leverage_options: [50, 100],
    open_time_range_hours: 24,
    cleanup_hours: 48,
    work_mode: 'comment',
    reusable: false,
    allow_same_account_reuse: false,
    fetch_interval: 300,
    expire_hours: 24,
    enabled: true
  })
  sourceDialogVisible.value = true
}

const handleEditSource = (row) => {
  editingSourceId.value = row.id
  sourceDialogTitle.value = '编辑信息源'
  
  // 解析杠杆选项
  let leverageOptions = [50, 100]
  if (row.leverage_options) {
    try {
      leverageOptions = JSON.parse(row.leverage_options)
      if (!Array.isArray(leverageOptions)) {
        leverageOptions = [50, 100]
      }
    } catch {
      leverageOptions = [50, 100]
    }
  }
  
  Object.assign(sourceForm, {
    name: row.name,
    type: row.type,
    rss_url: row.rss_url || '',
    api_url: row.api_url || '',
    tradepair: row.tradepair || '',
    leverage_options: leverageOptions,
    open_time_range_hours: row.open_time_range_hours || 24,
    cleanup_hours: row.cleanup_hours || 48,
    history_size: row.history_size || 5,
    history_interval: row.history_interval || 30,
    work_mode: row.work_mode,
    reusable: row.reusable,
    allow_same_account_reuse: row.allow_same_account_reuse || false,
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

// 添加币种（从内容列表按钮）
const handleAddCryptoFromList = () => {
  const cryptoPriceSource = sources.value.find(s => s.type === 'crypto_price')
  if (!cryptoPriceSource) {
    ElMessage.warning('请先添加一个"实时币价"类型的信息源')
    return
  }
  cryptoForm.source_id = cryptoPriceSource.id
  cryptoForm.symbols = []
  cryptoForm.addMode = 'select'
  cryptoForm.customSymbol = ''
  loadAddedSymbols(cryptoPriceSource.id)
  cryptoDialogVisible.value = true
}

// 添加全部预设币种
const handleAddAllCrypto = async () => {
  const cryptoPriceSource = sources.value.find(s => s.type === 'crypto_price')
  if (!cryptoPriceSource) {
    ElMessage.warning('请先添加一个"实时币价"类型的信息源')
    return
  }
  
  try {
    // 所有预设币种
    const allSymbols = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'AVAX', 'DOT',
                       'DOGE', 'SHIB', 'MATIC', 'LINK', 'UNI', 'ATOM', 'LTC', 'FTM',
                       'ARB', 'OP', 'AAVE', 'MKR', 'CRV', 'SUSHI',
                       'PEPE', 'BONK', 'WIF', 'FLOKI', 'APT', 'SUI', 'TIA', 'INJ']
    
    const response = await api.post('/info-pool/items/crypto/batch', {
      source_id: cryptoPriceSource.id,
      symbols: allSymbols
    })
    ElMessage.success(`添加完成：成功${response.success}个，跳过${response.skipped}个，失败${response.failed}个`)
    loadItems()
    loadStats()
  } catch (error) {
    console.error('批量添加失败:', error)
    ElMessage.error('批量添加失败')
  }
}

// 加载已添加的币种
const loadAddedSymbols = async (sourceId) => {
  try {
    const res = await api.get('/info-pool/items', { 
      params: { source_id: sourceId }
    })
    addedSymbols.value = res.data
      .filter(item => item.content_type === 'price' && item.symbol)
      .map(item => item.symbol)
  } catch (error) {
    console.error('加载已添加币种失败:', error)
    addedSymbols.value = []
  }
}

// 检查币种是否已添加
const isSymbolAdded = (symbol) => {
  return addedSymbols.value.includes(symbol)
}

// 币种信息源变更
const handleCryptoSourceChange = (sourceId) => {
  loadAddedSymbols(sourceId)
}

const handleSaveCrypto = async () => {
  if (!cryptoForm.source_id) {
    ElMessage.warning('请选择信息源')
    return
  }
  
  let symbolsToAdd = []
  
  if (cryptoForm.addMode === 'select') {
    if (cryptoForm.symbols.length === 0) {
      ElMessage.warning('请至少选择一个币种')
      return
    }
    symbolsToAdd = cryptoForm.symbols
  } else {
    if (!cryptoForm.customSymbol.trim()) {
      ElMessage.warning('请输入币种符号')
      return
    }
    symbolsToAdd = [cryptoForm.customSymbol.trim().toUpperCase()]
  }
  
  try {
    const response = await api.post('/info-pool/items/crypto/batch', {
      source_id: cryptoForm.source_id,
      symbols: symbolsToAdd
    })
    ElMessage.success(`添加成功：${response.success}个，跳过：${response.skipped}个，失败：${response.failed}个`)
    cryptoDialogVisible.value = false
    loadItems()
    loadStats()
  } catch (error) {
    console.error('添加失败:', error)
    ElMessage.error('添加失败')
  }
}

// 批量添加文字
const handleBatchAddText = () => {
  const manualTextSource = sources.value.find(s => s.type === 'manual_text')
  if (!manualTextSource) {
    ElMessage.warning('请先添加一个"手动文字"类型的信息源')
    return
  }
  batchTextForm.source_id = manualTextSource.id
  batchTextForm.content = ''
  batchTextDialogVisible.value = true
}

const handleSaveBatchText = async () => {
  if (!batchTextForm.source_id || !batchTextForm.content.trim()) {
    ElMessage.warning('请填写内容')
    return
  }
  
  // 按行分割，过滤空行
  const lines = batchTextForm.content.split('\n').filter(line => line.trim() !== '')
  
  if (lines.length === 0) {
    ElMessage.warning('没有有效内容')
    return
  }
  
  batchTextLoading.value = true
  try {
    const res = await api.post('/info-pool/items/text/batch', {
      source_id: batchTextForm.source_id,
      items: lines
    })
    ElMessage.success(`批量添加完成！成功: ${res.success} 条，失败: ${res.failed} 条`)
    batchTextDialogVisible.value = false
    loadItems()
    loadStats()
  } catch (error) {
    console.error('批量添加失败:', error)
    ElMessage.error('批量添加失败')
  } finally {
    batchTextLoading.value = false
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
    crypto_price: '实时币价',
    btc_price: 'BTC价格',
    eth_price: 'ETH价格',
    manual_text: '手动文字',
    manual_image: '手动图片',
    contract_image: '晒单图'
  }
  return names[type] || type
}

const getTypeColor = (type) => {
  const colors = {
    rss: 'primary',
    crypto_price: 'success',
    btc_price: 'warning',
    eth_price: 'info',
    manual_text: 'success',
    manual_image: 'danger',
    contract_image: 'warning'
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

// 测试晒单图API
const handleTestContractImage = async () => {
  if (!sourceForm.api_url) {
    ElMessage.warning('请先填写API地址')
    return
  }
  
  testingContractImage.value = true
  testResult.value = null
  
  // 使用固定的ETHUSDT测试数据
  const now = new Date()
  // 开仓时间：24小时前
  const openTime = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  
  const formatDateTime = (date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day} ${hours}:${minutes}`
  }
  
  // 使用配置的测试参数
  const testTradepair = sourceForm.tradepair || 'ETHUSDT'
  const testDirection = 'long'
  // 从配置的杠杆选项中随机选择一个，如果没有则使用50
  const leverageOptions = sourceForm.leverage_options && sourceForm.leverage_options.length > 0 
    ? sourceForm.leverage_options 
    : [50]
  const testLeverage = leverageOptions[Math.floor(Math.random() * leverageOptions.length)]
  
  const params = new URLSearchParams({
    tradepair: testTradepair,
    opendate: formatDateTime(openTime),
    date: formatDateTime(now),
    direction: testDirection,
    lev: testLeverage.toString()
  })
  
  const requestUrl = `${sourceForm.api_url}?${params.toString()}`
  
  console.log('测试请求URL:', requestUrl)
  
  // 通过后端代理调用API（避免CORS问题）
  try {
    const result = await api.post('/info-pool/test-contract-image', {
      api_url: sourceForm.api_url,
      tradepair: testTradepair,
      opendate: formatDateTime(openTime),
      date: formatDateTime(now),
      direction: testDirection,
      lev: testLeverage
    })
    
    const response = result.data
    const apiData = response.data || response
    
    // 提取图片数据（支持多种数据结构）
    let imageUrl = null
    const findImageUrl = (obj) => {
      if (!obj || typeof obj !== 'object') return null
      
      // 直接检查image字段
      if (obj.image && typeof obj.image === 'string' && obj.image.startsWith('data:image')) {
        return obj.image
      }
      
      // 检查data.image
      if (obj.data?.image && typeof obj.data.image === 'string' && obj.data.image.startsWith('data:image')) {
        return obj.data.image
      }
      
      // 递归查找所有包含base64的字段
      for (const key in obj) {
        if (typeof obj[key] === 'string' && obj[key].startsWith('data:image')) {
          return obj[key]
        }
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          const found = findImageUrl(obj[key])
          if (found) return found
        }
      }
      
      return null
    }
    
    imageUrl = findImageUrl(apiData)
    
    // 如果有图片，即使success为false也认为成功
    const hasImage = !!imageUrl
    const isSuccess = (response.success && apiData?.success !== false) || hasImage
    
    if (isSuccess || hasImage) {
      testResult.value = {
        success: true,
        message: hasImage ? 'API调用成功，图片已生成' : 'API返回数据',
        requestUrl: response.requestUrl || requestUrl,
        data: apiData,
        imageUrl: imageUrl
      }
      testContractImageDialogVisible.value = true
      ElMessage.success(hasImage ? '测试成功，图片已生成' : '测试完成')
    } else {
      testResult.value = {
        success: false,
        message: apiData?.message || apiData?.error || response.error || 'API返回错误',
        requestUrl: response.requestUrl || requestUrl,
        data: apiData || response,
        imageUrl: null
      }
      testContractImageDialogVisible.value = true
      ElMessage.error('测试失败: ' + (apiData?.message || apiData?.error || response.error || '未知错误'))
    }
  } catch (error) {
    console.error('测试失败:', error)
    testResult.value = {
      success: false,
      message: error.response?.data?.message || error.response?.data?.error || error.message || '网络请求失败',
      requestUrl: sourceForm.api_url ? `${sourceForm.api_url}?tradepair=${testTradepair}&...` : '未设置',
      data: error.response?.data || {
        error: error.message,
        stack: error.stack
      }
    }
    testContractImageDialogVisible.value = true
    ElMessage.error('测试失败: ' + (error.response?.data?.message || error.message))
  } finally {
    testingContractImage.value = false
  }
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

