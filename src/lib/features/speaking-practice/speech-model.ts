import type { SpeechEngineMode } from './engine-types';
import type { WebStt } from './stt-config';

/** Never allow Whisper to load when Moonshine was chosen. */
export function speechModelId(mode: SpeechEngineMode, webStt: WebStt): string {
	if (webStt === 'moonshine') {
		if (mode === 'persian') throw new Error('Whisper is disabled by WEB_STT=moonshine.');
		return 'onnx-community/moonshine-tiny-ONNX';
	}
	return 'onnx-community/whisper-base';
}
