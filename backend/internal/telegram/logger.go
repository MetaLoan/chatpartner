package telegram

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"
)

// Logger Telegram客户端日志记录器
type Logger struct {
	logFile *os.File
	accountID uint
}

// NewLogger 创建日志记录器
func NewLogger(accountID uint, logDir string) (*Logger, error) {
	// 确保日志目录存在
	if err := os.MkdirAll(logDir, 0755); err != nil {
		return nil, fmt.Errorf("创建日志目录失败: %w", err)
	}

	// 创建日志文件
	logPath := filepath.Join(logDir, fmt.Sprintf("account_%d_%s.log", accountID, time.Now().Format("20060102")))
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		return nil, fmt.Errorf("打开日志文件失败: %w", err)
	}

	return &Logger{
		logFile:  logFile,
		accountID: accountID,
	}, nil
}

// Log 记录日志
func (l *Logger) Log(level, message string) {
	timestamp := time.Now().Format("2006-01-02 15:04:05")
	logMsg := fmt.Sprintf("[%s] [%s] [账号ID: %d] %s\n", timestamp, level, l.accountID, message)
	
	// 写入文件
	l.logFile.WriteString(logMsg)
	
	// 同时输出到标准输出
	log.Print(logMsg)
}

// Info 记录信息日志
func (l *Logger) Info(message string) {
	l.Log("INFO", message)
}

// Error 记录错误日志
func (l *Logger) Error(message string) {
	l.Log("ERROR", message)
}

// Warn 记录警告日志
func (l *Logger) Warn(message string) {
	l.Log("WARN", message)
}

// Close 关闭日志文件
func (l *Logger) Close() error {
	if l.logFile != nil {
		return l.logFile.Close()
	}
	return nil
}

