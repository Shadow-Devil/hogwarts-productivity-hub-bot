CREATE TABLE "submission" (
	"id" serial PRIMARY KEY NOT NULL,
	"discord_id" varchar(255) NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	"reviewed_by" varchar(255),
	"house" varchar(50) NOT NULL,
	"screenshot_url" varchar(1000) NOT NULL,
	"points" integer NOT NULL,
	"status" varchar(50) DEFAULT 'PENDING' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_discord_id_user_discord_id_fk" FOREIGN KEY ("discord_id") REFERENCES "public"."user"("discord_id") ON DELETE no action ON UPDATE no action;