package telegram

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// SessionStorage 会话存储接口
type SessionStorage interface {
	Load() ([]byte, error)
	Save(data []byte) error
	Delete() error
}

// FileSessionStorage 文件会话存储
type FileSessionStorage struct {
	Path string
}

// Load 加载会话
func (f *FileSessionStorage) Load() ([]byte, error) {
	if _, err := os.Stat(f.Path); os.IsNotExist(err) {
		return nil, nil
	}
	return os.ReadFile(f.Path)
}

// Save 保存会话
func (f *FileSessionStorage) Save(data []byte) error {
	dir := filepath.Dir(f.Path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	return os.WriteFile(f.Path, data, 0600)
}

// Delete 删除会话
func (f *FileSessionStorage) Delete() error {
	return os.Remove(f.Path)
}

// SessionData 会话数据
type SessionData struct {
	DC        int    `json:"dc"`
	AuthKey   []byte `json:"auth_key"`
	AuthKeyID []byte `json:"auth_key_id"`
}

// SaveSession 保存会话数据
func SaveSession(path string, data *SessionData) error {
	jsonData, err := json.Marshal(data)
	if err != nil {
		return err
	}
	
	storage := &FileSessionStorage{Path: path}
	return storage.Save(jsonData)
}

// LoadSession 加载会话数据
func LoadSession(path string) (*SessionData, error) {
	storage := &FileSessionStorage{Path: path}
	data, err := storage.Load()
	if err != nil {
		return nil, err
	}
	
	if len(data) == 0 {
		return nil, nil
	}
	
	var session SessionData
	if err := json.Unmarshal(data, &session); err != nil {
		return nil, err
	}
	
	return &session, nil
}

