package ai

import (
	"context"
	"fmt"
	"log"
	"strings"

	"github.com/sashabaranov/go-openai"
)

// ChatMessage 聊天消息
type ChatMessage struct {
	Role    string
	Content string
}

type Service struct {
}

func NewService() *Service {
	return &Service{}
}

// getClientForModel 根据模型名称返回对应的客户端
func getClientForModel(apiKey, model string) *openai.Client {
	// DeepSeek 模型使用 DeepSeek API
	if strings.HasPrefix(model, "deepseek") {
		config := openai.DefaultConfig(apiKey)
		config.BaseURL = "https://api.deepseek.com/v1"
		return openai.NewClientWithConfig(config)
	}

	// 默认使用 OpenAI API
	return openai.NewClient(apiKey)
}

// GenerateReply 生成AI回复（基于账号自己的 API Key 和模型）
func (s *Service) GenerateReply(ctx context.Context, apiKey, model, systemPrompt, message string, contextMessages []ChatMessage) (string, error) {
	if apiKey == "" {
		return "", fmt.Errorf("AI API Key 未配置，请在账号管理中填写 ai_api_key")
	}
	if model == "" {
		model = "gpt-4o-mini"
	}
	if systemPrompt == "" {
		systemPrompt = "你是一个友好、有帮助的AI助手，会在Telegram群组中自然地参与对话。保持简洁、有趣的回复风格。"
	}

	// 根据模型选择对应的客户端
	client := getClientForModel(apiKey, model)

	messages := []openai.ChatCompletionMessage{
		{
			Role:    openai.ChatMessageRoleSystem,
			Content: systemPrompt,
		},
	}

	// 添加上下文消息
	for _, ctxMsg := range contextMessages {
		messages = append(messages, openai.ChatCompletionMessage{
			Role:    ctxMsg.Role,
			Content: ctxMsg.Content,
		})
	}

	// 添加当前消息
	messages = append(messages, openai.ChatCompletionMessage{
		Role:    openai.ChatMessageRoleUser,
		Content: message,
	})

	resp, err := client.CreateChatCompletion(
		ctx,
		openai.ChatCompletionRequest{
			Model:    model,
			Messages: messages,
			MaxTokens: 500,
			Temperature: 0.7,
		},
	)

	if err != nil {
		return "", fmt.Errorf("生成回复失败: %w", err)
	}

	if len(resp.Choices) == 0 {
		return "", fmt.Errorf("未收到回复")
	}

	reply := resp.Choices[0].Message.Content
	log.Printf("✅ AI生成回复: %s...", reply[:min(100, len(reply))])
	
	return reply, nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

