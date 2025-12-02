package handlers

import (
	"net/http"
	"strconv"

	"aibot/models"
	"aibot/internal/database"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// GetGroups 获取群组列表
func GetGroups(c *gin.Context) {
	var groups []models.Group
	
	query := database.DB
	
	// 支持分页
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	offset := (page - 1) * pageSize
	
	// 支持搜索
	if search := c.Query("search"); search != "" {
		query = query.Where("title LIKE ? OR username LIKE ?", "%"+search+"%", "%"+search+"%")
	}
	
	// 支持状态过滤
	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}
	
	var total int64
	query.Model(&models.Group{}).Count(&total)
	
	if err := query.Offset(offset).Limit(pageSize).Find(&groups).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败: " + err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"data": groups,
		"total": total,
		"page": page,
		"page_size": pageSize,
	})
}

// GetGroup 获取单个群组
func GetGroup(c *gin.Context) {
	id := c.Param("id")
	
	var group models.Group
	if err := database.DB.First(&group, id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "群组不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败: " + err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{"data": group})
}

// CreateGroup 创建群组
func CreateGroup(c *gin.Context) {
	var group models.Group
	
	if err := c.ShouldBindJSON(&group); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误: " + err.Error()})
		return
	}
	
	// 验证必填字段
	if group.ChatID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "群组ID为必填项"})
		return
	}
	
	// 检查群组是否已存在
	var existing models.Group
	if err := database.DB.Where("chat_id = ?", group.ChatID).First(&existing).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "该群组已存在"})
		return
	}
	
	// 设置默认值
	if group.Status == "" {
		group.Status = "active"
	}
	if group.Type == "" {
		group.Type = "group"
	}
	
	if err := database.DB.Create(&group).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建失败: " + err.Error()})
		return
	}
	
	c.JSON(http.StatusCreated, gin.H{
		"message": "群组创建成功",
		"data": group,
	})
}

// UpdateGroup 更新群组
func UpdateGroup(c *gin.Context) {
	id := c.Param("id")
	
	var group models.Group
	if err := database.DB.First(&group, id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "群组不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败: " + err.Error()})
		return
	}
	
	var updateData models.Group
	if err := c.ShouldBindJSON(&updateData); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误: " + err.Error()})
		return
	}
	
	if err := database.DB.Model(&group).Updates(updateData).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新失败: " + err.Error()})
		return
	}
	
	database.DB.First(&group, id)
	
	c.JSON(http.StatusOK, gin.H{
		"message": "群组更新成功",
		"data": group,
	})
}

// DeleteGroup 删除群组
func DeleteGroup(c *gin.Context) {
	id := c.Param("id")
	
	var group models.Group
	if err := database.DB.First(&group, id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "群组不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败: " + err.Error()})
		return
	}
	
	if err := database.DB.Delete(&group).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除失败: " + err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{"message": "群组删除成功"})
}

// AssignAccounts 为群组分配账号
func AssignAccounts(c *gin.Context) {
	id := c.Param("id")
	
	var group models.Group
	if err := database.DB.First(&group, id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "群组不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败: " + err.Error()})
		return
	}
	
	var request struct {
		AccountIDs []uint `json:"account_ids" binding:"required"`
	}
	
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误: " + err.Error()})
		return
	}
	
	// 删除旧的关联
	database.DB.Where("group_id = ?", group.ID).Delete(&models.AccountGroup{})
	
	// 创建新的关联
	for _, accountID := range request.AccountIDs {
		accountGroup := models.AccountGroup{
			AccountID: accountID,
			GroupID:   group.ID,
		}
		database.DB.Create(&accountGroup)
	}
	
	c.JSON(http.StatusOK, gin.H{"message": "账号分配成功"})
}

// GetGroupAccounts 获取群组的账号列表
func GetGroupAccounts(c *gin.Context) {
	id := c.Param("id")
	
	var accountGroups []models.AccountGroup
	if err := database.DB.Where("group_id = ?", id).Preload("Account").Find(&accountGroups).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败: " + err.Error()})
		return
	}
	
	accounts := make([]models.Account, 0, len(accountGroups))
	for _, ag := range accountGroups {
		accounts = append(accounts, ag.Account)
	}
	
	c.JSON(http.StatusOK, gin.H{"data": accounts})
}

