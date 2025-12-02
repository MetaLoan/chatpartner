package telegram

import (
	"context"
	"fmt"
	"log"
	"sync"

	"aibot/internal/ai"
	"aibot/internal/config"
	"aibot/models"

	"gorm.io/gorm"
)

// Manager Telegram客户端管理器
type Manager struct {
	config      config.TelegramConfig
	clients     map[uint]ClientInterface
	authHelpers map[uint]*AuthHelper // 认证助手映射
	aiService   *ai.Service
	db          *gorm.DB
	mu          sync.RWMutex
}

// ClientInterface 客户端接口
type ClientInterface interface {
	Start() error
	Stop()
}

// NewManager 创建管理器
func NewManager(cfg config.TelegramConfig) *Manager {
	return &Manager{
		config:      cfg,
		clients:     make(map[uint]ClientInterface),
		authHelpers: make(map[uint]*AuthHelper),
		aiService:   ai.NewService(),
	}
}

// SetDB 设置数据库连接
func (m *Manager) SetDB(db *gorm.DB) {
	m.db = db
}

// Start 启动管理器
func (m *Manager) Start() error {
	log.Println("📱 Telegram客户端管理器启动中...")

	// 从数据库加载所有启用的账号
	var accounts []models.Account
	if err := m.db.Where("enabled = ?", true).Find(&accounts).Error; err != nil {
		return err
	}

	// 为每个账号启动客户端
	for _, account := range accounts {
		if err := m.AddClient(&account); err != nil {
			log.Printf("❌ 启动账号 [ID: %d] 失败: %v", account.ID, err)
			continue
		}
	}

	log.Printf("✅ 已启动 %d 个Telegram客户端", len(m.clients))
	return nil
}

// AddClient 添加客户端
func (m *Manager) AddClient(account *models.Account) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// 如果客户端已存在，先停止
	if client, ok := m.clients[account.ID]; ok {
		client.Stop()
	}

	// 创建新客户端（使用改进版）
	client, err := NewClientV2(account, m.db, m.aiService)
	if err != nil {
		return err
	}

	// 由于当前已经持有写锁，直接更新映射，避免在锁内再次调用 SetAuthHelper 造成死锁
	m.clients[account.ID] = client
	if client.AuthHelper != nil {
		m.authHelpers[account.ID] = client.AuthHelper
	}

	// 启动客户端（异步）
	go func() {
		if err := client.Start(); err != nil {
			log.Printf("❌ 客户端 [ID: %d] 运行失败: %v", account.ID, err)
			// 更新账号状态为错误
			account.Status = "error"
			m.db.Save(account)
		}
	}()

	return nil
}

// RemoveClient 移除客户端
func (m *Manager) RemoveClient(accountID uint) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if client, ok := m.clients[accountID]; ok {
		client.Stop()
		delete(m.clients, accountID)
	}

	return nil
}

// GetClient 获取客户端
func (m *Manager) GetClient(accountID uint) (ClientInterface, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	client, ok := m.clients[accountID]
	return client, ok
}

// GetAllClients 获取所有客户端
func (m *Manager) GetAllClients() map[uint]ClientInterface {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.clients
}

// GetAuthHelper 获取认证助手
func (m *Manager) GetAuthHelper(accountID uint) (interface{}, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	helper, ok := m.authHelpers[accountID]
	return helper, ok
}

// SetAuthHelper 设置认证助手
func (m *Manager) SetAuthHelper(accountID uint, helper *AuthHelper) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.authHelpers[accountID] = helper
}

// SendMessageToGroup 通过指定账号向指定群组发送一条消息
func (m *Manager) SendMessageToGroup(accountID uint, groupID uint, text string) error {
	m.mu.RLock()
	clientIface, ok := m.clients[accountID]
	m.mu.RUnlock()
	if !ok {
		return fmt.Errorf("未找到账号对应的Telegram客户端 [account_id=%d]", accountID)
	}

	// 查询群组获取 chat_id
	var group models.Group
	if err := m.db.First(&group, groupID).Error; err != nil {
		return fmt.Errorf("群组不存在或查询失败: %w", err)
	}

	client, ok := clientIface.(*ClientV2)
	if !ok {
		return fmt.Errorf("客户端类型不支持手动发送消息")
	}

	ctx := client.Context
	if ctx == nil {
		ctx = context.Background()
	}

	log.Printf("✉️ 手动发送消息 [账号ID: %d, 群组ID: %d, ChatID: %d]", accountID, groupID, group.ChatID)
	return client.sendMessage(ctx, group.ChatID, text, 0)
}

