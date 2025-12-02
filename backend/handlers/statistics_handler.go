package handlers

import (
	"net/http"
	"time"

	"aibot/models"
	"aibot/internal/database"

	"github.com/gin-gonic/gin"
)

// GetStatistics 获取统计数据
func GetStatistics(c *gin.Context) {
	stats := make(map[string]interface{})
	
	// 账号总数
	var totalAccounts int64
	database.DB.Model(&models.Account{}).Count(&totalAccounts)
	stats["total_accounts"] = totalAccounts
	
	// 在线账号数
	var onlineAccounts int64
	database.DB.Model(&models.Account{}).Where("status = ?", "online").Count(&onlineAccounts)
	stats["online_accounts"] = onlineAccounts
	
	// 群组总数
	var totalGroups int64
	database.DB.Model(&models.Group{}).Count(&totalGroups)
	stats["total_groups"] = totalGroups
	
	// 今日发言数
	today := time.Now().Format("2006-01-02")
	var todayMessages int64
	database.DB.Model(&models.Message{}).
		Where("DATE(created_at) = ?", today).
		Count(&todayMessages)
	stats["today_messages"] = todayMessages
	
	// 总发言数
	var totalMessages int64
	database.DB.Model(&models.Message{}).Count(&totalMessages)
	stats["total_messages"] = totalMessages
	
	// 最近7天发言趋势
	var dailyStats []struct {
		Date  string `json:"date"`
		Count int64  `json:"count"`
	}
	
	sevenDaysAgo := time.Now().AddDate(0, 0, -7)
	database.DB.Model(&models.Message{}).
		Select("DATE(created_at) as date, COUNT(*) as count").
		Where("created_at >= ?", sevenDaysAgo).
		Group("DATE(created_at)").
		Order("date ASC").
		Scan(&dailyStats)
	stats["daily_trend"] = dailyStats
	
	// 账号发言排行（Top 10）
	var accountStats []struct {
		AccountID   uint   `json:"account_id"`
		PhoneNumber string `json:"phone_number"`
		Nickname    string `json:"nickname"`
		Count       int64  `json:"count"`
	}
	
	database.DB.Model(&models.Message{}).
		Select("account_id, accounts.phone_number, accounts.nickname, COUNT(*) as count").
		Joins("LEFT JOIN ai_accounts as accounts ON messages.account_id = accounts.id").
		Group("account_id, accounts.phone_number, accounts.nickname").
		Order("count DESC").
		Limit(10).
		Scan(&accountStats)
	stats["account_ranking"] = accountStats
	
	// 群组活跃度排行（Top 10）
	var groupStats []struct {
		GroupID uint   `json:"group_id"`
		Title   string `json:"title"`
		Count   int64  `json:"count"`
	}
	
	database.DB.Model(&models.Message{}).
		Select("group_id, groups.title, COUNT(*) as count").
		Joins("LEFT JOIN groups ON messages.group_id = groups.id").
		Group("group_id, groups.title").
		Order("count DESC").
		Limit(10).
		Scan(&groupStats)
	stats["group_ranking"] = groupStats
	
	c.JSON(http.StatusOK, gin.H{"data": stats})
}

// GetAccountStatistics 获取账号统计
func GetAccountStatistics(c *gin.Context) {
	accountID := c.Param("id")
	
	stats := make(map[string]interface{})
	
	// 发言总数
	var totalMessages int64
	database.DB.Model(&models.Message{}).
		Where("account_id = ?", accountID).
		Count(&totalMessages)
	stats["total_messages"] = totalMessages
	
	// 今日发言数
	today := time.Now().Format("2006-01-02")
	var todayMessages int64
	database.DB.Model(&models.Message{}).
		Where("account_id = ? AND DATE(created_at) = ?", accountID, today).
		Count(&todayMessages)
	stats["today_messages"] = todayMessages
	
	// 活跃群组数
	var activeGroups int64
	database.DB.Model(&models.Message{}).
		Where("account_id = ?", accountID).
		Distinct("group_id").
		Count(&activeGroups)
	stats["active_groups"] = activeGroups
	
	// 最近7天发言趋势
	var dailyStats []struct {
		Date  string `json:"date"`
		Count int64  `json:"count"`
	}
	
	sevenDaysAgo := time.Now().AddDate(0, 0, -7)
	database.DB.Model(&models.Message{}).
		Select("DATE(created_at) as date, COUNT(*) as count").
		Where("account_id = ? AND created_at >= ?", accountID, sevenDaysAgo).
		Group("DATE(created_at)").
		Order("date ASC").
		Scan(&dailyStats)
	stats["daily_trend"] = dailyStats
	
	c.JSON(http.StatusOK, gin.H{"data": stats})
}

// GetGroupStatistics 获取群组统计
func GetGroupStatistics(c *gin.Context) {
	groupID := c.Param("id")
	
	stats := make(map[string]interface{})
	
	// 发言总数
	var totalMessages int64
	database.DB.Model(&models.Message{}).
		Where("group_id = ?", groupID).
		Count(&totalMessages)
	stats["total_messages"] = totalMessages
	
	// 今日发言数
	today := time.Now().Format("2006-01-02")
	var todayMessages int64
	database.DB.Model(&models.Message{}).
		Where("group_id = ? AND DATE(created_at) = ?", groupID, today).
		Count(&todayMessages)
	stats["today_messages"] = todayMessages
	
	// 活跃账号数
	var activeAccounts int64
	database.DB.Model(&models.Message{}).
		Where("group_id = ?", groupID).
		Distinct("account_id").
		Count(&activeAccounts)
	stats["active_accounts"] = activeAccounts
	
	// 最近7天发言趋势
	var dailyStats []struct {
		Date  string `json:"date"`
		Count int64  `json:"count"`
	}
	
	sevenDaysAgo := time.Now().AddDate(0, 0, -7)
	database.DB.Model(&models.Message{}).
		Select("DATE(created_at) as date, COUNT(*) as count").
		Where("group_id = ? AND created_at >= ?", groupID, sevenDaysAgo).
		Group("DATE(created_at)").
		Order("date ASC").
		Scan(&dailyStats)
	stats["daily_trend"] = dailyStats
	
	c.JSON(http.StatusOK, gin.H{"data": stats})
}

