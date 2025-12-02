package models

import (
	"time"

	"gorm.io/gorm"
)

// Message 发言记录模型
type Message struct {
	ID               uint           `gorm:"primaryKey" json:"id"`
	AccountID        uint           `gorm:"not null;index" json:"account_id"`
	GroupID          uint           `gorm:"not null;index" json:"group_id"`
	TelegramMessageID int64         `json:"telegram_message_id"`
	Content          string         `gorm:"type:text;not null" json:"content"`
	ReplyToMessageID *int64         `json:"reply_to_message_id"`
	Topic            string         `json:"topic"`
	Sentiment        string         `json:"sentiment"` // positive/neutral/negative
	CreatedAt        time.Time      `gorm:"index" json:"created_at"`
	DeletedAt        gorm.DeletedAt  `gorm:"index" json:"deleted_at,omitempty"`
	
	Account Account `gorm:"foreignKey:AccountID" json:"account,omitempty"`
	Group   Group   `gorm:"foreignKey:GroupID" json:"group,omitempty"`
}

// TableName 指定表名
func (Message) TableName() string {
	return "messages"
}

