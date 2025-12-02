package models

import (
	"time"

	"gorm.io/gorm"
)

// AuthSession 认证会话（用于存储验证码等信息）
type AuthSession struct {
	ID            uint           `gorm:"primaryKey" json:"id"`
	AccountID     uint           `gorm:"not null;index" json:"account_id"`
	PhoneNumber   string         `gorm:"not null" json:"phone_number"`
	State         string         `gorm:"not null" json:"state"` // waiting_code/waiting_password/completed
	CodeHash      string         `json:"code_hash"`              // 验证码哈希
	Password      string         `json:"password"`                // 2FA密码（加密存储）
	ExpiresAt     time.Time      `json:"expires_at"`              // 过期时间
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
	
	Account Account `gorm:"foreignKey:AccountID" json:"account,omitempty"`
}

// TableName 指定表名
func (AuthSession) TableName() string {
	return "auth_sessions"
}

