-- CreateTable
CREATE TABLE "ai_accounts" (
    "id" SERIAL NOT NULL,
    "phone_number" TEXT NOT NULL,
    "nickname" TEXT,
    "status" TEXT NOT NULL DEFAULT 'offline',
    "session_path" TEXT,
    "last_login_at" TIMESTAMP(3),
    "ai_api_key" TEXT NOT NULL,
    "ai_api_base_url" TEXT,
    "ai_model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "system_prompt" TEXT,
    "reply_interval" INTEGER NOT NULL DEFAULT 60,
    "listen_interval" INTEGER NOT NULL DEFAULT 5,
    "buffer_size" INTEGER NOT NULL DEFAULT 10,
    "auto_reply" BOOLEAN NOT NULL DEFAULT true,
    "reply_probability" INTEGER NOT NULL DEFAULT 100,
    "split_by_newline" BOOLEAN NOT NULL DEFAULT true,
    "multi_msg_interval" INTEGER NOT NULL DEFAULT 5,
    "priority" INTEGER NOT NULL DEFAULT 5,
    "tone" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" SERIAL NOT NULL,
    "telegram_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'group',
    "username" TEXT,
    "member_count" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_groups" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "group_id" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "reply_probability" DOUBLE PRECISION NOT NULL DEFAULT 1.0,

    CONSTRAINT "account_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "group_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "telegram_message_id" TEXT,
    "reply_to_message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'none',
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configs" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_accounts_phone_number_key" ON "ai_accounts"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "groups_telegram_id_key" ON "groups"("telegram_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_groups_account_id_group_id_key" ON "account_groups"("account_id", "group_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_account_id_key" ON "auth_sessions"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "configs_key_key" ON "configs"("key");

-- AddForeignKey
ALTER TABLE "account_groups" ADD CONSTRAINT "account_groups_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ai_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_groups" ADD CONSTRAINT "account_groups_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ai_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
