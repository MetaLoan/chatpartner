package telegram

import (
	"context"
	"crypto/rand"
	"fmt"
	"log"
	"time"

	"aibot/models"

	"github.com/gotd/td/telegram"
	"github.com/gotd/td/telegram/auth"
	"github.com/gotd/td/tg"
	"gorm.io/gorm"
)

// AuthHelper 认证助手
type AuthHelper struct {
	client    *telegram.Client
	account   *models.Account
	db        *gorm.DB
	codeChan  chan string
	passwordChan chan string
}

// NewAuthHelper 创建认证助手
func NewAuthHelper(client *telegram.Client, account *models.Account, db *gorm.DB) *AuthHelper {
	return &AuthHelper{
		client:       client,
		account:      account,
		db:           db,
		codeChan:     make(chan string, 1),
		passwordChan: make(chan string, 1),
	}
}

// Authenticate 执行认证流程
func (h *AuthHelper) Authenticate(ctx context.Context) error {
	api := h.client.API()

	// 创建交互式认证，实现 auth.Flow 接口
	interactiveAuth := &InteractiveAuth{
		phone:        h.account.PhoneNumber,
		codeChan:     h.codeChan,
		passwordChan: h.passwordChan,
		accountID:    h.account.ID,
		db:           h.db,
	}

	// gotd 认证流程：
	// 1. 创建 Flow（封装验证码 / 密码交互）
	// 2. 使用 auth.Client.IfNecessary 执行登录（如果已有会话则直接跳过）
	flow := auth.NewFlow(interactiveAuth, auth.SendCodeOptions{})
	authClient := auth.NewClient(api, rand.Reader, h.account.APIID, h.account.APIHash)

	if err := authClient.IfNecessary(ctx, flow); err != nil {
		return fmt.Errorf("认证失败: %w", err)
	}

	log.Printf("✅ 认证成功 [账号ID: %d]", h.account.ID)
	return nil
}

// SubmitCode 提交验证码
func (h *AuthHelper) SubmitCode(code string) error {
	select {
	case h.codeChan <- code:
		return nil
	case <-time.After(5 * time.Second):
		return fmt.Errorf("提交验证码超时")
	}
}

// SubmitPassword 提交2FA密码
func (h *AuthHelper) SubmitPassword(password string) error {
	select {
	case h.passwordChan <- password:
		return nil
	case <-time.After(5 * time.Second):
		return fmt.Errorf("提交密码超时")
	}
}

// InteractiveAuth 交互式认证
type InteractiveAuth struct {
	phone        string
	codeChan     chan string
	passwordChan chan string
	accountID    uint
	db           *gorm.DB
}

// Phone 返回手机号
func (a *InteractiveAuth) Phone(ctx context.Context) (string, error) {
	return a.phone, nil
}

// Password 返回2FA密码
func (a *InteractiveAuth) Password(ctx context.Context) (string, error) {
	// 更新认证会话状态
	var authSession models.AuthSession
	if err := a.db.Where("account_id = ?", a.accountID).
		Order("created_at DESC").First(&authSession).Error; err == nil {
		authSession.State = "waiting_password"
		authSession.ExpiresAt = time.Now().Add(5 * time.Minute)
		a.db.Save(&authSession)
	}
	
	log.Printf("📱 需要2FA密码 [账号ID: %d]", a.accountID)
	
	// 等待密码输入
	select {
	case password := <-a.passwordChan:
		return password, nil
	case <-ctx.Done():
		return "", ctx.Err()
	case <-time.After(5 * time.Minute):
		return "", fmt.Errorf("等待密码超时")
	}
}

// Code 返回验证码
func (a *InteractiveAuth) Code(ctx context.Context, sentCode *tg.AuthSentCode) (string, error) {
	// 创建或更新认证会话
	authSession := models.AuthSession{
		AccountID:   a.accountID,
		PhoneNumber: a.phone,
		State:       "waiting_code",
		CodeHash:    "", // 可以从sentCode获取
		ExpiresAt:   time.Now().Add(5 * time.Minute),
	}
	
	// 删除旧的会话
	a.db.Where("account_id = ?", a.accountID).Delete(&models.AuthSession{})
	
	// 创建新会话
	a.db.Create(&authSession)
	
	log.Printf("📱 需要验证码 [账号ID: %d]，请通过API提交验证码", a.accountID)
	
	// 等待验证码输入
	select {
	case code := <-a.codeChan:
		// 更新会话状态
		authSession.State = "completed"
		a.db.Save(&authSession)
		return code, nil
	case <-ctx.Done():
		return "", ctx.Err()
	case <-time.After(5 * time.Minute):
		return "", fmt.Errorf("等待验证码超时")
	}
}

// AcceptTermsOfService 接受服务条款
func (a *InteractiveAuth) AcceptTermsOfService(ctx context.Context, tos tg.HelpTermsOfService) error {
	return nil
}

// SignUp 注册新账号
func (a *InteractiveAuth) SignUp(ctx context.Context) (auth.UserInfo, error) {
	return auth.UserInfo{}, fmt.Errorf("不支持注册新账号")
}

// NoSignUp 不注册
func (a *InteractiveAuth) NoSignUp(ctx context.Context) error {
	return fmt.Errorf("不支持注册")
}

