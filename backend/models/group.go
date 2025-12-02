package models

import (
	"time"

	"gorm.io/gorm"
)

// Group 群组模型
type Group struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	ChatID      int64          `gorm:"uniqueIndex;not null" json:"chat_id"`
	AccessHash  int64          `json:"access_hash"`          // Telegram AccessHash（用于发送消息）
	Username    string         `json:"username"`
	Title       string         `json:"title"`
	Type        string         `json:"type"`                  // group/supergroup/channel
	Status      string         `gorm:"default:active" json:"status"` // active/inactive
	Language    string         `json:"language"`
	MemberCount int            `json:"member_count"`         // 成员数量
	Description string         `gorm:"type:text" json:"description"` // 群组描述
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

// TableName 指定表名
func (Group) TableName() string {
	return "groups"
}

// AccountGroup 账号-群组关联表
type AccountGroup struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	AccountID       uint      `gorm:"not null;index" json:"account_id"`
	GroupID         uint      `gorm:"not null;index" json:"group_id"`
	Priority        int       `gorm:"default:5" json:"priority"`
	ReplyProbability float64   `gorm:"default:0.3" json:"reply_probability"`
	Enabled         bool      `gorm:"default:true" json:"enabled"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
	
	Account Account `gorm:"foreignKey:AccountID" json:"account,omitempty"`
	Group   Group   `gorm:"foreignKey:GroupID" json:"group,omitempty"`
}

// TableName 指定表名
func (AccountGroup) TableName() string {
	return "account_groups"
}

