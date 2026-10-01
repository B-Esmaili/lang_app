import { json, type RequestHandler } from '@sveltejs/kit';
import {
	apiFailure,
	ApiRequestError,
	assertSameOrigin,
	requireViewer
} from '$lib/server/api-request';
import {
	DeepgramRequestError,
	looksLikeMp3,
	MAX_MP3_BYTES,
	normalizeTranscriptionLanguage
} from '$lib/server/deepgram';
import { transcribeMp3WithCache } from '$lib/server/transcriptions';

const MULTIPART_OVERHEAD_ALLOWANCE = 1024 * 1024;

export const POST: RequestHandler = async ({ fetch, locals, request, url }) => {
	try {
		assertSameOrigin(request, url);
		const viewer = requireViewer(locals);
		if (viewer.role === 'student') {
			throw new ApiRequestError(403, 'Teacher or administrator access is required.');
		}
		if (!request.headers.get('content-type')?.toLowerCase().includes('multipart/form-data')) {
			throw new ApiRequestError(415, 'Upload an MP3 file using multipart form data.');
		}

		const contentLength = Number(request.headers.get('content-length') ?? 0);
		if (
			Number.isFinite(contentLength) &&
			contentLength > MAX_MP3_BYTES + MULTIPART_OVERHEAD_ALLOWANCE
		) {
			throw new ApiRequestError(413, 'The MP3 file must be 25 MB or smaller.');
		}

		const form = await request.formData().catch(() => null);
		if (!form) throw new ApiRequestError(400, 'The upload could not be read.');
		const file = form.get('file');
		if (!(file instanceof File))
			throw new ApiRequestError(400, 'Choose an MP3 file to transcribe.');
		if (!file.name.toLocaleLowerCase().endsWith('.mp3')) {
			throw new ApiRequestError(415, 'Only .mp3 files are supported.');
		}
		if (file.size === 0) throw new ApiRequestError(400, 'The selected MP3 file is empty.');
		if (file.size > MAX_MP3_BYTES) {
			throw new ApiRequestError(413, 'The MP3 file must be 25 MB or smaller.');
		}

		const bytes = new Uint8Array(await file.arrayBuffer());
		if (!looksLikeMp3(bytes)) {
			throw new ApiRequestError(415, 'The selected file does not appear to contain MP3 audio.');
		}

		const language = normalizeTranscriptionLanguage(form.get('language'));
		return json(await transcribeMp3WithCache(bytes, language, fetch), {
			headers: { 'cache-control': 'no-store' }
		});
	} catch (error) {
		if (error instanceof DeepgramRequestError) {
			if (error.providerStatus) {
				console.error(`Deepgram transcription failed with status ${error.providerStatus}.`);
			}
			return json({ error: error.message }, { status: error.status });
		}
		return apiFailure(error);
	}
};
