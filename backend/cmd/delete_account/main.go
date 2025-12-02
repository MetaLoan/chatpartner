package main

import (
	"flag"
	"fmt"
	"log"
	"os"

	"aibot/internal/config"
	"aibot/internal/database"
	"aibot/models"

	"github.com/joho/godotenv"
)

// 小工具：从数据库中彻底删除一个账号及其关联记录
//
// 使用方式：
//   cd backend
//   go run ./cmd/delete_account -id 5
//
// 只会删除：
//   - ai_accounts 表中的账号记录
//   - auth_sessions 表中该账号的认证会话
//   - account_groups 表中该账号与群组的关联
//
// 不会动 messages / groups 表里的数据。
func main() {
	_ = godotenv.Load()

	var id uint
	flag.UintVar(&id, "id", 0, "要删除的账号ID")
	flag.Parse()

	if id == 0 {
		log.Fatalf("请通过 -id 指定要删除的账号ID，例如：go run ./cmd/delete_account -id 5")
	}

	cfg := config.Load()

	db, err := database.Init(cfg.Database)
	if err != nil {
		log.Fatalf("数据库初始化失败: %v", err)
	}
	defer database.Close(db)

	var account models.Account
	if err := db.First(&account, id).Error; err != nil {
		log.Fatalf("查询账号失败（ID=%d）: %v", id, err)
	}

	log.Printf("准备删除账号: ID=%d, 手机=%s, 昵称=%s", account.ID, account.PhoneNumber, account.Nickname)

	// 删除认证会话
	if err := db.Unscoped().Where("account_id = ?", account.ID).Delete(&models.AuthSession{}).Error; err != nil {
		log.Fatalf("删除 auth_sessions 失败: %v", err)
	}
	log.Printf("已删除 auth_sessions 中 account_id = %d 的记录", account.ID)

	// 删除账号-群组关联
	if err := db.Unscoped().Where("account_id = ?", account.ID).Delete(&models.AccountGroup{}).Error; err != nil {
		log.Fatalf("删除 account_groups 失败: %v", err)
	}
	log.Printf("已删除 account_groups 中 account_id = %d 的记录", account.ID)

	// 删除该账号关联的消息记录（可选，如果你想保留历史消息，可以去掉这一步）
	if err := db.Unscoped().Where("account_id = ?", account.ID).Delete(&models.Message{}).Error; err != nil {
		log.Fatalf("删除 messages 失败: %v", err)
	}
	log.Printf("已删除 messages 中 account_id = %d 的记录", account.ID)

	// 最后删除账号本身
	if err := db.Unscoped().Delete(&account).Error; err != nil {
		log.Fatalf("删除 ai_accounts 失败: %v", err)
	}
	log.Printf("已删除 ai_accounts 中 ID = %d 的账号记录", account.ID)

	fmt.Println("✅ 账号及其关联记录已从数据库中彻底删除。")

	// 额外提示：会话文件如果还在磁盘上，可以手动删除
	if account.SessionFile != "" {
		fmt.Printf("提示：你可以手动删除本地会话文件: %s\n", account.SessionFile)
	}

	os.Exit(0)
}


