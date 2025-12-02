package models

import (
	"time"

	"gorm.io/gorm"
)

// Account AI账号模型
type Account struct {
	ID            uint           `gorm:"primaryKey" json:"id"`
	PhoneNumber   string         `gorm:"uniqueIndex;not null" json:"phone_number"`
	APIID         int            `gorm:"not null" json:"api_id"`
	APIHash       string         `gorm:"not null" json:"api_hash"`
	SessionFile   string         `gorm:"not null" json:"session_file"`
	Nickname      string         `json:"nickname"`
	Status        string         `gorm:"default:offline" json:"status"` // online/offline/error
	Priority      int            `gorm:"default:5" json:"priority"`
	AIApiKey      string         `gorm:"not null" json:"ai_api_key"`
	AIModel       string         `gorm:"default:gpt-4o-mini" json:"ai_model"`
	SystemPrompt  string         `gorm:"type:text" json:"system_prompt"`
	ReplyInterval int            `gorm:"default:60" json:"reply_interval"` // 发言间隔（秒）
	Tone          string         `json:"tone"`                              // 语气
	Enabled       bool           `gorm:"default:true" json:"enabled"`

	// 消息处理参数
	ListenInterval    int  `gorm:"default:5" json:"listen_interval"`     // 监听处理间隔（秒）
	BufferSize        int  `gorm:"default:10" json:"buffer_size"`        // 消息缓冲数量
	AutoReply         bool `gorm:"default:true" json:"auto_reply"`       // 是否自动回复
	ReplyProbability  int  `gorm:"default:100" json:"reply_probability"` // 回复概率（0-100）
	MultiMsgInterval  int  `gorm:"default:5" json:"multi_msg_interval"`  // 多条消息发送间隔（秒）
	SplitByNewline    bool `gorm:"default:true" json:"split_by_newline"` // 是否按换行拆分消息

	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

// TableName 指定表名
func (Account) TableName() string {
	return "ai_accounts"
}

