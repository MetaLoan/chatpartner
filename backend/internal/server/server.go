package server

import (
	"fmt"
	"log"
	"net/http"

	"aibot/handlers"
	"aibot/internal/config"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Server struct {
	config   *config.Config
	db       *gorm.DB
	tgManager interface{}   // 使用空接口，避免对具体类型的依赖
	router   *gin.Engine
}

func New(cfg *config.Config, db *gorm.DB, tgManager interface{}) *Server {
	router := gin.Default()

	// 设置Telegram管理器获取函数（用于handlers）
	handlers.SetTGManagerGetter(func() interface{} {
		return tgManager
	})

	// CORS配置
	router.Use(corsMiddleware())

	// 健康检查
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status": "ok",
			"message": "AI群营销工具运行中",
		})
	})

	// API路由
	api := router.Group("/api/v1")
	{
		// 账号管理
		api.GET("/accounts", handlers.GetAccounts)
		api.GET("/accounts/:id", handlers.GetAccount)
		api.POST("/accounts", handlers.CreateAccount)
		api.PUT("/accounts/:id", handlers.UpdateAccount)
		api.DELETE("/accounts/:id", handlers.DeleteAccount)
		api.POST("/accounts/:id/login", handlers.LoginAccount)

		// 群组管理
		api.GET("/groups", handlers.GetGroups)
		api.GET("/groups/:id", handlers.GetGroup)
		api.POST("/groups", handlers.CreateGroup)
		api.PUT("/groups/:id", handlers.UpdateGroup)
		api.DELETE("/groups/:id", handlers.DeleteGroup)
		api.POST("/groups/:id/assign-accounts", handlers.AssignAccounts)
		api.GET("/groups/:id/accounts", handlers.GetGroupAccounts)

		// 消息管理
		api.GET("/messages", handlers.GetMessages)
		api.GET("/messages/:id", handlers.GetMessage)
		api.POST("/messages/send", handlers.SendMessage)

		// 统计
		api.GET("/statistics", handlers.GetStatistics)
		api.GET("/accounts/:id/statistics", handlers.GetAccountStatistics)
		api.GET("/groups/:id/statistics", handlers.GetGroupStatistics)

		// 认证
		api.POST("/accounts/:id/auth/code", handlers.SubmitAuthCode)
		api.POST("/accounts/:id/auth/password", handlers.SubmitPassword)
		api.GET("/accounts/:id/auth/status", handlers.GetAuthStatus)
	}

	return &Server{
		config:    cfg,
		db:        db,
		tgManager: tgManager,
		router:    router,
	}
}

func (s *Server) Start() error {
	addr := fmt.Sprintf("%s:%s", s.config.Server.Host, s.config.Server.Port)
	log.Printf("🚀 服务器启动在 http://%s", addr)
	return s.router.Run(addr)
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}


