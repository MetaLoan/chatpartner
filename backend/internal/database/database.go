package database

import (
	"fmt"
	"log"

	"aibot/internal/config"
	"aibot/models"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func Init(cfg config.DatabaseConfig) (*gorm.DB, error) {
	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		cfg.Host, cfg.Port, cfg.User, cfg.Password, cfg.Name, cfg.SSLMode,
	)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		return nil, fmt.Errorf("连接数据库失败: %w", err)
	}

	DB = db
	log.Println("✅ 数据库连接成功")

	// 自动迁移
	if err := db.AutoMigrate(
		&models.Account{},
		&models.Group{},
		&models.AccountGroup{},
		&models.Message{},
		&models.GlobalMainPrompt{},
		&models.AccountPromptConfig{},
		&models.AuthSession{},
	); err != nil {
		return nil, fmt.Errorf("数据库迁移失败: %w", err)
	}

	log.Println("✅ 数据库迁移完成")

	return db, nil
}

func Close(db *gorm.DB) {
	sqlDB, err := db.DB()
	if err != nil {
		log.Printf("获取数据库连接失败: %v", err)
		return
	}
	if err := sqlDB.Close(); err != nil {
		log.Printf("关闭数据库连接失败: %v", err)
	}
}

