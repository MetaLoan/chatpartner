package main

import (
	"context"
	"fmt"
	"log"
	"path/filepath"
	"time"

	"aibot/internal/config"
	"aibot/internal/database"
	"aibot/models"

	"github.com/gotd/td/telegram"
	"github.com/gotd/td/tg"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()
	cfg := config.Load()

	db, err := database.Init(cfg.Database)
	if err != nil {
		log.Fatalf("数据库初始化失败: %v", err)
	}
	defer database.Close(db)

	var account models.Account
	if err := db.Where("enabled = ?", true).First(&account).Error; err != nil {
		log.Fatalf("获取账号失败: %v", err)
	}

	sessionDir := filepath.Join("data", "sessions")
	sessionPath := filepath.Join(sessionDir, fmt.Sprintf("%s.session", account.PhoneNumber))

	log.Printf("使用账号: %s, Session: %s", account.PhoneNumber, sessionPath)

	client := telegram.NewClient(
		account.APIID,
		account.APIHash,
		telegram.Options{
			SessionStorage: &telegram.FileSessionStorage{Path: sessionPath},
		},
	)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	if err := client.Run(ctx, func(ctx context.Context) error {
		api := client.API()

		// Gate官方中文群的信息
		channelID := int64(1890976631)
		accessHash := int64(1965011256713499017)

		peer := &tg.InputPeerChannel{
			ChannelID:  channelID,
			AccessHash: accessHash,
		}

		log.Printf("尝试获取 Gate官方中文群 的最近消息...")

		history, err := api.MessagesGetHistory(ctx, &tg.MessagesGetHistoryRequest{
			Peer:  peer,
			Limit: 10,
		})
		if err != nil {
			return fmt.Errorf("获取历史消息失败: %w", err)
		}

		switch h := history.(type) {
		case *tg.MessagesChannelMessages:
			log.Printf("获取到 %d 条消息", len(h.Messages))
			for _, msg := range h.Messages {
				if m, ok := msg.(*tg.Message); ok {
					log.Printf("[消息ID=%d] %s", m.ID, truncate(m.Message, 100))
				}
			}
		case *tg.MessagesMessages:
			log.Printf("获取到 %d 条消息", len(h.Messages))
			for _, msg := range h.Messages {
				if m, ok := msg.(*tg.Message); ok {
					log.Printf("[消息ID=%d] %s", m.ID, truncate(m.Message, 100))
				}
			}
		default:
			log.Printf("未知的 history 类型: %T", history)
		}

		return nil
	}); err != nil {
		log.Fatalf("执行失败: %v", err)
	}

	log.Println("完成")
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

