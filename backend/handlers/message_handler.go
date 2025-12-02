package handlers

import (
	"net/http"
	"strconv"
	"time"

	"aibot/internal/database"
	"aibot/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// GetMessages 获取消息列表
func GetMessages(c *gin.Context) {
	var messages []models.Message
	
	query := database.DB.Preload("Account").Preload("Group")
	
	// 支持分页
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "50"))
	offset := (page - 1) * pageSize
	
	// 支持账号过滤
	if accountID := c.Query("account_id"); accountID != "" {
		query = query.Where("account_id = ?", accountID)
	}
	
	// 支持群组过滤
	if groupID := c.Query("group_id"); groupID != "" {
		query = query.Where("group_id = ?", groupID)
	}
	
	// 支持时间范围
	if startTime := c.Query("start_time"); startTime != "" {
		if t, err := time.Parse("2006-01-02 15:04:05", startTime); err == nil {
			query = query.Where("created_at >= ?", t)
		}
	}
	if endTime := c.Query("end_time"); endTime != "" {
		if t, err := time.Parse("2006-01-02 15:04:05", endTime); err == nil {
			query = query.Where("created_at <= ?", t)
		}
	}
	
	// 支持内容搜索
	if search := c.Query("search"); search != "" {
		query = query.Where("content LIKE ?", "%"+search+"%")
	}
	
	// 按时间倒序
	query = query.Order("created_at DESC")
	
	var total int64
	query.Model(&models.Message{}).Count(&total)
	
	if err := query.Offset(offset).Limit(pageSize).Find(&messages).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败: " + err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"data": messages,
		"total": total,
		"page": page,
		"page_size": pageSize,
	})
}

// GetMessage 获取单个消息
func GetMessage(c *gin.Context) {
	id := c.Param("id")
	
	var message models.Message
	if err := database.DB.Preload("Account").Preload("Group").First(&message, id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "消息不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败: " + err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{"data": message})
}

// SendMessage 手动发送消息
func SendMessage(c *gin.Context) {
	var request struct {
		AccountID uint   `json:"account_id" binding:"required"`
		GroupID   uint   `json:"group_id" binding:"required"`
		Content   string `json:"content" binding:"required"`
	}
	
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误: " + err.Error()})
		return
	}
	
	// 验证账号和群组是否存在
	var account models.Account
	if err := database.DB.First(&account, request.AccountID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "账号不存在"})
		return
	}
	
	var group models.Group
	if err := database.DB.First(&group, request.GroupID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "群组不存在"})
		return
	}

	// 调用Telegram管理器发送消息
	if tgManagerGetter == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Telegram管理器未初始化"})
		return
	}

	manager := tgManagerGetter()
	if manager == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "无法获取Telegram管理器"})
		return
	}

	type ManagerInterface interface {
		SendMessageToGroup(accountID uint, groupID uint, text string) error
	}

	mgr, ok := manager.(ManagerInterface)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "管理器类型不匹配"})
		return
	}

	if err := mgr.SendMessageToGroup(request.AccountID, request.GroupID, request.Content); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "发送消息失败: " + err.Error()})
		return
	}

	// 发送成功，具体消息记录由Telegram客户端在 saveMessage 中写入
	c.JSON(http.StatusOK, gin.H{
		"message": "消息发送请求已提交",
	})
}

