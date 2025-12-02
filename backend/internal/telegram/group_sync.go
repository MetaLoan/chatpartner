package telegram

import (
	"context"
	"fmt"
	"log"

	"aibot/models"

	"github.com/gotd/td/tg"
	"gorm.io/gorm"
)

// SyncGroups 同步群组信息
func SyncGroups(ctx context.Context, api *tg.Client, db *gorm.DB, accountID uint) error {
	log.Printf("🔄 开始同步群组信息 [账号ID: %d]", accountID)

	// 获取所有对话
	dialogs, err := api.MessagesGetDialogs(ctx, &tg.MessagesGetDialogsRequest{
		Limit:      100,
		OffsetDate: 0,
		OffsetID:   0,
		// 为避免 offset_peer 为 nil，引入一个空的 InputPeer
		OffsetPeer: &tg.InputPeerEmpty{},
	})
	if err != nil {
		return fmt.Errorf("获取对话列表失败: %w", err)
	}

	// 处理对话 - 需要根据实际返回类型处理
	var allChats []tg.ChatClass
	
	// 类型断言获取chats
	switch d := dialogs.(type) {
	case *tg.MessagesDialogs:
		allChats = d.Chats
	case *tg.MessagesDialogsSlice:
		allChats = d.Chats
	default:
		log.Printf("⚠️ 未知的对话类型，跳过群组同步")
		return nil
	}

	// 处理所有聊天（包括群组和频道）
	for _, chat := range allChats {
		switch c := chat.(type) {
		case *tg.Chat:
			// 普通群组
			group := models.Group{
				ChatID:      int64(c.ID),
				Title:       c.Title,
				Type:        "group",
				MemberCount: int(c.ParticipantsCount),
			}
			saveOrUpdateGroup(db, &group)
			
		case *tg.Channel:
			// 频道或超级群组
			groupType := "channel"
			if !c.Broadcast {
				groupType = "supergroup"
			}
			
			group := models.Group{
				ChatID:      int64(c.ID),
				AccessHash:  c.AccessHash,
				Title:       c.Title,
				Username:    c.Username,
				Type:        groupType,
				MemberCount: int(c.ParticipantsCount),
			}
			saveOrUpdateGroup(db, &group)
		}
	}

	log.Printf("✅ 群组同步完成 [账号ID: %d]", accountID)
	return nil
}

// saveOrUpdateGroup 保存或更新群组
func saveOrUpdateGroup(db *gorm.DB, group *models.Group) {
	var existing models.Group
	if err := db.Where("chat_id = ?", group.ChatID).First(&existing).Error; err != nil {
		// 不存在，创建
		if err := db.Create(group).Error; err != nil {
			log.Printf("⚠️ 创建群组失败 [ID: %d]: %v", group.ChatID, err)
		} else {
			log.Printf("✅ 创建群组: %s [ID: %d]", group.Title, group.ChatID)
		}
	} else {
		// 存在，更新
		existing.AccessHash = group.AccessHash
		existing.Title = group.Title
		existing.Username = group.Username
		existing.Type = group.Type
		existing.MemberCount = group.MemberCount
		if err := db.Save(&existing).Error; err != nil {
			log.Printf("⚠️ 更新群组失败 [ID: %d]: %v", group.ChatID, err)
		} else {
			log.Printf("🔄 更新群组: %s [ID: %d]", group.Title, group.ChatID)
		}
	}
}

// GetGroupAccessHash 获取群组的AccessHash
func GetGroupAccessHash(ctx context.Context, api *tg.Client, chatID int64) (int64, error) {
	// 尝试通过ResolveUsername获取（如果有用户名）
	// 或通过GetFullChannel获取
	
	// 这里简化处理，实际需要根据群组类型调用不同的API
	// 暂时返回0，表示需要从数据库获取
	return 0, fmt.Errorf("需要从数据库获取AccessHash")
}

