CREATE TABLE "audio_transcription" (
	"sha256" text PRIMARY KEY NOT NULL,
	"transcript" text NOT NULL,
	"language" text NOT NULL,
	"model" text NOT NULL,
	"confidence" double precision,
	"duration_seconds" double precision,
	"deepgram_request_id" text,
	"byte_length" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_accessed_at" timestamp DEFAULT now() NOT NULL
);
