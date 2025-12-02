package models

import (
	"time"

	"gorm.io/gorm"
)

// 使用 gorm.DeletedAt 类型
var _ gorm.DeletedAt

// GlobalMainPrompt 全局主线提示词
type GlobalMainPrompt struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	Version     int       `gorm:"not null;index" json:"version"`
	Content     string    `gorm:"type:text;not null" json:"content"`
	Description string    `gorm:"type:varchar(500)" json:"description"`
	Enabled     bool      `gorm:"default:true" json:"enabled"`
	CreatedBy   uint      `json:"created_by"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// TableName 指定表名
func (GlobalMainPrompt) TableName() string {
	return "global_main_prompts"
}

// AccountPromptConfig 账号提示词配置
type AccountPromptConfig struct {
	ID                  uint      `gorm:"primaryKey" json:"id"`
	AccountID           uint      `gorm:"uniqueIndex;not null" json:"account_id"`
	UseGlobalMainPrompt bool      `gorm:"default:true" json:"use_global_main_prompt"`
	CombineMode         string    `gorm:"default:framework" json:"combine_mode"` // framework/overlay/override
	AccountPrompt       string    `gorm:"type:text" json:"account_prompt"`
	CombinedPrompt      string    `gorm:"type:text" json:"combined_prompt"` // 缓存
	CreatedAt           time.Time `json:"created_at"`
	UpdatedAt           time.Time `json:"updated_at"`
	
	Account Account `gorm:"foreignKey:AccountID" json:"account,omitempty"`
}

// TableName 指定表名
func (AccountPromptConfig) TableName() string {
	return "account_prompt_configs"
}

