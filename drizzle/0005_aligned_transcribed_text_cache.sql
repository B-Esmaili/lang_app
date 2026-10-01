ALTER TABLE "audio_transcription" ADD COLUMN "cache_key" text;--> statement-breakpoint
ALTER TABLE "audio_transcription" ADD COLUMN "transcribed_text" jsonb;--> statement-breakpoint
UPDATE "audio_transcription"
SET
	"cache_key" = "sha256" || ':' || lower("language") || ':' || "model" || ':alignment-v1',
	"transcribed_text" = jsonb_build_object(
		'schemaVersion', 1,
		'id', 'transcript.' || "sha256",
		'revision', 1,
		'text', "transcript",
		'language', "language",
		'normalization', 'NFC',
		'alignment', 'missing',
		'durationMs', CASE
			WHEN "duration_seconds" IS NULL THEN NULL
			ELSE round("duration_seconds" * 1000)::integer
		END,
		'tokens', '[]'::jsonb
	);--> statement-breakpoint
ALTER TABLE "audio_transcription" ALTER COLUMN "cache_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "audio_transcription" ALTER COLUMN "transcribed_text" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "audio_transcription" DROP CONSTRAINT "audio_transcription_pkey";--> statement-breakpoint
ALTER TABLE "audio_transcription" ADD CONSTRAINT "audio_transcription_pkey" PRIMARY KEY ("cache_key");
