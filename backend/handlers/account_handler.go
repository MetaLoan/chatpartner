package handlers

import (
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"aibot/internal/database"
	"aibot/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

var tgManagerInstance *interface{} // 临时方案，后续改为依赖注入

// SetTGManager 设置Telegram管理器（临时方案）
func SetTGManager(manager interface{}) {
	tgManagerInstance = &manager
}

// GetAccounts 获取账号列表
func GetAccounts(c *gin.Context) {
	var accounts []models.Account
	
	query := database.DB
	
	// 支持分页
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	offset := (page - 1) * pageSize
	
	// 支持搜索
	if search := c.Query("search"); search != "" {
		query = query.Where("phone_number LIKE ? OR nickname LIKE ?", "%"+search+"%", "%"+search+"%")
	}
	
	// 支持状态过滤
	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}
	
	var total int64
	query.Model(&models.Account{}).Count(&total)
	
	if err := query.Offset(offset).Limit(pageSize).Find(&accounts).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败: " + err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"data": accounts,
		"total": total,
		"page": page,
		"page_size": pageSize,
	})
}

// GetAccount 获取单个账号
func GetAccount(c *gin.Context) {
	id := c.Param("id")
	
	var account models.Account
	if err := database.DB.First(&account, id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "账号不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败: " + err.Error()})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{"data": account})
}

// CreateAccount 创建账号
func CreateAccount(c *gin.Context) {
	var account models.Account
	
	if err := c.ShouldBindJSON(&account); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误: " + err.Error()})
		return
	}

	// 基本清洗，去掉前后空格，避免 API_HASH 前后多空格导致 Telegram 报错
	account.PhoneNumber = strings.TrimSpace(account.PhoneNumber)
	account.APIHash = strings.TrimSpace(account.APIHash)
	account.Nickname = strings.TrimSpace(account.Nickname)
	
	// 验证必填字段
	if account.PhoneNumber == "" || account.APIID == 0 || account.APIHash == "" || account.AIApiKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "手机号、API ID、API Hash和AI API Key为必填项"})
		return
	}

	// 检查手机号是否已存在（包含已软删除的记录）
	var existing models.Account
	if err := database.DB.Unscoped().Where("phone_number = ?", account.PhoneNumber).First(&existing).Error; err == nil {
		// 如果是已软删除的账号，则直接“恢复并更新”而不是新建，避免唯一索引冲突
		if existing.DeletedAt.Valid {
			existing.APIID = account.APIID
			existing.APIHash = account.APIHash
			existing.AIApiKey = account.AIApiKey
			existing.AIModel = account.AIModel
			existing.SystemPrompt = account.SystemPrompt
			existing.ReplyInterval = account.ReplyInterval
			existing.Priority = account.Priority
			existing.Enabled = account.Enabled
			existing.Nickname = account.Nickname
			existing.SessionFile = account.SessionFile
			// 清除删除标记
			existing.DeletedAt = gorm.DeletedAt{}

			if err := database.DB.Save(&existing).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "恢复已删除账号失败: " + err.Error()})
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"message": "检测到该手机号的历史账号，已为你恢复并更新配置",
				"data":    existing,
			})
			return
		}

		// 已存在未删除账号
		c.JSON(http.StatusConflict, gin.H{"error": "该手机号已存在"})
		return
	} else if err != nil && err != gorm.ErrRecordNotFound {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "检查手机号失败: " + err.Error()})
		return
	}
	
	// 设置默认值
	if account.SessionFile == "" {
		account.SessionFile = "sessions/" + account.PhoneNumber + ".session"
	}
	if account.Status == "" {
		account.Status = "offline"
	}
	if account.AIModel == "" {
		account.AIModel = "gpt-4o-mini"
	}
	if account.ReplyInterval == 0 {
		account.ReplyInterval = 60
	}
	
	if err := database.DB.Create(&account).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建失败: " + err.Error()})
		return
	}
	
	c.JSON(http.StatusCreated, gin.H{
		"message": "账号创建成功",
		"data": account,
	})
}

// UpdateAccount 更新账号
func UpdateAccount(c *gin.Context) {
	id := c.Param("id")
	
	var account models.Account
	if err := database.DB.First(&account, id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "账号不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败: " + err.Error()})
		return
	}
	
	var updateData models.Account
	if err := c.ShouldBindJSON(&updateData); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误: " + err.Error()})
		return
	}

	// 清洗更新数据
	updateData.PhoneNumber = strings.TrimSpace(updateData.PhoneNumber)
	updateData.APIHash = strings.TrimSpace(updateData.APIHash)
	updateData.Nickname = strings.TrimSpace(updateData.Nickname)
	
	// 更新字段（排除ID和创建时间）
	if err := database.DB.Model(&account).Updates(updateData).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新失败: " + err.Error()})
		return
	}
	
	// 重新查询获取最新数据
	database.DB.First(&account, id)
	
	c.JSON(http.StatusOK, gin.H{
		"message": "账号更新成功",
		"data": account,
	})
}

// DeleteAccount 删除账号
func DeleteAccount(c *gin.Context) {
	id := c.Param("id")
	
	var account models.Account
	if err := database.DB.First(&account, id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "账号不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败: " + err.Error()})
		return
	}

	// 停止并移除 Telegram 客户端（如果正在运行）
	if tgManagerGetter != nil {
		if manager := tgManagerGetter(); manager != nil {
			type ManagerInterface interface {
				RemoveClient(accountID uint) error
			}
			if mgr, ok := manager.(ManagerInterface); ok {
				_ = mgr.RemoveClient(account.ID)
			}
		}
	}

	// 删除该账号的认证会话记录（硬删除，避免外键约束阻止删除账号）
	database.DB.Unscoped().Where("account_id = ?", account.ID).Delete(&models.AuthSession{})

	// 删除账号与群组的关联记录，避免外键约束阻止删除账号
	database.DB.Unscoped().Where("account_id = ?", account.ID).Delete(&models.AccountGroup{})

	// 删除本地会话文件（尽量清理，不因失败中断）
	if account.SessionFile != "" {
		_ = os.Remove(account.SessionFile)
	}
	// 兼容旧路径 data/sessions/{phone}.session
	if account.PhoneNumber != "" {
		legacyPath := filepath.Join("data", "sessions", account.PhoneNumber+".session")
		_ = os.Remove(legacyPath)
	}

	// 彻底删除账号记录（硬删除），避免唯一索引残留
	if err := database.DB.Unscoped().Delete(&account).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "账号及相关会话已完全删除"})
}

// LoginAccount 登录账号（启动Telegram客户端）
func LoginAccount(c *gin.Context) {
	id := c.Param("id")
	
	var account models.Account
	if err := database.DB.First(&account, id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "账号不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败: " + err.Error()})
		return
	}
	
	// 获取Telegram管理器
	if tgManagerGetter == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Telegram管理器未初始化"})
		return
	}
	
	manager := tgManagerGetter()
	if manager == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "无法获取Telegram管理器"})
		return
	}
	
	// 类型断言并调用AddClient
	type ManagerInterface interface {
		AddClient(account *models.Account) error
	}
	
	if mgr, ok := manager.(ManagerInterface); ok {
		if err := mgr.AddClient(&account); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "启动客户端失败: " + err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"message": "登录请求已提交",
			"account_id": account.ID,
		})
	} else {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "管理器类型不匹配"})
	}
}
