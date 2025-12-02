package main

import (
	"log"
	"time"

	"aibot/internal/config"
	"aibot/internal/database"
	"aibot/internal/server"
	"aibot/internal/telegram"

	"github.com/joho/godotenv"
)

func main() {
	// 加载环境变量
	if err := godotenv.Load(); err != nil {
		log.Println("未找到 .env 文件，使用环境变量")
	}

	// 加载配置
	cfg := config.Load()

	// 初始化数据库
	db, err := database.Init(cfg.Database)
	if err != nil {
		log.Fatalf("数据库初始化失败: %v", err)
	}
	defer database.Close(db)

	// 初始化Telegram客户端管理器
	tgManager := telegram.NewManager(cfg.Telegram)
	tgManager.SetDB(db)

	// 启动Telegram客户端（异步）
	go func() {
		if err := tgManager.Start(); err != nil {
			log.Printf("⚠️ Telegram客户端启动失败: %v", err)
		}
	}()

	// 稍等片刻，让 Telegram 管理器完成初始化
	time.Sleep(2 * time.Second)

	// 启动HTTP服务器
	srv := server.New(cfg, db, tgManager)
	if err := srv.Start(); err != nil {
		log.Fatalf("服务器启动失败: %v", err)
	}
}

