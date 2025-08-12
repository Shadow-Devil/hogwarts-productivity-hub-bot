CREATE TABLE "task" (
	"id" serial PRIMARY KEY NOT NULL,
	"discord_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"title" varchar(500) NOT NULL,
	"is_completed" boolean DEFAULT false,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "user" (
	"discord_id" varchar(255) PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"username" varchar(255) NOT NULL,
	"house" varchar(50),
	"timezone" varchar(50) DEFAULT 'UTC' NOT NULL,
	"last_daily_reset" timestamp DEFAULT now() NOT NULL,
	"daily_points" integer DEFAULT 0 NOT NULL,
	"monthly_points" integer DEFAULT 0 NOT NULL,
	"total_points" integer DEFAULT 0 NOT NULL,
	"daily_voice_time" integer DEFAULT 0 NOT NULL,
	"monthly_voice_time" integer DEFAULT 0 NOT NULL,
	"total_voice_time" integer DEFAULT 0 NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"is_streak_updated_today" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_session" (
	"id" serial PRIMARY KEY NOT NULL,
	"discord_id" varchar(255) NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"left_at" timestamp,
	"is_tracked" boolean DEFAULT false NOT NULL,
	"duration" integer GENERATED ALWAYS AS (EXTRACT(EPOCH FROM (left_at - joined_at))) STORED
);
--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_discord_id_user_discord_id_fk" FOREIGN KEY ("discord_id") REFERENCES "public"."user"("discord_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_session" ADD CONSTRAINT "voice_session_discord_id_user_discord_id_fk" FOREIGN KEY ("discord_id") REFERENCES "public"."user"("discord_id") ON DELETE no action ON UPDATE no action;