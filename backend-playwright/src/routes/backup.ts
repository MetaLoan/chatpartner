/**
 * 配置备份与恢复 API
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import archiver from 'archiver';
import unzipper from 'unzipper';
import multer from 'multer';

const router = Router();

// 临时上传目录
const uploadDir = path.join(process.cwd(), 'data', 'temp');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({ dest: uploadDir });

/**
 * 导出所有配置
 * 包括：数据库配置、session文件、上传的图片
 */
router.get('/export', async (req: Request, res: Response) => {
  const prisma = req.app.get('prisma') as PrismaClient;
  
  try {
    console.log('📦 开始导出配置...');
    
    // 1. 导出数据库数据
    const accounts = await prisma.account.findMany();
    const groups = await prisma.group.findMany();
    const infoSources = await prisma.infoSource.findMany();
    const infoItems = await prisma.infoItem.findMany();
    const infoItemUsages = await prisma.infoItemUsage.findMany();
    const messages = await prisma.message.findMany({ take: 1000 }); // 最近1000条消息
    const configs = await prisma.config.findMany();
    
    const dbData = {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      accounts,
      groups,
      infoSources,
      infoItems,
      infoItemUsages,
      messages,
      configs
    };
    
    // 创建 ZIP 文件
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const zipFileName = `chatpartner_backup_${timestamp}.zip`;
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);
    
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);
    
    // 添加数据库 JSON
    archive.append(JSON.stringify(dbData, null, 2), { name: 'database.json' });
    
    // 添加 session 文件
    const sessionsDir = path.join(process.cwd(), 'data', 'sessions');
    if (fs.existsSync(sessionsDir)) {
      archive.directory(sessionsDir, 'sessions');
      console.log('   ✅ 添加 session 文件');
    }
    
    // 添加上传的图片
    const uploadsDir = path.join(process.cwd(), 'data', 'uploads');
    if (fs.existsSync(uploadsDir)) {
      archive.directory(uploadsDir, 'uploads');
      console.log('   ✅ 添加上传的图片');
    }
    
    await archive.finalize();
    console.log('📦 配置导出完成');
    
  } catch (error) {
    console.error('导出配置失败:', error);
    res.status(500).json({ error: '导出配置失败' });
  }
});

/**
 * 导入配置
 */
router.post('/import', upload.single('backup'), async (req: Request, res: Response) => {
  const prisma = req.app.get('prisma') as PrismaClient;
  const file = req.file;
  
  if (!file) {
    return res.status(400).json({ error: '请上传备份文件' });
  }
  
  const extractDir = path.join(uploadDir, `extract_${Date.now()}`);
  
  try {
    console.log('📥 开始导入配置...');
    
    // 解压 ZIP 文件
    await fs.createReadStream(file.path)
      .pipe(unzipper.Extract({ path: extractDir }))
      .promise();
    
    console.log('   ✅ 解压完成');
    
    // 读取数据库 JSON
    const dbJsonPath = path.join(extractDir, 'database.json');
    if (!fs.existsSync(dbJsonPath)) {
      throw new Error('备份文件格式错误：缺少 database.json');
    }
    
    const dbData = JSON.parse(fs.readFileSync(dbJsonPath, 'utf-8'));
    console.log(`   📄 备份版本: ${dbData.version}, 时间: ${dbData.exportedAt}`);
    
    // 选项：是否清空现有数据
    const clearExisting = req.body.clear_existing === 'true';
    
    if (clearExisting) {
      console.log('   🗑️ 清空现有数据...');
      await prisma.infoItemUsage.deleteMany();
      await prisma.infoItem.deleteMany();
      await prisma.infoSource.deleteMany();
      await prisma.message.deleteMany();
      await prisma.account.deleteMany();
      await prisma.group.deleteMany();
      await prisma.config.deleteMany();
    }
    
    // 导入群组
    if (dbData.groups && dbData.groups.length > 0) {
      for (const group of dbData.groups) {
        await prisma.group.upsert({
          where: { id: group.id },
          create: {
            id: group.id,
            telegramId: group.telegramId,
            name: group.name,
            description: group.description,
            memberCount: group.memberCount,
            isActive: group.isActive,
            createdAt: new Date(group.createdAt),
            updatedAt: new Date(group.updatedAt)
          },
          update: {
            telegramId: group.telegramId,
            name: group.name,
            description: group.description,
            memberCount: group.memberCount,
            isActive: group.isActive
          }
        });
      }
      console.log(`   ✅ 导入 ${dbData.groups.length} 个群组`);
    }
    
    // 导入账号
    if (dbData.accounts && dbData.accounts.length > 0) {
      for (const account of dbData.accounts) {
        await prisma.account.upsert({
          where: { id: account.id },
          create: {
            id: account.id,
            phoneNumber: account.phoneNumber,
            nickname: account.nickname,
            sessionPath: account.sessionPath,
            status: 'offline', // 导入后默认离线
            enabled: account.enabled,
            autoReply: account.autoReply,
            replyProbability: account.replyProbability,
            replyInterval: account.replyInterval,
            listenInterval: account.listenInterval,
            bufferSize: account.bufferSize,
            splitByNewline: account.splitByNewline,
            multiMsgInterval: account.multiMsgInterval,
            systemPrompt: account.systemPrompt,
            aiModel: account.aiModel,
            aiApiKey: account.aiApiKey,
            aiApiBaseUrl: account.aiApiBaseUrl,
            enableImageRecognition: account.enableImageRecognition,
            targetGroupId: account.targetGroupId,
            proactiveEnabled: account.proactiveEnabled,
            proactiveIntervalMin: account.proactiveIntervalMin,
            proactiveIntervalMax: account.proactiveIntervalMax,
            proactivePrompt: account.proactivePrompt,
            createdAt: new Date(account.createdAt),
            updatedAt: new Date(account.updatedAt)
          },
          update: {
            phoneNumber: account.phoneNumber,
            nickname: account.nickname,
            sessionPath: account.sessionPath,
            enabled: account.enabled,
            autoReply: account.autoReply,
            replyProbability: account.replyProbability,
            replyInterval: account.replyInterval,
            listenInterval: account.listenInterval,
            bufferSize: account.bufferSize,
            splitByNewline: account.splitByNewline,
            multiMsgInterval: account.multiMsgInterval,
            systemPrompt: account.systemPrompt,
            aiModel: account.aiModel,
            aiApiKey: account.aiApiKey,
            aiApiBaseUrl: account.aiApiBaseUrl,
            enableImageRecognition: account.enableImageRecognition,
            targetGroupId: account.targetGroupId,
            proactiveEnabled: account.proactiveEnabled,
            proactiveIntervalMin: account.proactiveIntervalMin,
            proactiveIntervalMax: account.proactiveIntervalMax,
            proactivePrompt: account.proactivePrompt
          }
        });
      }
      console.log(`   ✅ 导入 ${dbData.accounts.length} 个账号`);
    }
    
    // 导入信息源
    if (dbData.infoSources && dbData.infoSources.length > 0) {
      for (const source of dbData.infoSources) {
        await prisma.infoSource.upsert({
          where: { id: source.id },
          create: {
            id: source.id,
            type: source.type,
            name: source.name,
            rssUrl: source.rssUrl,
            priceApiUrl: source.priceApiUrl,
            fetchInterval: source.fetchInterval,
            workMode: source.workMode,
            reusable: source.reusable,
            expireHours: source.expireHours,
            enabled: source.enabled,
            createdAt: new Date(source.createdAt),
            updatedAt: new Date(source.updatedAt)
          },
          update: {
            type: source.type,
            name: source.name,
            rssUrl: source.rssUrl,
            priceApiUrl: source.priceApiUrl,
            fetchInterval: source.fetchInterval,
            workMode: source.workMode,
            reusable: source.reusable,
            expireHours: source.expireHours,
            enabled: source.enabled
          }
        });
      }
      console.log(`   ✅ 导入 ${dbData.infoSources.length} 个信息源`);
    }
    
    // 导入信息条目
    if (dbData.infoItems && dbData.infoItems.length > 0) {
      for (const item of dbData.infoItems) {
        try {
          await prisma.infoItem.upsert({
            where: { id: item.id },
            create: {
              id: item.id,
              sourceId: item.sourceId,
              contentType: item.contentType,
              title: item.title,
              content: item.content,
              imagePath: item.imagePath,
              sourceUrl: item.sourceUrl,
              priceValue: item.priceValue,
              priceChange: item.priceChange,
              externalId: item.externalId,
              publishedAt: item.publishedAt ? new Date(item.publishedAt) : new Date(),
              expired: item.expired,
              createdAt: new Date(item.createdAt),
              updatedAt: new Date(item.updatedAt)
            },
            update: {
              contentType: item.contentType,
              title: item.title,
              content: item.content,
              imagePath: item.imagePath,
              sourceUrl: item.sourceUrl,
              priceValue: item.priceValue,
              priceChange: item.priceChange,
              expired: item.expired
            }
          });
        } catch (e) {
          // 跳过重复的条目
        }
      }
      console.log(`   ✅ 导入 ${dbData.infoItems.length} 个信息条目`);
    }
    
    // 导入配置
    if (dbData.configs && dbData.configs.length > 0) {
      for (const config of dbData.configs) {
        await prisma.config.upsert({
          where: { key: config.key },
          create: {
            key: config.key,
            value: config.value,
            description: config.description
          },
          update: {
            value: config.value,
            description: config.description
          }
        });
      }
      console.log(`   ✅ 导入 ${dbData.configs.length} 个配置项`);
    }
    
    // 复制 session 文件
    const sessionsBackupDir = path.join(extractDir, 'sessions');
    const sessionsTargetDir = path.join(process.cwd(), 'data', 'sessions');
    if (fs.existsSync(sessionsBackupDir)) {
      if (!fs.existsSync(sessionsTargetDir)) {
        fs.mkdirSync(sessionsTargetDir, { recursive: true });
      }
      const sessionFiles = fs.readdirSync(sessionsBackupDir);
      for (const file of sessionFiles) {
        const src = path.join(sessionsBackupDir, file);
        const dest = path.join(sessionsTargetDir, file);
        fs.copyFileSync(src, dest);
      }
      console.log(`   ✅ 导入 ${sessionFiles.length} 个 session 文件`);
    }
    
    // 复制上传的图片
    const uploadsBackupDir = path.join(extractDir, 'uploads');
    const uploadsTargetDir = path.join(process.cwd(), 'data', 'uploads');
    if (fs.existsSync(uploadsBackupDir)) {
      if (!fs.existsSync(uploadsTargetDir)) {
        fs.mkdirSync(uploadsTargetDir, { recursive: true });
      }
      const uploadFiles = fs.readdirSync(uploadsBackupDir);
      for (const file of uploadFiles) {
        const src = path.join(uploadsBackupDir, file);
        const dest = path.join(uploadsTargetDir, file);
        fs.copyFileSync(src, dest);
      }
      console.log(`   ✅ 导入 ${uploadFiles.length} 个上传文件`);
    }
    
    // 清理临时文件
    fs.unlinkSync(file.path);
    fs.rmSync(extractDir, { recursive: true, force: true });
    
    console.log('📥 配置导入完成');
    
    res.json({ 
      message: '导入成功',
      data: {
        accounts: dbData.accounts?.length || 0,
        groups: dbData.groups?.length || 0,
        infoSources: dbData.infoSources?.length || 0,
        infoItems: dbData.infoItems?.length || 0
      }
    });
    
  } catch (error: any) {
    console.error('导入配置失败:', error);
    
    // 清理临时文件
    try {
      if (file) fs.unlinkSync(file.path);
      if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
    } catch (e) {}
    
    res.status(500).json({ error: '导入配置失败: ' + error.message });
  }
});

/**
 * 获取备份信息（预览备份内容）
 */
router.post('/preview', upload.single('backup'), async (req: Request, res: Response) => {
  const file = req.file;
  
  if (!file) {
    return res.status(400).json({ error: '请上传备份文件' });
  }
  
  const extractDir = path.join(uploadDir, `preview_${Date.now()}`);
  
  try {
    // 解压 ZIP 文件
    await fs.createReadStream(file.path)
      .pipe(unzipper.Extract({ path: extractDir }))
      .promise();
    
    // 读取数据库 JSON
    const dbJsonPath = path.join(extractDir, 'database.json');
    if (!fs.existsSync(dbJsonPath)) {
      throw new Error('备份文件格式错误');
    }
    
    const dbData = JSON.parse(fs.readFileSync(dbJsonPath, 'utf-8'));
    
    // 检查 session 和 uploads
    const sessionsDir = path.join(extractDir, 'sessions');
    const uploadsDir = path.join(extractDir, 'uploads');
    
    const sessionFiles = fs.existsSync(sessionsDir) ? fs.readdirSync(sessionsDir).length : 0;
    const uploadFiles = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir).length : 0;
    
    // 清理
    fs.unlinkSync(file.path);
    fs.rmSync(extractDir, { recursive: true, force: true });
    
    res.json({
      data: {
        version: dbData.version,
        exportedAt: dbData.exportedAt,
        accounts: dbData.accounts?.length || 0,
        groups: dbData.groups?.length || 0,
        infoSources: dbData.infoSources?.length || 0,
        infoItems: dbData.infoItems?.length || 0,
        sessionFiles,
        uploadFiles
      }
    });
    
  } catch (error: any) {
    // 清理
    try {
      if (file) fs.unlinkSync(file.path);
      if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
    } catch (e) {}
    
    res.status(400).json({ error: '无效的备份文件: ' + error.message });
  }
});

export const backupRoutes = router;

