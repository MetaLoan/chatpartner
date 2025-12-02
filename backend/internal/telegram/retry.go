package telegram

import (
	"context"
	"fmt"
	"log"
	"time"
)

// RetryConfig 重试配置
type RetryConfig struct {
	MaxRetries int           // 最大重试次数
	InitialDelay time.Duration // 初始延迟
	MaxDelay     time.Duration // 最大延迟
	Multiplier   float64      // 延迟倍数
}

// DefaultRetryConfig 默认重试配置
func DefaultRetryConfig() RetryConfig {
	return RetryConfig{
		MaxRetries:  3,
		InitialDelay: 1 * time.Second,
		MaxDelay:     10 * time.Second,
		Multiplier:   2.0,
	}
}

// Retry 重试函数
func Retry(ctx context.Context, fn func() error, config RetryConfig) error {
	var lastErr error
	delay := config.InitialDelay

	for i := 0; i < config.MaxRetries; i++ {
		if err := fn(); err == nil {
			return nil
		} else {
			lastErr = err
			log.Printf("⚠️ 操作失败，准备重试 [尝试 %d/%d]: %v", i+1, config.MaxRetries, err)
		}

		// 如果不是最后一次尝试，等待后重试
		if i < config.MaxRetries-1 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(delay):
				// 指数退避
				delay = time.Duration(float64(delay) * config.Multiplier)
				if delay > config.MaxDelay {
					delay = config.MaxDelay
				}
			}
		}
	}

	return fmt.Errorf("重试 %d 次后仍然失败: %w", config.MaxRetries, lastErr)
}

// RetryWithBackoff 带指数退避的重试
func RetryWithBackoff(ctx context.Context, fn func() error) error {
	return Retry(ctx, fn, DefaultRetryConfig())
}

