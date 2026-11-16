SHELL := /bin/bash
UV    := uv --directory crawler
PNPM  := pnpm --dir web

.PHONY: help setup db deps migrate crawl run notify sources test web-dev web-build web-start \
        install uninstall status logs backup telegram-chat-id telegram-test

help: ## Liệt kê lệnh
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk -F':.*?## ' '{printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

setup: db deps migrate web-build ## Cài từ đầu: DB + dependency + migrate + build web

db: ## Bật Postgres 18, tạo role/DB, sinh .env
	brew services start postgresql@18
	@for i in {1..10}; do /opt/homebrew/opt/postgresql@18/bin/pg_isready -h localhost -q && break; sleep 1; done
	./ops/setup-db.sh

deps: ## Cài dependency Python + Node
	$(UV) sync
	$(PNPM) install --frozen-lockfile

migrate: ## Áp dụng migration
	$(UV) run tram-tin migrate

crawl: ## Quét ngay (không gửi Telegram)
	$(UV) run tram-tin crawl

run: ## Quét + gửi Telegram (giống launchd)
	$(UV) run tram-tin run

notify: ## Gửi thông báo đang chờ
	$(UV) run tram-tin notify

sources: ## Trạng thái các nguồn
	@$(UV) run tram-tin sources

test: ## Chạy test crawler + typecheck web
	$(UV) run pytest
	$(PNPM) typecheck

web-dev: ## Web chế độ dev (http://127.0.0.1:3100)
	$(PNPM) dev

web-build: ## Build web production
	$(PNPM) build

web-start: ## Chạy web production (foreground)
	$(PNPM) start

install: web-build ## Cài LaunchAgent: crawler mỗi giờ, web luôn chạy, backup 03:00
	./ops/launchd.sh install

uninstall: ## Gỡ LaunchAgent
	./ops/launchd.sh uninstall

status: ## Trạng thái LaunchAgent + nguồn
	@./ops/launchd.sh status
	@echo
	@$(UV) run tram-tin sources

logs: ## Xem log crawler
	tail -n 100 -f ~/Library/Logs/tram-tin/crawler.log

backup: ## Backup DB ngay
	./ops/backup.sh

telegram-chat-id: ## Lấy chat id (nhắn /start cho bot trước)
	$(UV) run tram-tin telegram-chat-id

telegram-test: ## Gửi tin thử lên Telegram
	$(UV) run tram-tin telegram-test
