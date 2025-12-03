import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();

// 获取所有模板
router.get('/', async (req, res) => {
  try {
    const prisma = req.app.get('prisma') as PrismaClient;
    
    const templates = await prisma.accountTemplate.findMany({
      orderBy: { updatedAt: 'desc' }
    });
    
    // 转换为 snake_case
    const data = templates.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      ai_model: t.aiModel,
      system_prompt: t.systemPrompt,
      reply_interval: t.replyInterval,
      listen_interval: t.listenInterval,
      buffer_size: t.bufferSize,
      auto_reply: t.autoReply,
      reply_probability: t.replyProbability,
      split_by_newline: t.splitByNewline,
      multi_msg_interval: t.multiMsgInterval,
      enable_image_recognition: t.enableImageRecognition,
      proactive_enabled: t.proactiveEnabled,
      proactive_interval_min: t.proactiveIntervalMin,
      proactive_interval_max: t.proactiveIntervalMax,
      proactive_prompt: t.proactivePrompt,
      created_at: t.createdAt,
      updated_at: t.updatedAt
    }));
    
    res.json({ data });
  } catch (error) {
    console.error('获取模板列表失败:', error);
    res.status(500).json({ error: '获取模板列表失败' });
  }
});

// 获取单个模板
router.get('/:id', async (req, res) => {
  try {
    const prisma = req.app.get('prisma') as PrismaClient;
    const id = parseInt(req.params.id);
    
    const template = await prisma.accountTemplate.findUnique({
      where: { id }
    });
    
    if (!template) {
      return res.status(404).json({ error: '模板不存在' });
    }
    
    res.json({
      data: {
        id: template.id,
        name: template.name,
        description: template.description,
        ai_model: template.aiModel,
        system_prompt: template.systemPrompt,
        reply_interval: template.replyInterval,
        listen_interval: template.listenInterval,
        buffer_size: template.bufferSize,
        auto_reply: template.autoReply,
        reply_probability: template.replyProbability,
        split_by_newline: template.splitByNewline,
        multi_msg_interval: template.multiMsgInterval,
        enable_image_recognition: template.enableImageRecognition,
        proactive_enabled: template.proactiveEnabled,
        proactive_interval_min: template.proactiveIntervalMin,
        proactive_interval_max: template.proactiveIntervalMax,
        proactive_prompt: template.proactivePrompt,
        created_at: template.createdAt,
        updated_at: template.updatedAt
      }
    });
  } catch (error) {
    console.error('获取模板失败:', error);
    res.status(500).json({ error: '获取模板失败' });
  }
});

// 从账号创建模板
router.post('/from-account/:accountId', async (req, res) => {
  try {
    const prisma = req.app.get('prisma') as PrismaClient;
    const accountId = parseInt(req.params.accountId);
    const { name, description } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: '请输入模板名称' });
    }
    
    // 检查名称是否重复
    const existing = await prisma.accountTemplate.findUnique({
      where: { name: name.trim() }
    });
    
    if (existing) {
      return res.status(400).json({ error: '模板名称已存在' });
    }
    
    // 获取账号配置
    const account = await prisma.account.findUnique({
      where: { id: accountId }
    });
    
    if (!account) {
      return res.status(404).json({ error: '账号不存在' });
    }
    
    // 创建模板
    const template = await prisma.accountTemplate.create({
      data: {
        name: name.trim(),
        description: description || null,
        aiModel: account.aiModel,
        systemPrompt: account.systemPrompt,
        replyInterval: account.replyInterval,
        listenInterval: account.listenInterval,
        bufferSize: account.bufferSize,
        autoReply: account.autoReply,
        replyProbability: account.replyProbability,
        splitByNewline: account.splitByNewline,
        multiMsgInterval: account.multiMsgInterval,
        enableImageRecognition: account.enableImageRecognition,
        proactiveEnabled: account.proactiveEnabled,
        proactiveIntervalMin: account.proactiveIntervalMin,
        proactiveIntervalMax: account.proactiveIntervalMax,
        proactivePrompt: account.proactivePrompt
      }
    });
    
    res.json({
      message: '模板创建成功',
      data: {
        id: template.id,
        name: template.name
      }
    });
  } catch (error) {
    console.error('创建模板失败:', error);
    res.status(500).json({ error: '创建模板失败' });
  }
});

// 创建新模板（手动填写）
router.post('/', async (req, res) => {
  try {
    const prisma = req.app.get('prisma') as PrismaClient;
    const { name, description, ...config } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: '请输入模板名称' });
    }
    
    // 检查名称是否重复
    const existing = await prisma.accountTemplate.findUnique({
      where: { name: name.trim() }
    });
    
    if (existing) {
      return res.status(400).json({ error: '模板名称已存在' });
    }
    
    const template = await prisma.accountTemplate.create({
      data: {
        name: name.trim(),
        description: description || null,
        aiModel: config.ai_model || 'gpt-4o-mini',
        systemPrompt: config.system_prompt || '',
        replyInterval: config.reply_interval || 60,
        listenInterval: config.listen_interval || 5,
        bufferSize: config.buffer_size || 10,
        autoReply: config.auto_reply !== false,
        replyProbability: config.reply_probability ?? 100,
        splitByNewline: config.split_by_newline !== false,
        multiMsgInterval: config.multi_msg_interval || 5,
        enableImageRecognition: config.enable_image_recognition || false,
        proactiveEnabled: config.proactive_enabled || false,
        proactiveIntervalMin: config.proactive_interval_min || 300,
        proactiveIntervalMax: config.proactive_interval_max || 600,
        proactivePrompt: config.proactive_prompt || ''
      }
    });
    
    res.json({
      message: '模板创建成功',
      data: { id: template.id, name: template.name }
    });
  } catch (error) {
    console.error('创建模板失败:', error);
    res.status(500).json({ error: '创建模板失败' });
  }
});

// 更新模板
router.put('/:id', async (req, res) => {
  try {
    const prisma = req.app.get('prisma') as PrismaClient;
    const id = parseInt(req.params.id);
    const { name, description, ...config } = req.body;
    
    const existing = await prisma.accountTemplate.findUnique({
      where: { id }
    });
    
    if (!existing) {
      return res.status(404).json({ error: '模板不存在' });
    }
    
    // 如果名称变了，检查是否重复
    if (name && name.trim() !== existing.name) {
      const nameExists = await prisma.accountTemplate.findUnique({
        where: { name: name.trim() }
      });
      if (nameExists) {
        return res.status(400).json({ error: '模板名称已存在' });
      }
    }
    
    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description;
    if (config.ai_model !== undefined) updateData.aiModel = config.ai_model;
    if (config.system_prompt !== undefined) updateData.systemPrompt = config.system_prompt;
    if (config.reply_interval !== undefined) updateData.replyInterval = config.reply_interval;
    if (config.listen_interval !== undefined) updateData.listenInterval = config.listen_interval;
    if (config.buffer_size !== undefined) updateData.bufferSize = config.buffer_size;
    if (config.auto_reply !== undefined) updateData.autoReply = config.auto_reply;
    if (config.reply_probability !== undefined) updateData.replyProbability = config.reply_probability;
    if (config.split_by_newline !== undefined) updateData.splitByNewline = config.split_by_newline;
    if (config.multi_msg_interval !== undefined) updateData.multiMsgInterval = config.multi_msg_interval;
    if (config.enable_image_recognition !== undefined) updateData.enableImageRecognition = config.enable_image_recognition;
    if (config.proactive_enabled !== undefined) updateData.proactiveEnabled = config.proactive_enabled;
    if (config.proactive_interval_min !== undefined) updateData.proactiveIntervalMin = config.proactive_interval_min;
    if (config.proactive_interval_max !== undefined) updateData.proactiveIntervalMax = config.proactive_interval_max;
    if (config.proactive_prompt !== undefined) updateData.proactivePrompt = config.proactive_prompt;
    
    await prisma.accountTemplate.update({
      where: { id },
      data: updateData
    });
    
    res.json({ message: '模板更新成功' });
  } catch (error) {
    console.error('更新模板失败:', error);
    res.status(500).json({ error: '更新模板失败' });
  }
});

// 删除模板
router.delete('/:id', async (req, res) => {
  try {
    const prisma = req.app.get('prisma') as PrismaClient;
    const id = parseInt(req.params.id);
    
    const existing = await prisma.accountTemplate.findUnique({
      where: { id }
    });
    
    if (!existing) {
      return res.status(404).json({ error: '模板不存在' });
    }
    
    await prisma.accountTemplate.delete({
      where: { id }
    });
    
    res.json({ message: '模板删除成功' });
  } catch (error) {
    console.error('删除模板失败:', error);
    res.status(500).json({ error: '删除模板失败' });
  }
});

// 应用模板到账号
router.post('/:id/apply/:accountId', async (req, res) => {
  try {
    const prisma = req.app.get('prisma') as PrismaClient;
    const templateId = parseInt(req.params.id);
    const accountId = parseInt(req.params.accountId);
    
    const template = await prisma.accountTemplate.findUnique({
      where: { id: templateId }
    });
    
    if (!template) {
      return res.status(404).json({ error: '模板不存在' });
    }
    
    const account = await prisma.account.findUnique({
      where: { id: accountId }
    });
    
    if (!account) {
      return res.status(404).json({ error: '账号不存在' });
    }
    
    // 应用模板配置到账号
    await prisma.account.update({
      where: { id: accountId },
      data: {
        aiModel: template.aiModel,
        systemPrompt: template.systemPrompt,
        replyInterval: template.replyInterval,
        listenInterval: template.listenInterval,
        bufferSize: template.bufferSize,
        autoReply: template.autoReply,
        replyProbability: template.replyProbability,
        splitByNewline: template.splitByNewline,
        multiMsgInterval: template.multiMsgInterval,
        enableImageRecognition: template.enableImageRecognition,
        proactiveEnabled: template.proactiveEnabled,
        proactiveIntervalMin: template.proactiveIntervalMin,
        proactiveIntervalMax: template.proactiveIntervalMax,
        proactivePrompt: template.proactivePrompt
      }
    });
    
    res.json({ message: '模板应用成功' });
  } catch (error) {
    console.error('应用模板失败:', error);
    res.status(500).json({ error: '应用模板失败' });
  }
});

export const templateRoutes = router;

