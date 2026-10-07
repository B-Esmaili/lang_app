# Voice Chat

When hosted in the Go wrapper in `desktop-app`, Voice Chat and speaker preview
use native Pocket TTS through `window.aiChatDesktop.tts` version 2
(`engine: "pocket-tts"`). An absent or incompatible capability, including older
Chatterbox hosts, selects browser Piper/VITS. Both environments share the
speech recognition routing below. See
[`desktop-app/README.md`](../../../../../desktop-app/README.md) for setup and tests.

The desktop offers eight voices: kids, young adults, middle-aged, and older
adults, each female and male (`DESKTOP_VOICE_CHAT_VOICES` in `voices.ts`, which
must match `desktop-app/voices/voices.json`). In the desktop app, Account →
Voice chat lists them grouped by age, with a preview; only voices that both the
host advertises and the web catalog knows are shown. The choice is saved as
`desktopVoiceId`, separate from the browser speaker (`voiceId`), so neither
mode overwrites the other's preference. A saved voice the host does not offer
falls back to the host's default. Apply migration
`0024_voice_chat_desktop_voice` before serving this version; requests from
pages loaded earlier omit `desktopVoiceId` and keep the saved value.
Desktop replies, replay, and speaker previews use normal 1.0× playback; replay
and identical replies reuse the generated audio in both modes. The media
element shares the unlocked audio context, and playback completion still gates
hands-free microphone capture.

Direct website visits keep Piper/VITS. Pocket TTS can run in the browser with
onnxruntime-web, but single-threaded WebAssembly (this site has no
cross-origin isolation) measured 0.68× real time on a fast desktop CPU, which
typical laptops and phones would not sustain, and each visitor would download
about 165 MB. Piper stays the browser engine until that changes.

Add **Voice Chat** from the lesson editor's Language Learning widget library, set an English topic and CEFR level, then switch to preview or open the lesson as a student. Account → Voice chat selects a saved AI connection and a speaker, with a speaker preview. The default connection follows the user's AI assistant selection.

The speaker list includes LibriTTS (high quality) and LibriTTS-R (medium), both using speaker ID 0. They use the existing preview, download cache, and saved voice preference; changing the existing default is not required.

Speech recognition prefers Web Speech in both the desktop WebView and direct
website visits. Ordinary turns use English (`en-US`). **Ask in Persian**
starts a one-turn Persian (`fa-IR`) recording and explicitly asks the tutor for
help; the tutor answers in English, then normal English input resumes. There is
no Auto input mode or language-detection call. Typing a question after a failed
Persian recording keeps it as a help turn; **Back to English** exits that mode.

A usable browser transcript skips local model loading. If Web Speech is missing,
returns an error, or produces no usable text, the recorded audio can use the
configured local fallback:

| `WEB_STT`           | English fallback                                                                                            | Persian help fallback                             |
| ------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `whisper` (default) | [Whisper Base q8](https://huggingface.co/onnx-community/whisper-base), forced English                       | Whisper Base q8, forced Persian                   |
| `moonshine`         | [Moonshine Tiny ONNX](https://huggingface.co/onnx-community/moonshine-tiny-ONNX), FP32 encoder / q8 decoder | Web Speech only; type the question if unavailable |

Set `WEB_STT=whisper` or `WEB_STT=moonshine` in `web-app/.env` or in the
environment before starting Vite or building the web app. Restart or rebuild
after changing it. This build-time setting affects both direct website visits
and the desktop WebView; the Go executable does not read it. Other values fail
the build. The activity area identifies the selected transcript provider.

Normal Web Speech service endings preserve the latest available transcript,
including interim text if no final result arrives. Cancellation discards it.
Web Speech recognizes only its chosen locale; it does not independently detect
the spoken language. It may process audio through a browser-managed online
service and may be unavailable in some browsers or without microphone
permission or HTTPS. Learners can always type their answer or Persian question.
Local fallback models download on first use and cache in the browser profile.
Voice Chat keeps at most one local STT worker and model active per widget; the
worker uses one WASM thread for sites without cross-origin isolation. These are
web providers, not a native Go STT bridge.
VITS speech uses the same diffusionstudio voice catalog and Piper phonemizer as [VITS Web](https://huggingface.co/spaces/diffusionstudio/vits-web) ([source](https://github.com/diffusionstudio/vits-web)). The worker bundles the existing Piper WASM assets, uses single-threaded ONNX on sites without cross-origin isolation, caches the selected voice, and reuses its inference session. This avoids the demo wrapper's per-prediction ONNX session creation and external runtime scripts. The phonemizer includes GPL-3.0 eSpeak code; review distribution obligations alongside each voice's model card before shipping.

Only transcripts, bounded lesson context and conversation memory go to the student's selected AI provider. Credentials stay on the server. The microphone stops at 30 seconds, on cancellation, on navigation and when the page becomes hidden. Playback is unlocked by a user gesture for Chrome on Android. Replies remain readable if speech generation fails.

The AI reply stays hidden while speech is prepared. Once browser or desktop audio actually starts, the text appears a word at a time using playback position. Neither voice engine supplies word timestamps, so word pacing is approximate. The complete reply becomes readable when playback finishes. If playback is stopped or fails, unspoken text stays hidden until the learner chooses **Read reply** or replays it. Replay does not re-hide an already displayed reply.

## Hands-free turns

Enable **Hands-free** before starting, or while an existing conversation is idle. The initial tap unlocks audio; automatic recordings reuse that audio context, but acquire and release microphone tracks for each student turn. The microphone stays off during AI speech, with a 450 ms gap after playback before listening starts again. Pausing, resetting, hiding the page, or leaving the widget cancels pending restarts and releases the microphone.

Local energy/silence detection sends after 200 ms of detected voice followed by 2 seconds of silence. It pauses without a provider call after 12 seconds without detected speech; the existing 30-second recording limit still applies. This is a quiet-room heuristic, not a neural speech/noise classifier: loud background sounds may count as speech. Manual stop remains available. Transcript review, when selected before starting, holds the recognized answer for approval and resumes automatic listening only after the next spoken AI reply. Speech or provider errors pause hands-free rather than retrying automatically. The correction button can interrupt listening to request feedback on the last submitted answer.

There is no separate Send button. A recognized transcript sends immediately unless transcript review is enabled. Typed or edited answers and Persian questions submit with Enter (Shift+Enter adds a new line); composition/IME Enter does not submit. Failed requests retain the draft for retry.

## Direct help and conversation

Each new conversation randomly selects one of four brief introductions inviting the student to choose what to talk about (for example, "I'm your chat partner. What would you like to talk about?"). Openings follow the current English level and leave the topic to the student, even when a topic or lesson context is configured. They do not include a separate greeting, suggested topics, or questions about a specific topic. Selection happens on the shared server path for desktop and browser users, with no extra model call. Random choices can repeat; exact wording still depends on the selected model.

The tutor is instructed to answer entirely in English on every turn, including Persian or mixed-language questions, explanations, and corrections. Requests to reply in Persian, lesson instructions, and previous conversation history cannot override this rule. Non-English source wording is expressed in English instead of quoted in the reply. Summaries are also requested in English and treat past language requests as conversation data.

Specific requests, including Persian and mixed Persian/English requests, take priority over conversation practice. For “how do I say this in English?”, the tutor is instructed to return only the natural English wording, without a preface, unsolicited explanation, or follow-up question. Explicit requests for explanations or corrections still receive the requested help. Ordinary conversation can still include one relevant follow-up question; lesson goals cannot force a question after direct help.

The **Ask in Persian** button marks that turn as a deliberate help request; the tutor gives English wording or a concise English explanation, without a follow-up conversation question. After supplying it, the tutor defaults to normal conversation on the next student turn. Outside that explicit help action, an intention expressed in Persian or English is ordinary conversation, not automatically a request for teaching. Summaries retain the main topic and distinguish completed help from unresolved requests.

This behavior is part of the server-side tutor prompt: it adds no language/intent-classification call and does not strip questions from generated text (the requested translation may itself be a question). Automated tests verify the prompt contract and response handling with a stubbed provider; exact wording still depends on the selected model.

## English level

The saved widget level is sent with every turn. The server injects only that level's A1–C2 profile into the trusted tutor prompt, covering vocabulary, grammar, ordinary reply length, question style, and requested feedback. It applies to openings, replies, Persian-to-English help, and corrections; the current selection takes precedence over older conversation summaries or more advanced lesson material. A fluent Persian request does not imply advanced English proficiency.

The profiles are teaching heuristics informed by the [Council of Europe's spoken-language descriptors](https://www.coe.int/en/web/common-european-framework-reference-languages/table-3-cefr-3.3-common-reference-levels-qualitative-aspects-of-spoken-language-use), not a CEFR assessment or an official word-count/grammar syllabus. Ordinary dialogue targets are up to 20 words for A1, 30 for A2, 45 for B1, 60 for B2, and 65 for C1/C2. These are prompt guidelines, not hard truncation rules: translations preserve the requested meaning and specific terminology. Advanced levels allow more nuance, not mandatory verbosity. No additional model call is used to check difficulty; automated tests verify the prompt and request wiring, not live-model adherence.

## Conversation memory

The API accepts only bounded user/assistant messages, never client-supplied system instructions. The tutor receives a maximum of ten recent messages, a 3,000-character rolling summary, and at most 3,000 characters of lesson text. Older complete exchanges are summarized with the selected model when the next turn would exceed the window; summaries preserve student facts and pending questions. Summary requests use a 500-token output cap and replies use 300. For DeepSeek V4 Pro, V4 Flash, and the DeepSeek Flash alias (including provider-prefixed IDs), both requests explicitly disable thinking so reasoning cannot consume the short answer budget. Other models keep their provider defaults. An empty answer with a token-limit finish reason produces a specific error; reasoning content is never used as the spoken answer. Failed requests don't commit the new context. The UI retains at most 80 displayed entries and the last generated audio; recordings are not stored. New conversation clears memory and releases the local speech worker.

The correction button asks for feedback on the latest student answer without adding synthetic turns to the dialogue. The latest feedback is retained separately (at most 1,500 characters) so the student can ask follow-up questions about it, and is available to the next summary. The tutor may also respond to an explicit spoken correction request, but it must not judge acoustic pronunciation from a transcript.

Apply migration `0023_voice_chat_settings` before serving the updated account page. It creates only the preferences table, with owned AI connection validation and deletion-safe foreign keys. No conversation or raw audio is written to the database.

Run `bun test tests/voice-chat.test.ts` and `npm run check` for the feature's server/context checks. Browser testing also needs HTTPS (or localhost), access to Hugging Face model downloads, and a configured AI connection. The in-flight request guard is per server process; deployments with multiple replicas should supply a shared rate limiter.
