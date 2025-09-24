ALTER TABLE "user" RENAME COLUMN "daily_messages_sent" TO "daily_messages";--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "message_streak" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "message_streak" SET NOT NULL;