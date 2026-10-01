# Voice Chat

When hosted in the Go wrapper in `desktop-app`, Voice Chat and speaker preview
use native Chatterbox Turbo through version 2 of `window.aiChatDesktop.tts`. An absent or incompatible
capability selects browser Piper/VITS.
The reference
comes from `static/voice-chat-agent.wav`, reread by Go before every generation.
Editing or replacing the WAV takes effect on the next reply, replay, or speaker
preview without conversion, rebuilding, or restarting. Desktop speech uses that cloned voice
without changing the saved browser speaker preference. Ordinary browsers keep
Piper/VITS, and both environments share the speech recognition routing below. See
[`desktop-app/README.md`](../../../../../desktop-app/README.md) for setup and tests.
Desktop replies, replay, and speaker previews use normal 1.0× playback.
The media element shares the unlocked audio context, and playback
completion still gates hands-free microphone capture.

Desktop packages come in Lightweight (Q4 Turbo) and Pro (current Turbo). The
package selects its model at build time; the page exposes no model picker.
The optional `tts.flavor` field identifies the package. Both use the same
version-2 native `generate(id, text)` capability. Direct website visits retain
Piper/VITS and their saved speaker preference.

Add **Voice Chat** from the lesson editor's Language Learning widget library, set an English topic and CEFR level, then switch to preview or open the lesson as a student. Account → Voice chat selects a saved AI connection and an English speaker, with a speaker preview. The default connection follows the user's AI assistant selection.

The speaker list includes LibriTTS (high quality) and LibriTTS-R (medium), both using speaker ID 0. They use the existing preview, download cache, and saved voice preference; changing the existing default is not required.

Speech recognition prefers Web Speech in both the desktop WebView and direct
website visits. English mode sets `en-US`; Persian mode sets `fa-IR`. A usable
browser result skips local model loading and inference. Normal service endings
before the page stops recording preserve the transcript. Interim hypotheses are
updated as results arrive and retained if the service ends or the stop deadline
expires without a final result. Cancellation always discards them. Missing APIs,
service errors (including unsupported language), and empty results fall back
using the recording already captured by the page:

| Selected language | Local fallback |
| --- | --- |
| English | [Moonshine Tiny ONNX](https://huggingface.co/onnx-community/moonshine-tiny-ONNX), FP32 encoder / q8 decoder, WASM |
| Persian | [Multilingual Whisper Base q8](https://huggingface.co/onnx-community/whisper-base), `language: 'fa'`, `task: 'transcribe'`, WASM |

The activity area shows the provider used for the transcript. "Trying Web Speech"
means only that the service was requested; "Transcript: Web Speech API" confirms
its result was selected. Local fallbacks show the browser error or absence of a
transcript. Console diagnostics include the browser result and the unchanged
language scores/thresholds, including before a local fallback starts. Available
browser candidates remain in the diagnostic table even if the other language wins.

Persian Web Speech remains preferred based on the user's observed recognition
quality. Auto also starts the browser recognizer in `fa-IR` and runs
Whisper Tiny's first decoder step only to compare the current recording's English
and Persian language probabilities. A clear Persian result uses the browser
transcript if available, with Whisper Persian transcription only as fallback.
A clear English result uses Moonshine. Web Speech has one locale per session;
select English explicitly to prefer its `en-US` recognizer. We do not run two
competing live browser recognizers or treat their transcript confidence as
language confidence. Close or missing language scores require a choice. Auto
generates both transcript candidates only for uncertain results or when review
is enabled; otherwise only the selected language needs transcription.

The fallback workers run locally, with one WASM thread for compatibility with
sites without cross-origin isolation. Models load lazily and cache in the
browser profile. Web Speech may process audio through the browser's online
speech service. Cancellation disposes pending workers and aborts browser
recognition. Language or provider failure never silently substitutes the other
language's transcript. These are shared web providers, not a native Go STT
bridge; desktop packages do not embed their browser model downloads.
The real-audio smoke check verifies routing, language detection, and that the
fallbacks execute. It is not an accuracy benchmark: Persian fallback quality
remains weaker on the tested recording. Base avoids the long repetition seen
with Tiny there, but does not replace successful browser recognition.

VITS speech uses the same diffusionstudio voice catalog and Piper phonemizer as [VITS Web](https://huggingface.co/spaces/diffusionstudio/vits-web) ([source](https://github.com/diffusionstudio/vits-web)). The worker bundles the existing Piper WASM assets, uses single-threaded ONNX on sites without cross-origin isolation, caches the selected voice, and reuses its inference session. This avoids the demo wrapper's per-prediction ONNX session creation and external runtime scripts. The phonemizer includes GPL-3.0 eSpeak code; review distribution obligations alongside each voice's model card before shipping.

Only transcripts, bounded lesson context and conversation memory go to the student's selected AI provider. Credentials stay on the server. The microphone stops at 30 seconds, on cancellation, on navigation and when the page becomes hidden. Playback is unlocked by a user gesture for Chrome on Android. Replies remain readable if speech generation fails.

## Hands-free turns

Enable **Hands-free** before starting, or while an existing conversation is idle. The initial tap unlocks audio; automatic recordings reuse that audio context, but acquire and release microphone tracks for each student turn. The microphone stays off during AI speech, with a 450 ms gap after playback before listening starts again. Pausing, resetting, hiding the page, or leaving the widget cancels pending restarts and releases the microphone.

Local energy/silence detection sends after 200 ms of detected voice followed by 2 seconds of silence. It pauses without a provider call after 12 seconds without detected speech; the existing 30-second recording limit still applies. This is a quiet-room heuristic, not a neural speech/noise classifier: loud background sounds may count as speech. Manual stop remains available. Transcript review, when selected before starting, holds the recognized answer for approval and resumes automatic listening only after the next spoken AI reply. Speech or provider errors pause hands-free rather than retrying automatically. The correction button can interrupt listening to request feedback on the last submitted answer.

There is no separate Send button. Choosing English or Persian submits that transcript immediately, including when transcript review is enabled. Typed or edited answers submit with Enter (Shift+Enter adds a new line); composition/IME Enter does not submit. Uncertain language choices still wait for explicit selection or an edit, and failed requests retain the transcript for retry.

## Direct help and conversation

Each new conversation randomly selects one of four brief introductions inviting the student to choose what to talk about (for example, "I'm your chat partner. What would you like to talk about?"). Openings follow the current English level and leave the topic to the student, even when a topic or lesson context is configured. They do not include a separate greeting, suggested topics, or questions about a specific topic. Selection happens on the shared server path for desktop and browser users, with no extra model call. Random choices can repeat; exact wording still depends on the selected model.

The tutor is instructed to answer entirely in English on every turn, including Persian or mixed-language questions, explanations, and corrections. Requests to reply in Persian, lesson instructions, and previous conversation history cannot override this rule. Non-English source wording is expressed in English instead of quoted in the reply. Summaries are also requested in English and treat past language requests as conversation data.

Specific requests, including Persian and mixed Persian/English requests, take priority over conversation practice. For “how do I say this in English?”, the tutor is instructed to return only the natural English wording, without a preface, unsolicited explanation, or follow-up question. Explicit requests for explanations or corrections still receive the requested help. Ordinary conversation can still include one relevant follow-up question; lesson goals cannot force a question after direct help.

Language help is a one-turn aside. After supplying it, the tutor defaults to normal conversation on the next student turn; thanks, repeating the translated sentence, or continuing the story do not invite more corrections, wording suggestions, drills, or advice. An intention expressed in Persian or English is treated as conversation, not automatically as a request for teaching. A fresh explicit help request or a question about the previous explanation still receives help. Summaries retain the main conversation topic and distinguish completed help from genuinely unresolved requests, so compaction does not prolong the aside.

This behavior is part of the existing server-side tutor prompt: it adds no language/intent-classification call and does not strip questions from generated text (the requested translation may itself be a question). Automated tests verify the prompt contract and response handling with a stubbed provider; exact wording still depends on the selected model.

## English level

The saved widget level is sent with every turn. The server injects only that level's A1–C2 profile into the trusted tutor prompt, covering vocabulary, grammar, ordinary reply length, question style, and requested feedback. It applies to openings, replies, Persian-to-English help, and corrections; the current selection takes precedence over older conversation summaries or more advanced lesson material. A fluent Persian request does not imply advanced English proficiency.

The profiles are teaching heuristics informed by the [Council of Europe's spoken-language descriptors](https://www.coe.int/en/web/common-european-framework-reference-languages/table-3-cefr-3.3-common-reference-levels-qualitative-aspects-of-spoken-language-use), not a CEFR assessment or an official word-count/grammar syllabus. Ordinary dialogue targets are up to 20 words for A1, 30 for A2, 45 for B1, 60 for B2, and 65 for C1/C2. These are prompt guidelines, not hard truncation rules: translations preserve the requested meaning and specific terminology. Advanced levels allow more nuance, not mandatory verbosity. No additional model call is used to check difficulty; automated tests verify the prompt and request wiring, not live-model adherence.

## Conversation memory

The API accepts only bounded user/assistant messages, never client-supplied system instructions. The tutor receives a maximum of ten recent messages, a 3,000-character rolling summary, and at most 3,000 characters of lesson text. Older complete exchanges are summarized with the selected model when the next turn would exceed the window; summaries preserve student facts and pending questions. Summary requests use a 500-token output cap and replies use 300. For DeepSeek V4 Pro, V4 Flash, and the DeepSeek Flash alias (including provider-prefixed IDs), both requests explicitly disable thinking so reasoning cannot consume the short answer budget. Other models keep their provider defaults. An empty answer with a token-limit finish reason produces a specific error; reasoning content is never used as the spoken answer. Failed requests don't commit the new context. The UI retains at most 80 displayed entries and the last generated audio; recordings are not stored. New conversation clears memory and releases both speech workers.

The correction button asks for feedback on the latest student answer without adding synthetic turns to the dialogue. The latest feedback is retained separately (at most 1,500 characters) so the student can ask follow-up questions about it, and is available to the next summary. The tutor may also respond to an explicit spoken correction request, but it must not judge acoustic pronunciation from a transcript.

Apply migration `0023_voice_chat_settings` before serving the updated account page. It creates only the preferences table, with owned AI connection validation and deletion-safe foreign keys. No conversation or raw audio is written to the database.

Run `bun test tests/voice-chat.test.ts` and `npm run check` for the feature's server/context checks. Browser testing also needs HTTPS (or localhost), access to Hugging Face model downloads, and a configured AI connection. The in-flight request guard is per server process; deployments with multiple replicas should supply a shared rate limiter.
