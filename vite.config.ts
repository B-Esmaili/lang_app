import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import fs from 'node:fs'; // Enable with the HTTPS configuration below.

export default defineConfig(({ mode }) => ({
	// Let desktop tests/dev run alongside the regular web dev server.
	cacheDir: mode === 'desktop' ? 'node_modules/.vite-desktop' : undefined,
	optimizeDeps: mode === 'desktop' ? { include: ['@lucide/svelte'] } : undefined,
	plugins: [
		tailwindcss(),
		sveltekit({
			outDir: mode === 'desktop' ? '.svelte-kit-desktop' : '.svelte-kit',
			compilerOptions: {
				experimental: { async: true },
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			experimental: { remoteFunctions: true },
			adapter: adapter(),
			typescript: {
				config: (config) => {
					config.include.push('../drizzle.config.ts');
				}
			}
		})
	],
	server: {
		allowedHosts :["feline-zoning-blend.ngrok-free.dev"],
		fs: mode === 'desktop' ? { allow: ['tests'] } : undefined,
		https:
			mode === 'desktop'
				? undefined
				: {
						key: fs.readFileSync('./localhost+2-key.pem'),
						cert: fs.readFileSync('./localhost+2.pem')
					}
	}
}));
