ALTER TABLE "user" RENAME COLUMN "streak_voice" TO "voice_streak";--> statement-breakpoint
ALTER TABLE "user" RENAME COLUMN "is_streak_voice_updated_today" TO "is_voice_streak_updated_today";--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "daily_messages_sent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "message_streak" integer;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "is_message_streak_updated_today" boolean DEFAULT false NOT NULL;