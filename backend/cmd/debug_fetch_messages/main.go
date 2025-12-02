package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"aibot/internal/config"
	"aibot/internal/database"
	"aibot/models"

	"github.com/joho/godotenv"
	"github.com/gotd/td/telegram"
	"github.com/gotd/td/tg"
)

// 简单调试脚本：使用现有会话，列出部分对话和某个群的最近几条消息
func main() {
	_ = godotenv.Load()

	cfg := config.Load()

	db, err := database.Init(cfg.Database)
	if err != nil {
		log.Fatalf("数据库初始化失败: %v", err)
	}
	defer database.Close(db)

	// 1. 选一个启用的账号
	var account models.Account
	if err := db.Where("enabled = ?", true).First(&account).Error; err != nil {
		log.Fatalf("获取账号失败: %v", err)
	}

	// 调试脚本必须与正式客户端使用同一份 session 文件
	// ClientV2 固定使用 data/sessions/{phone}.session
	sessionPath := filepath.Join("data", "sessions", fmt.Sprintf("%s.session", account.PhoneNumber))

	if _, err := os.Stat(sessionPath); os.IsNotExist(err) {
		log.Fatalf("会话文件不存在: %s\n请先通过管理前端点击“登录”，完成一次验证码/密码登录后再运行本脚本。", sessionPath)
	}

	log.Printf("使用账号 [ID=%d, 手机=%s, Session=%s]", account.ID, account.PhoneNumber, sessionPath)

	// 2. 创建 Telegram 客户端，使用已有会话
	client := telegram.NewClient(
		account.APIID,
		account.APIHash,
		telegram.Options{
			SessionStorage: &telegram.FileSessionStorage{
				Path: sessionPath,
			},
		},
	)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	if err := client.Run(ctx, func(ctx context.Context) error {
		api := client.API()

		// 3. 打印 Dialog 列表，测试读取能力
		log.Println("=== 获取 Dialog 列表（最多 20 个）===")
		dialogs, err := api.MessagesGetDialogs(ctx, &tg.MessagesGetDialogsRequest{
			Limit:      20,
			OffsetDate: 0,
			OffsetID:   0,
			OffsetPeer: &tg.InputPeerEmpty{},
		})
		if err != nil {
			// 特殊处理 AUTH_KEY_UNREGISTERED，给出更明确的指引
			if strings.Contains(err.Error(), "AUTH_KEY_UNREGISTERED") {
				return fmt.Errorf("AUTH_KEY_UNREGISTERED —— 当前 data/sessions 下的会话已失效，请删除文件再重新在前端登录:\n  rm -f %s", sessionPath)
			}
			return fmt.Errorf("MessagesGetDialogs 失败: %w", err)
		}

		switch d := dialogs.(type) {
		case *tg.MessagesDialogs:
			printChats(d.Chats)
		case *tg.MessagesDialogsSlice:
			printChats(d.Chats)
		default:
			log.Printf("未知的 dialogs 类型: %T", dialogs)
		}

		// 4. 尝试对第一个频道/超级群拉取最近消息
		var targetChannel *tg.Channel
		switch d := dialogs.(type) {
		case *tg.MessagesDialogs:
			for _, chat := range d.Chats {
				if ch, ok := chat.(*tg.Channel); ok {
					targetChannel = ch
					break
				}
			}
		case *tg.MessagesDialogsSlice:
			for _, chat := range d.Chats {
				if ch, ok := chat.(*tg.Channel); ok {
					targetChannel = ch
					break
				}
			}
		}

		if targetChannel == nil {
			log.Println("未找到频道/超级群，脚本结束。")
			return nil
		}

		log.Printf("=== 读取频道/超级群最近消息: %s [ID=%d, AccessHash=%d] ===",
			targetChannel.Title, targetChannel.ID, targetChannel.AccessHash)

		peer := &tg.InputPeerChannel{
			ChannelID: targetChannel.ID,
			AccessHash: targetChannel.AccessHash,
		}

		history, err := api.MessagesGetHistory(ctx, &tg.MessagesGetHistoryRequest{
			Peer:  peer,
			Limit: 10,
		})
		if err != nil {
			return fmt.Errorf("MessagesGetHistory 失败: %w", err)
		}

		switch h := history.(type) {
		case *tg.MessagesChannelMessages:
			for _, msg := range h.Messages {
				if m, ok := msg.(*tg.Message); ok {
					log.Printf("[消息ID=%d] %s", m.ID, truncate(m.Message, 120))
				}
			}
		case *tg.MessagesMessages:
			for _, msg := range h.Messages {
				if m, ok := msg.(*tg.Message); ok {
					log.Printf("[消息ID=%d] %s", m.ID, truncate(m.Message, 120))
				}
			}
		default:
			log.Printf("未知的 history 类型: %T", history)
		}

		return nil
	}); err != nil {
		log.Printf("脚本执行出错: %v", err)
		os.Exit(1)
	}

	log.Println("脚本执行完成。")
}

func printChats(chats []tg.ChatClass) {
	for _, chat := range chats {
		switch c := chat.(type) {
		case *tg.Chat:
			log.Printf("[群组] ID=%d, 标题=%s, 成员=%d", c.ID, c.Title, c.ParticipantsCount)
		case *tg.Channel:
			typ := "channel"
			if !c.Broadcast {
				typ = "supergroup"
			}
			log.Printf("[%s] ID=%d, 标题=%s, Username=%s, AccessHash=%d",
				typ, c.ID, c.Title, c.Username, c.AccessHash)
		default:
			log.Printf("[其他聊天类型] %T", chat)
		}
	}
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}


