.PHONY: run build test clean migrate

# 运行程序
run:
	go run main.go

# 构建
build:
	go build -o bin/aibot main.go

# 测试
test:
	go test ./...

# 清理
clean:
	rm -rf bin/
	go clean

# 数据库迁移
migrate:
	go run main.go migrate

# 安装依赖
deps:
	go mod download
	go mod tidy

