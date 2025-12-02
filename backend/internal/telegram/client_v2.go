package telegram

import (
	"context"
	"fmt"
	"log"
	"math/rand"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"aibot/internal/ai"
	"aibot/models"

	"github.com/gotd/td/telegram"
	"github.com/gotd/td/telegram/updates"
	"github.com/gotd/td/tg"
	"gorm.io/gorm"
)

// ClientV2 改进的Telegram客户端
type ClientV2 struct {
	ID             uint
	Account        *models.Account
	TGClient       *telegram.Client
	DB             *gorm.DB
	AIService      *ai.Service
	Context        context.Context
	Cancel         context.CancelFunc
	LastReplyTime  map[int64]time.Time
	MessageContext map[int64][]MessageContext
	SessionPath    string
	AuthHelper     *AuthHelper // 认证助手
	Logger         *Logger     // 日志记录器

	// 消息缓冲区：每个群组的最近消息
	messageBuffer     map[int64][]BufferedMessage
	messageBufferLock sync.Mutex
}

// MessageContext 消息上下文（用于构建AI对话历史）
type MessageContext struct {
	Role    string
	Content string
}

// BufferedMessage 缓冲的消息
type BufferedMessage struct {
	Content   string
	Timestamp time.Time
}

// NewClientV2 创建新的客户端（改进版）
func NewClientV2(account *models.Account, db *gorm.DB, aiService *ai.Service) (*ClientV2, error) {
	ctx, cancel := context.WithCancel(context.Background())

	// 确保会话目录存在
	sessionDir := filepath.Join("data", "sessions")
	if err := os.MkdirAll(sessionDir, 0755); err != nil {
		return nil, fmt.Errorf("创建会话目录失败: %w", err)
	}

	// 会话文件路径
	sessionPath := filepath.Join(sessionDir, fmt.Sprintf("%s.session", account.PhoneNumber))

	clientV2 := &ClientV2{
		ID:             account.ID,
		Account:        account,
		DB:             db,
		AIService:      aiService,
		Context:        ctx,
		Cancel:         cancel,
		LastReplyTime:  make(map[int64]time.Time),
		MessageContext: make(map[int64][]MessageContext),
		SessionPath:    sessionPath,
		messageBuffer:  make(map[int64][]BufferedMessage),
	}

	// 设置更新处理器（dispatcher）
	dispatcher := tg.NewUpdateDispatcher()

	// 处理普通对话的新消息
	dispatcher.OnNewMessage(func(ctx context.Context, e tg.Entities, u *tg.UpdateNewMessage) error {
		if msg, ok := u.Message.(*tg.Message); ok {
			log.Printf("🔔 OnNewMessage: message_id=%d peer=%T content=%s", msg.ID, msg.PeerID, truncateStr(msg.Message, 50))
		}
		return clientV2.bufferMessage(u.Message)
	})

	// 处理频道 / 超级群的新消息
	dispatcher.OnNewChannelMessage(func(ctx context.Context, e tg.Entities, u *tg.UpdateNewChannelMessage) error {
		if msg, ok := u.Message.(*tg.Message); ok {
			log.Printf("🔔 OnNewChannelMessage: message_id=%d peer=%T content=%s", msg.ID, msg.PeerID, truncateStr(msg.Message, 50))
		}
		return clientV2.bufferMessage(u.Message)
	})

	// 创建 updates.Manager 并配置
	gaps := updates.New(updates.Config{
		Handler: dispatcher,
	})

	// 创建Telegram客户端，使用 UpdateHandler
	client := telegram.NewClient(
		account.APIID,
		account.APIHash,
		telegram.Options{
			SessionStorage: &telegram.FileSessionStorage{
				Path: sessionPath,
			},
			UpdateHandler: gaps, // 关键：将 gaps 作为 UpdateHandler
		},
	)

	clientV2.TGClient = client
	
	// 创建认证助手
	clientV2.AuthHelper = NewAuthHelper(client, account, db)
	
	// 创建日志记录器
	logDir := filepath.Join("data", "logs")
	logger, err := NewLogger(account.ID, logDir)
	if err != nil {
		log.Printf("⚠️ 创建日志记录器失败: %v", err)
	} else {
		clientV2.Logger = logger
	}
	
	return clientV2, nil
}

// truncateStr 截断字符串
func truncateStr(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// Start 启动客户端
func (c *ClientV2) Start() error {
	log.Printf("🚀 启动Telegram客户端 [账号ID: %d, 手机号: %s]", c.Account.ID, c.Account.PhoneNumber)

	return c.TGClient.Run(c.Context, func(ctx context.Context) error {
		// 检查是否已有会话
		if _, err := os.Stat(c.SessionPath); os.IsNotExist(err) {
			// 需要认证
			log.Printf("📱 首次登录，需要认证 [手机号: %s]", c.Account.PhoneNumber)

			// 使用认证助手执行完整认证流程（验证码 / 2FA 密码）
			if c.AuthHelper == nil {
				c.AuthHelper = NewAuthHelper(c.TGClient, c.Account, c.DB)
			}

			if err := c.AuthHelper.Authenticate(ctx); err != nil {
				log.Printf("❌ 认证失败: %v", err)
				c.Account.Status = "error"
				c.DB.Save(c.Account)
				return fmt.Errorf("认证失败: %w", err)
			}

			log.Printf("✅ 认证成功，会话已保存")
		}

		// 获取自身信息
		api := c.TGClient.API()
		me, err := api.UsersGetUsers(ctx, []tg.InputUserClass{
			&tg.InputUserSelf{},
		})
		if err != nil {
			return fmt.Errorf("获取用户信息失败: %w", err)
		}

		if len(me) == 0 {
			return fmt.Errorf("无法获取用户信息")
		}

		if user, ok := me[0].(*tg.User); ok {
			log.Printf("✅ 登录成功: %s (@%s)", user.FirstName, user.Username)
			
			// 更新账号信息
			c.Account.Nickname = user.FirstName
			c.Account.Status = "online"
			c.DB.Save(c.Account)
			
			// 同步群组信息
			go func() {
				if err := SyncGroups(ctx, api, c.DB, c.Account.ID); err != nil {
					log.Printf("⚠️ 同步群组失败: %v", err)
				}
			}()
		} else {
			return fmt.Errorf("无法获取用户ID")
		}

		log.Printf("📡 开始监听消息... (UpdateHandler 已在客户端创建时设置)")

		// 主动获取一次更新状态，确保更新流正确初始化
		state, err := api.UpdatesGetState(ctx)
		if err != nil {
			log.Printf("⚠️ 获取更新状态失败: %v", err)
		} else {
			log.Printf("✅ 更新状态: pts=%d, qts=%d, seq=%d, date=%d", state.Pts, state.Qts, state.Seq, state.Date)
		}

		// 启动消息处理定时器
		go c.startMessageProcessor(ctx)

		// 启动轮询器（主动拉取大型群组的消息）
		go c.startGroupPoller(ctx, api)

		// 阻塞等待 ctx 结束（UpdateHandler 已在 NewClientV2 中通过 telegram.Options 设置）
		<-ctx.Done()
		return ctx.Err()
	})
}

// bufferMessage 将消息添加到缓冲区
func (c *ClientV2) bufferMessage(msg tg.MessageClass) error {
	message, ok := msg.(*tg.Message)
	if !ok {
		return nil
	}

	// 跳过自己的消息
	if message.Out {
		return nil
	}

	// 获取消息文本
	messageText := message.Message
	if messageText == "" {
		return nil
	}

	// 获取群组ID
	peer := message.PeerID
	var chatID int64
	switch p := peer.(type) {
	case *tg.PeerChannel:
		chatID = int64(p.ChannelID)
	case *tg.PeerChat:
		chatID = int64(p.ChatID)
	case *tg.PeerUser:
		return nil // 私聊消息暂不处理
	default:
		return nil
	}

	// 添加到缓冲区
	c.messageBufferLock.Lock()
	defer c.messageBufferLock.Unlock()

	if c.messageBuffer[chatID] == nil {
		c.messageBuffer[chatID] = make([]BufferedMessage, 0)
	}

	c.messageBuffer[chatID] = append(c.messageBuffer[chatID], BufferedMessage{
		Content:   messageText,
		Timestamp: time.Now(),
	})

	// 只保留最近N条消息（使用账号配置的缓冲数量）
	bufferSize := c.Account.BufferSize
	if bufferSize <= 0 {
		bufferSize = 10 // 默认10条
	}
	if len(c.messageBuffer[chatID]) > bufferSize {
		c.messageBuffer[chatID] = c.messageBuffer[chatID][len(c.messageBuffer[chatID])-bufferSize:]
	}

	log.Printf("📥 消息已缓冲 [群组ID: %d, 缓冲数量: %d]: %s", chatID, len(c.messageBuffer[chatID]), truncateStr(messageText, 50))

	return nil
}

// startGroupPoller 启动群组消息轮询器（用于大型群组）
func (c *ClientV2) startGroupPoller(ctx context.Context, api *tg.Client) {
	// 轮询间隔（使用监听间隔配置）
	pollInterval := c.Account.ListenInterval
	if pollInterval <= 0 {
		pollInterval = 30
	}

	ticker := time.NewTicker(time.Duration(pollInterval) * time.Second)
	defer ticker.Stop()

	// 记录每个群组最后拉取的消息ID
	lastMsgIDs := make(map[int64]int)

	log.Printf("🔄 群组消息轮询器已启动（每%d秒轮询一次）", pollInterval)

	for {
		select {
		case <-ctx.Done():
			log.Printf("🔄 群组消息轮询器已停止")
			return
		case <-ticker.C:
			c.pollAssignedGroups(ctx, api, lastMsgIDs)
		}
	}
}

// pollAssignedGroups 轮询分配的群组
func (c *ClientV2) pollAssignedGroups(ctx context.Context, api *tg.Client, lastMsgIDs map[int64]int) {
	// 获取分配给当前账号的群组
	var accountGroups []models.AccountGroup
	if err := c.DB.Where("account_id = ? AND enabled = ?", c.Account.ID, true).Find(&accountGroups).Error; err != nil {
		log.Printf("⚠️ 获取分配群组失败: %v", err)
		return
	}

	for _, ag := range accountGroups {
		var group models.Group
		if err := c.DB.First(&group, ag.GroupID).Error; err != nil {
			continue
		}

		// 只轮询超级群组（大型群组可能不推送实时更新）
		if group.Type != "supergroup" && group.Type != "channel" {
			continue
		}

		// 构造 Peer
		peer := &tg.InputPeerChannel{
			ChannelID:  group.ChatID,
			AccessHash: group.AccessHash,
		}

		// 获取最近消息
		history, err := api.MessagesGetHistory(ctx, &tg.MessagesGetHistoryRequest{
			Peer:  peer,
			Limit: 5,
		})
		if err != nil {
			// 静默处理错误，避免刷屏
			continue
		}

		var messages []*tg.Message
		switch h := history.(type) {
		case *tg.MessagesChannelMessages:
			for _, msg := range h.Messages {
				if m, ok := msg.(*tg.Message); ok {
					messages = append(messages, m)
				}
			}
		}

		// 处理新消息
		lastID := lastMsgIDs[group.ChatID]
		for _, msg := range messages {
			// 跳过已处理的消息
			if msg.ID <= lastID {
				continue
			}
			// 跳过自己的消息
			if msg.Out {
				continue
			}
			// 跳过空消息
			if msg.Message == "" {
				continue
			}

			// 更新最后消息ID
			if msg.ID > lastMsgIDs[group.ChatID] {
				lastMsgIDs[group.ChatID] = msg.ID
			}

			// 添加到缓冲区
			c.messageBufferLock.Lock()
			if c.messageBuffer[group.ChatID] == nil {
				c.messageBuffer[group.ChatID] = make([]BufferedMessage, 0)
			}
			c.messageBuffer[group.ChatID] = append(c.messageBuffer[group.ChatID], BufferedMessage{
				Content:   msg.Message,
				Timestamp: time.Now(),
			})
			// 限制缓冲区大小
			bufferSize := c.Account.BufferSize
			if bufferSize <= 0 {
				bufferSize = 10
			}
			if len(c.messageBuffer[group.ChatID]) > bufferSize {
				c.messageBuffer[group.ChatID] = c.messageBuffer[group.ChatID][len(c.messageBuffer[group.ChatID])-bufferSize:]
			}
			c.messageBufferLock.Unlock()

			log.Printf("📥 [轮询] 消息已缓冲 [%s, ID: %d]: %s", group.Title, msg.ID, truncateStr(msg.Message, 50))
		}
	}
}

// startMessageProcessor 启动消息处理定时器
func (c *ClientV2) startMessageProcessor(ctx context.Context) {
	// 使用账号配置的监听间隔
	listenInterval := c.Account.ListenInterval
	if listenInterval <= 0 {
		listenInterval = 5 // 默认5秒
	}

	ticker := time.NewTicker(time.Duration(listenInterval) * time.Second)
	defer ticker.Stop()

	log.Printf("⏰ 消息处理定时器已启动（每%d秒处理一次）", listenInterval)

	for {
		select {
		case <-ctx.Done():
			log.Printf("⏰ 消息处理定时器已停止")
			return
		case <-ticker.C:
			c.processBufferedMessages(ctx)
		}
	}
}

// reloadAccountConfig 重新加载账号配置（支持热更新）
func (c *ClientV2) reloadAccountConfig() {
	var account models.Account
	if err := c.DB.First(&account, c.Account.ID).Error; err != nil {
		log.Printf("⚠️ 重新加载账号配置失败: %v", err)
		return
	}
	// 更新配置（保留运行时状态如 Status）
	c.Account.SystemPrompt = account.SystemPrompt
	c.Account.AIApiKey = account.AIApiKey
	c.Account.AIModel = account.AIModel
	c.Account.ReplyInterval = account.ReplyInterval
	c.Account.ListenInterval = account.ListenInterval
	c.Account.BufferSize = account.BufferSize
	c.Account.AutoReply = account.AutoReply
	c.Account.ReplyProbability = account.ReplyProbability
	c.Account.SplitByNewline = account.SplitByNewline
	c.Account.MultiMsgInterval = account.MultiMsgInterval
	c.Account.Enabled = account.Enabled
	c.Account.Priority = account.Priority
	c.Account.Tone = account.Tone
}

// processBufferedMessages 处理缓冲区中的消息
func (c *ClientV2) processBufferedMessages(ctx context.Context) {
	// 🔄 热更新：每次处理前重新加载账号配置
	c.reloadAccountConfig()

	c.messageBufferLock.Lock()
	// 复制一份缓冲区数据，然后清空
	buffersToProcess := make(map[int64][]BufferedMessage)
	for chatID, messages := range c.messageBuffer {
		if len(messages) > 0 {
			buffersToProcess[chatID] = messages
			c.messageBuffer[chatID] = make([]BufferedMessage, 0)
		}
	}
	c.messageBufferLock.Unlock()

	// 处理每个群组的消息
	for chatID, messages := range buffersToProcess {
		if len(messages) == 0 {
			continue
		}

		// 🔒 关键检查：验证这个群组是否被分配给当前账号，并获取群组配置
		accountGroup, ok := c.getGroupAssignment(chatID)
		if !ok {
			// 不打印日志，避免刷屏（因为会有很多未分配的群）
			continue
		}

		// 检查群组级别是否启用
		if !accountGroup.Enabled {
			continue
		}

		// 检查是否启用自动回复（账号级别）
		if !c.Account.AutoReply {
			log.Printf("⏸️ 群组 [%d] 自动回复已关闭，跳过", chatID)
			continue
		}

		// 检查发言间隔
		replyInterval := c.Account.ReplyInterval
		if replyInterval <= 0 {
			replyInterval = 60 // 默认60秒
		}
		if lastTime, ok := c.LastReplyTime[chatID]; ok {
			if time.Since(lastTime).Seconds() < float64(replyInterval) {
				log.Printf("⏳ 群组 [%d] 发言间隔未到（需要%d秒），跳过", chatID, replyInterval)
				continue
			}
		}

		// 检查回复概率（优先使用群组级别配置，否则使用账号级别配置）
		replyProbability := int(accountGroup.ReplyProbability * 100) // 群组配置是0-1的小数
		if replyProbability <= 0 {
			replyProbability = c.Account.ReplyProbability // 回退到账号级别配置
		}
		if replyProbability <= 0 {
			replyProbability = 100 // 默认100%
		}
		if rand.Intn(100) >= replyProbability {
			log.Printf("🎲 群组 [%d] 概率判定不回复（概率%d%%），跳过", chatID, replyProbability)
			continue
		}

		// 合并所有消息内容
		var allMessages []string
		for _, msg := range messages {
			allMessages = append(allMessages, msg.Content)
		}
		combinedContent := strings.Join(allMessages, "\n---\n")

		log.Printf("🔄 处理群组 [%d] 的 %d 条消息", chatID, len(messages))

		// 生成AI回复（基于所有最近消息）
		reply, err := c.AIService.GenerateReply(
			ctx,
			c.Account.AIApiKey,
			c.Account.AIModel,
			c.Account.SystemPrompt,
			fmt.Sprintf("以下是群里最近的聊天内容，请根据这些内容发表你的观点或参与讨论（直接输出你想说的话，不要引用或回复特定消息）：\n\n%s", combinedContent),
			c.getMessageContext(chatID),
		)
		if err != nil {
			log.Printf("❌ 生成回复失败: %v", err)
			continue
		}

		if reply == "" {
			log.Printf("⚠️ AI未生成回复内容")
			continue
		}

		// 发送消息（支持拆分多条）
		if err := c.sendReplyWithSplit(ctx, chatID, reply); err != nil {
			log.Printf("❌ 发送消息失败: %v", err)
			continue
		}

		// 更新状态
		c.LastReplyTime[chatID] = time.Now()
		c.addMessageContext(chatID, combinedContent, reply)
		c.saveMessageDirect(chatID, reply)

		log.Printf("✅ 已发送观点: %s", truncateStr(reply, 100))
	}
}

// sendReplyWithSplit 发送回复（支持按换行拆分成多条消息）
func (c *ClientV2) sendReplyWithSplit(ctx context.Context, chatID int64, reply string) error {
	// 检查是否启用拆分
	if !c.Account.SplitByNewline {
		// 不拆分，直接发送
		return c.sendMessageDirect(ctx, chatID, reply)
	}

	// 按换行符拆分消息
	lines := strings.Split(reply, "\n")
	var messageParts []string

	// 合并空行和过短的行
	var currentPart string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue // 跳过空行
		}
		if currentPart == "" {
			currentPart = trimmed
		} else if len(currentPart) < 20 {
			// 如果当前部分太短，合并到一起
			currentPart = currentPart + " " + trimmed
		} else {
			messageParts = append(messageParts, currentPart)
			currentPart = trimmed
		}
	}
	if currentPart != "" {
		messageParts = append(messageParts, currentPart)
	}

	// 如果只有一条消息，直接发送
	if len(messageParts) <= 1 {
		return c.sendMessageDirect(ctx, chatID, reply)
	}

	// 获取多消息发送间隔
	interval := c.Account.MultiMsgInterval
	if interval <= 0 {
		interval = 5 // 默认5秒
	}

	log.Printf("📤 将发送 %d 条拆分消息，间隔 %d 秒", len(messageParts), interval)

	// 逐条发送
	for i, part := range messageParts {
		if err := c.sendMessageDirect(ctx, chatID, part); err != nil {
			log.Printf("❌ 发送第 %d 条消息失败: %v", i+1, err)
			return err
		}
		log.Printf("📨 已发送第 %d/%d 条: %s", i+1, len(messageParts), truncateStr(part, 50))

		// 如果不是最后一条，等待间隔
		if i < len(messageParts)-1 {
			time.Sleep(time.Duration(interval) * time.Second)
		}
	}

	return nil
}

// sendMessageDirect 直接发送消息（不引用任何消息）
func (c *ClientV2) sendMessageDirect(ctx context.Context, chatID int64, text string) error {
	api := c.TGClient.API()

	// 从数据库获取群组信息
	var group models.Group
	var peer tg.InputPeerClass

	if err := c.DB.Where("chat_id = ?", chatID).First(&group).Error; err != nil {
		log.Printf("⚠️ 未在数据库找到群组 [ID: %d]，尝试按普通群直接发送", chatID)
		peer = &tg.InputPeerChat{ChatID: chatID}
	} else {
		if group.Type == "channel" || group.Type == "supergroup" {
			if group.AccessHash == 0 {
				log.Printf("⚠️ 群组 [ID: %d] 缺少AccessHash，尝试获取", chatID)
				accessHash, err := GetGroupAccessHash(ctx, api, chatID)
				if err != nil {
					log.Printf("⚠️ 无法获取AccessHash: %v", err)
					return fmt.Errorf("需要AccessHash才能发送消息到Channel/Supergroup")
				}
				group.AccessHash = accessHash
				c.DB.Save(&group)
			}

			channelID := chatID
			if channelID < 0 {
				channelID = -channelID
			}
			peer = &tg.InputPeerChannel{
				ChannelID:  channelID,
				AccessHash: group.AccessHash,
			}
		} else {
			chat := chatID
			if chat < 0 {
				chat = -chat
			}
			peer = &tg.InputPeerChat{
				ChatID: chat,
			}
		}
	}

	// 发送消息（不带引用）
	sendFn := func() error {
		req := &tg.MessagesSendMessageRequest{
			Peer:     peer,
			Message:  text,
			RandomID: rand.Int63(),
		}
		// 不设置 ReplyTo，直接发送
		_, err := api.MessagesSendMessage(ctx, req)
		return err
	}

	if err := RetryWithBackoff(ctx, sendFn); err != nil {
		log.Printf("❌ 发送消息失败（已重试）: %v", err)
		return err
	}

	return nil
}

// sendMessage 发送消息（带重试机制，保留用于手动发送）
func (c *ClientV2) sendMessage(ctx context.Context, chatID int64, text string, replyToMsgID int64) error {
	api := c.TGClient.API()

	// 从数据库获取群组信息（优先用于区分普通群/频道以及AccessHash）
	var group models.Group
	var peer tg.InputPeerClass

	if err := c.DB.Where("chat_id = ?", chatID).First(&group).Error; err != nil {
		// 数据库中没有群组记录，回退为按 ChatID 直接发送（适用于普通群）
		log.Printf("⚠️ 未在数据库找到群组 [ID: %d]，尝试按普通群直接发送", chatID)
		peer = &tg.InputPeerChat{ChatID: chatID}
	} else {
		// 根据群组类型构造Peer
		if group.Type == "channel" || group.Type == "supergroup" {
			// Channel或Supergroup需要AccessHash
			if group.AccessHash == 0 {
				log.Printf("⚠️ 群组 [ID: %d] 缺少AccessHash，尝试获取", chatID)
				// 尝试获取AccessHash
				accessHash, err := GetGroupAccessHash(ctx, api, chatID)
				if err != nil {
					log.Printf("⚠️ 无法获取AccessHash: %v", err)
					return fmt.Errorf("需要AccessHash才能发送消息到Channel/Supergroup")
				}
				group.AccessHash = accessHash
				c.DB.Save(&group)
			}

			// ChannelID 在 Telegram 中为正整数，这里做一次绝对值转换，兼容数据库中可能保存的负数ID
			channelID := chatID
			if channelID < 0 {
				channelID = -channelID
			}
			peer = &tg.InputPeerChannel{
				ChannelID:  channelID,
				AccessHash: group.AccessHash,
			}
		} else {
			// 普通群组
			chat := chatID
			if chat < 0 {
				chat = -chat
			}
			peer = &tg.InputPeerChat{
				ChatID: chat,
			}
		}
	}

	// 使用重试机制发送消息
	sendFn := func() error {
		req := &tg.MessagesSendMessageRequest{
			Peer:     peer,
			Message:  text,
			RandomID: rand.Int63(), // 必填随机ID，避免 RANDOM_ID_EMPTY
		}
		// 如果有回复消息ID，添加回复信息
		if replyToMsgID > 0 {
			req.ReplyTo = &tg.InputReplyToMessage{
				ReplyToMsgID: int(replyToMsgID),
			}
		}

		_, err := api.MessagesSendMessage(ctx, req)
		return err
	}

	if err := RetryWithBackoff(ctx, sendFn); err != nil {
		log.Printf("❌ 发送消息失败（已重试）: %v", err)
		return err
	}

	return nil
}

// getGroupAssignment 获取群组分配信息（包含群组级别的配置）
func (c *ClientV2) getGroupAssignment(chatID int64) (*models.AccountGroup, bool) {
	// 先通过 chat_id 找到 group 的数据库 ID
	var group models.Group
	if err := c.DB.Where("chat_id = ?", chatID).First(&group).Error; err != nil {
		// 群组不在数据库中，不处理
		return nil, false
	}

	// 检查 account_groups 表中是否有这个账号和群组的关联
	var accountGroup models.AccountGroup
	err := c.DB.Where("account_id = ? AND group_id = ?", c.Account.ID, group.ID).First(&accountGroup).Error
	if err != nil {
		return nil, false
	}

	return &accountGroup, true
}

// isGroupAssigned 检查群组是否被分配给当前账号（简化版，用于其他地方）
func (c *ClientV2) isGroupAssigned(chatID int64) bool {
	ag, ok := c.getGroupAssignment(chatID)
	if !ok {
		return false
	}
	return ag.Enabled
}

// isGroupAssignedOld 检查群组是否被分配给当前账号（旧版本，保留兼容）
func (c *ClientV2) isGroupAssignedOld(chatID int64) bool {
	// 先通过 chat_id 找到 group 的数据库 ID
	var group models.Group
	if err := c.DB.Where("chat_id = ?", chatID).First(&group).Error; err != nil {
		// 群组不在数据库中，不处理
		return false
	}

	// 检查 account_groups 表中是否有这个账号和群组的关联
	var accountGroup models.AccountGroup
	err := c.DB.Where("account_id = ? AND group_id = ? AND enabled = ?", c.Account.ID, group.ID, true).First(&accountGroup).Error
	if err != nil {
		// 没有找到关联记录，说明这个群组没有分配给当前账号
		return false
	}

	return true
}

// getMessageContext 获取消息上下文
func (c *ClientV2) getMessageContext(chatID int64) []ai.ChatMessage {
	context := c.MessageContext[chatID]
	messages := make([]ai.ChatMessage, 0, len(context))
	
	for _, msg := range context {
		messages = append(messages, ai.ChatMessage{
			Role:    msg.Role,
			Content: msg.Content,
		})
	}
	
	return messages
}

// addMessageContext 添加消息上下文
func (c *ClientV2) addMessageContext(chatID int64, userMsg, aiReply string) {
	if c.MessageContext[chatID] == nil {
		c.MessageContext[chatID] = make([]MessageContext, 0)
	}

	c.MessageContext[chatID] = append(c.MessageContext[chatID],
		MessageContext{Role: "user", Content: userMsg},
		MessageContext{Role: "assistant", Content: aiReply},
	)

	// 保持上下文在合理范围内
	if len(c.MessageContext[chatID]) > 10 {
		c.MessageContext[chatID] = c.MessageContext[chatID][len(c.MessageContext[chatID])-10:]
	}
}

// saveMessageDirect 保存消息记录（不带回复ID）
func (c *ClientV2) saveMessageDirect(chatID int64, content string) {
	var group models.Group
	if err := c.DB.Where("chat_id = ?", chatID).First(&group).Error; err != nil {
		log.Printf("⚠️ 未找到群组 [ID: %d]", chatID)
		return
	}

	message := models.Message{
		AccountID: c.Account.ID,
		GroupID:   group.ID,
		Content:   content,
	}

	c.DB.Create(&message)
}

// saveMessage 保存消息记录（保留用于手动发送）
func (c *ClientV2) saveMessage(chatID int64, content string, replyToID int64) {
	var group models.Group
	if err := c.DB.Where("chat_id = ?", chatID).First(&group).Error; err != nil {
		log.Printf("⚠️ 未找到群组 [ID: %d]", chatID)
		return
	}

	message := models.Message{
		AccountID:         c.Account.ID,
		GroupID:           group.ID,
		TelegramMessageID: replyToID,
		Content:           content,
	}

	c.DB.Create(&message)
}

// Stop 停止客户端
func (c *ClientV2) Stop() {
	if c.Logger != nil {
		c.Logger.Info("停止Telegram客户端")
		defer c.Logger.Close()
	}
	
	log.Printf("🛑 停止Telegram客户端 [账号ID: %d]", c.Account.ID)
	c.Account.Status = "offline"
	c.DB.Save(c.Account)
	c.Cancel()
}

// min 函数已在 client.go 中定义，这里不需要重复定义

