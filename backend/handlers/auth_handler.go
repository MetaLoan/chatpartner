package handlers

import (
	"net/http"
	"strconv"
	"time"

	"aibot/models"
	"aibot/internal/database"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

var tgManagerGetter func() interface{} // 用于获取Telegram管理器

// SetTGManagerGetter 设置Telegram管理器获取函数
func SetTGManagerGetter(getter func() interface{}) {
	tgManagerGetter = getter
}

// SubmitAuthCode 提交验证码
func SubmitAuthCode(c *gin.Context) {
	accountIDStr := c.Param("id")
	accountID, err := strconv.ParseUint(accountIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的账号ID"})
		return
	}
	
	var request struct {
		Code string `json:"code" binding:"required"`
	}
	
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误: " + err.Error()})
		return
	}
	
	// 查找认证会话
	var authSession models.AuthSession
	if err := database.DB.Where("account_id = ? AND state = ?", uint(accountID), "waiting_code").
		First(&authSession).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "未找到待验证的会话"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败: " + err.Error()})
		return
	}
	
	// 检查是否过期
	if time.Now().After(authSession.ExpiresAt) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "验证码已过期"})
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
	
	// 类型断言获取Manager
	type ManagerInterface interface {
		GetAuthHelper(accountID uint) (interface{}, bool)
	}
	
	if mgr, ok := manager.(ManagerInterface); ok {
		helper, found := mgr.GetAuthHelper(uint(accountID))
		if !found {
			c.JSON(http.StatusNotFound, gin.H{"error": "未找到认证助手，请先启动登录流程"})
			return
		}
		
		// 类型断言并提交验证码
		type AuthHelperInterface interface {
			SubmitCode(code string) error
		}
		
		if authHelper, ok := helper.(AuthHelperInterface); ok {
			if err := authHelper.SubmitCode(request.Code); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "提交验证码失败: " + err.Error()})
				return
			}
			
			authSession.State = "completed"
			database.DB.Save(&authSession)
			
			c.JSON(http.StatusOK, gin.H{
				"message": "验证码已提交，正在验证...",
				"account_id": accountID,
			})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "认证助手类型不匹配"})
		}
	} else {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "管理器类型不匹配"})
	}
}

// SubmitPassword 提交2FA密码
func SubmitPassword(c *gin.Context) {
	accountIDStr := c.Param("id")
	accountID, err := strconv.ParseUint(accountIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的账号ID"})
		return
	}
	
	var request struct {
		Password string `json:"password" binding:"required"`
	}
	
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误: " + err.Error()})
		return
	}
	
	// 查找认证会话
	var authSession models.AuthSession
	if err := database.DB.Where("account_id = ? AND state = ?", uint(accountID), "waiting_password").
		First(&authSession).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "未找到待验证的会话"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败: " + err.Error()})
		return
	}
	
	// 获取Telegram管理器并提交密码
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
		GetAuthHelper(accountID uint) (interface{}, bool)
	}
	
	if mgr, ok := manager.(ManagerInterface); ok {
		helper, found := mgr.GetAuthHelper(uint(accountID))
		if !found {
			c.JSON(http.StatusNotFound, gin.H{"error": "未找到认证助手"})
			return
		}
		
		type AuthHelperInterface interface {
			SubmitPassword(password string) error
		}
		
		if authHelper, ok := helper.(AuthHelperInterface); ok {
			if err := authHelper.SubmitPassword(request.Password); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "提交密码失败: " + err.Error()})
				return
			}
			
			authSession.Password = request.Password // 实际应该加密存储
			authSession.State = "completed"
			database.DB.Save(&authSession)
			
			c.JSON(http.StatusOK, gin.H{
				"message": "密码已提交，正在验证...",
				"account_id": accountID,
			})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "认证助手类型不匹配"})
		}
	} else {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "管理器类型不匹配"})
	}
}

// GetAuthStatus 获取认证状态
func GetAuthStatus(c *gin.Context) {
	accountID := c.Param("id")
	
	var authSession models.AuthSession
	if err := database.DB.Where("account_id = ?", accountID).
		Order("created_at DESC").First(&authSession).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusOK, gin.H{
				"state": "none",
				"message": "未开始认证",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败: " + err.Error()})
		return
	}
	
	response := gin.H{
		"state": authSession.State,
		"expires_at": authSession.ExpiresAt,
	}
	
	if authSession.State == "waiting_code" {
		response["message"] = "等待验证码输入"
	} else if authSession.State == "waiting_password" {
		response["message"] = "等待2FA密码输入"
	} else if authSession.State == "completed" {
		response["message"] = "认证完成"
	}
	
	c.JSON(http.StatusOK, response)
}

