import { spawn } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { isIP } from 'node:net';
import { networkInterfaces } from 'node:os';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = 5173;
const addresses = [
	...new Set(
		Object.values(networkInterfaces())
			.flat()
			.filter((address) => address?.family === 'IPv4' && !address.internal)
			.map((address) => address.address)
	)
];

function defaultRouteAddress() {
	return new Promise((resolve) => {
		const socket = createSocket('udp4');
		socket.once('error', () => {
			socket.close();
			resolve(null);
		});
		// UDP connect chooses the operating system's outbound interface without sending data.
		socket.connect(53, '1.1.1.1', () => {
			const address = socket.address().address;
			socket.close();
			resolve(address);
		});
	});
}

async function publicAddress() {
	const requested = process.env.DESKTOP_PUBLIC_HOST?.trim();
	if (requested) {
		if (isIP(requested) !== 4 || !addresses.includes(requested)) {
			throw new Error(
				`DESKTOP_PUBLIC_HOST must be a local IPv4 address. Available: ${addresses.join(', ') || 'none'}`
			);
		}
		return requested;
	}
	const routed = await defaultRouteAddress();
	if (routed && addresses.includes(routed)) return routed;
	if (addresses.length === 1) return addresses[0];
	throw new Error(
		`Set DESKTOP_PUBLIC_HOST to the address clients should use. Available: ${addresses.join(', ') || 'none'}`
	);
}

try {
	const address = await publicAddress();
	const origin = `http://${address}:${port}`;
	console.log(`Desktop public dev URL: ${origin}`);
	console.log(`BETTER_AUTH_URL=${origin}`);
	const root = dirname(fileURLToPath(import.meta.url));
	const vite = fileURLToPath(new URL('./node_modules/vite/bin/vite.js', import.meta.url));
	const child = spawn(
		process.execPath,
		[vite, 'dev', '--mode', 'desktop', '--host', '0.0.0.0', '--port', String(port), '--strictPort'],
		{ cwd: root, env: { ...process.env, BETTER_AUTH_URL: origin }, stdio: 'inherit' }
	);
	child.once('error', (error) => {
		console.error(error);
		process.exitCode = 1;
	});
	child.once('exit', (code) => {
		process.exitCode = code ?? 1;
	});
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
}
