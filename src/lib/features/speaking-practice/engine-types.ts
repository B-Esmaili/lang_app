export type SpeechEngineStatus = {
	phase: 'loading' | 'ready' | 'transcribing';
	progress: number | null;
	message: string;
};

export type SpeechEngineMode = 'english' | 'bilingual' | 'persian';
export type DetectedSpeechLanguage = 'en' | 'fa';
export type SpeechLanguageProbabilities = Record<DetectedSpeechLanguage, number>;
export type LocalSpeechResult = {
	text: string;
	language: DetectedSpeechLanguage | null;
	confidence: number;
	languageProbabilities?: SpeechLanguageProbabilities;
};

export type SpeechWorkerRequest =
	| { id: number; type: 'load'; mode: SpeechEngineMode }
	| { id: number; type: 'detect'; mode: SpeechEngineMode; samples: Float32Array }
	| {
			id: number;
			type: 'transcribe';
			mode: SpeechEngineMode;
			samples: Float32Array;
			language?: DetectedSpeechLanguage;
	  };

export type SpeechWorkerResponse =
	| { type: 'status'; status: SpeechEngineStatus }
	| {
			type: 'result';
			id: number;
			text?: string;
			language?: DetectedSpeechLanguage | null;
			confidence?: number;
			languageProbabilities?: SpeechLanguageProbabilities;
	  }
	| { type: 'error'; id: number; message: string };
