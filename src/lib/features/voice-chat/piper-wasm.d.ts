declare module '@diffusionstudio/piper-wasm/build/piper_phonemize.js' {
	type PiperModule = {
		callMain(args: string[]): number;
	};

	type PiperModuleOptions = {
		locateFile?: (path: string) => string;
		print?: (value: string) => void;
		printErr?: (value: string) => void;
	};

	export default function createPiperPhonemize(options?: PiperModuleOptions): Promise<PiperModule>;
}
