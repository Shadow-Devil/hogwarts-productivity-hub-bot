CREATE TABLE "house_scoreboard" (
	"id" serial PRIMARY KEY NOT NULL,
	"house" varchar(50) NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
