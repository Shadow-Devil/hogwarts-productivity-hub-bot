CREATE TABLE "house_points" (
	"id" serial PRIMARY KEY NOT NULL,
	"house" varchar(50) NOT NULL,
	"points" integer DEFAULT 0 NOT NULL
);
