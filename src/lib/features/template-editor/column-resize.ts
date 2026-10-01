import type { LayoutPreviewMode, TemplateDefinition } from '../lesson-editor/model/types';

export const COLUMN_PAIR_MIN = 0.1;
export const COLUMN_PAIR_MAX = 0.9;

function clampRatio(ratio: number) {
	return Math.max(COLUMN_PAIR_MIN, Math.min(COLUMN_PAIR_MAX, ratio));
}

/** Resize adjacent proportional tracks without disturbing their named areas or other devices. */
export function resizeColumnPair(
	definition: TemplateDefinition,
	mode: LayoutPreviewMode,
	index: number,
	ratio: number
): TemplateDefinition {
	if (mode !== 'desktop' && mode !== 'tablet' && mode !== 'phone') return definition;
	const layout = definition.variants[mode];
	if (
		!layout ||
		!Number.isInteger(index) ||
		index < 0 ||
		index + 1 >= layout.columnWeights.length ||
		!Number.isFinite(ratio) ||
		layout.columnWeights.some((weight) => !Number.isFinite(weight) || weight <= 0 || weight > 100)
	)
		return definition;
	const total = layout.columnWeights[index] + layout.columnWeights[index + 1];
	const nextRatio = clampRatio(ratio);
	if (nextRatio === layout.columnWeights[index] / total) return definition;
	let columnWeights = [...layout.columnWeights];
	columnWeights[index] = total * nextRatio;
	columnWeights[index + 1] = total - columnWeights[index];
	const largest = Math.max(...columnWeights);
	// Weights describe proportions. Scaling every track preserves the other columns' geometry
	// while keeping the edited pair within the saved template format's weight limit.
	if (largest > 100) columnWeights = columnWeights.map((weight) => (weight / largest) * 100);
	if (columnWeights.some((weight) => !Number.isFinite(weight) || weight <= 0 || weight > 100))
		return definition;
	if (columnWeights.every((weight, column) => weight === layout.columnWeights[column]))
		return definition;
	return {
		...definition,
		variants: { ...definition.variants, [mode]: { ...layout, columnWeights } }
	};
}

export type ColumnResizeMetrics = {
	ratio: number;
	/** Sum of the two track widths, excluding their gap, in client pixels. */
	span: number;
	direction: 'ltr' | 'rtl';
};

export type ColumnResizeOptions = {
	disabled?: boolean;
	keyboard?: boolean;
	manageTouchAction?: boolean;
	pointerMetrics?: (event: PointerEvent) => ColumnResizeMetrics | null;
	getMetrics: () => ColumnResizeMetrics | null;
	onstart: () => void;
	oninput: (ratio: number) => void;
	oncommit: () => void;
	oncancel: () => void;
};

type PointerResize = {
	id: number;
	origin: number;
	latest: number;
	metrics: ColumnResizeMetrics;
	started: boolean;
	lastRatio: number;
};

/**
 * A dedicated separator's pointer and keyboard behavior. The owner handles history and rollback;
 * measurements are captured once per drag so live layout changes cannot accelerate the gesture.
 */
export function columnResize(node: HTMLElement, initialOptions: ColumnResizeOptions) {
	const doc = node.ownerDocument;
	const win = doc.defaultView!;
	const previousTouchAction = node.style.touchAction;
	let options = initialOptions;
	let pointer: PointerResize | null = null;
	let frame = 0;
	let suppressClickUntil = 0;
	if (options.manageTouchAction !== false) node.style.touchAction = 'none';

	function getMetrics(event?: PointerEvent) {
		const metrics =
			event && options.pointerMetrics ? options.pointerMetrics(event) : options.getMetrics();
		if (
			!metrics ||
			!Number.isFinite(metrics.ratio) ||
			metrics.ratio <= 0 ||
			metrics.ratio >= 1 ||
			!Number.isFinite(metrics.span) ||
			metrics.span <= 0 ||
			(metrics.direction !== 'ltr' && metrics.direction !== 'rtl')
		)
			return null;
		return { ...metrics };
	}

	function reset() {
		const previous = pointer;
		pointer = null;
		if (frame) win.cancelAnimationFrame(frame);
		frame = 0;
		doc.removeEventListener('pointermove', onPointerMove);
		doc.removeEventListener('pointerup', onPointerUp);
		doc.removeEventListener('pointercancel', onPointerCancel);
		doc.removeEventListener('keydown', onGlobalKeyDown);
		win.removeEventListener('blur', cancel);
		if (previous?.started) suppressClickUntil = win.performance.now() + 500;
		if (previous && node.hasPointerCapture(previous.id)) node.releasePointerCapture(previous.id);
		return previous;
	}

	function cancel() {
		if (reset()?.started) options.oncancel();
	}

	function applyPointer() {
		frame = 0;
		if (!pointer) return;
		if (options.disabled || !node.isConnected) {
			cancel();
			return;
		}
		const current = pointer;
		const delta = current.latest - current.origin;
		if (!current.started) {
			if (Math.abs(delta) < 3) return;
			current.started = true;
			options.onstart();
			// An owner can disable or remove the control from its start callback.
			if (pointer !== current) return;
		}
		const sign = current.metrics.direction === 'rtl' ? -1 : 1;
		const ratio = clampRatio(current.metrics.ratio + (delta * sign) / current.metrics.span);
		if (ratio !== current.lastRatio) {
			current.lastRatio = ratio;
			options.oninput(ratio);
		}
	}

	function onPointerDown(event: PointerEvent) {
		if (
			options.disabled ||
			pointer ||
			event.button !== 0 ||
			!event.isPrimary ||
			!Number.isFinite(event.clientX)
		)
			return;
		const metrics = getMetrics(event);
		if (!metrics) return;
		pointer = {
			id: event.pointerId,
			origin: event.clientX,
			latest: event.clientX,
			metrics,
			started: false,
			lastRatio: metrics.ratio
		};
		try {
			node.setPointerCapture(event.pointerId);
		} catch {
			// Scoped document listeners keep dragging usable if capture is unavailable.
		}
		doc.addEventListener('pointermove', onPointerMove, { passive: false });
		doc.addEventListener('pointerup', onPointerUp);
		doc.addEventListener('pointercancel', onPointerCancel);
		doc.addEventListener('keydown', onGlobalKeyDown);
		win.addEventListener('blur', cancel);
	}

	function onPointerMove(event: PointerEvent) {
		if (!pointer || event.pointerId !== pointer.id || !Number.isFinite(event.clientX)) return;
		pointer.latest = event.clientX;
		if (pointer.started || Math.abs(pointer.latest - pointer.origin) >= 3) {
			if (event.cancelable) event.preventDefault();
			if (!frame) frame = win.requestAnimationFrame(applyPointer);
		}
	}

	function onPointerUp(event: PointerEvent) {
		if (!pointer || event.pointerId !== pointer.id) return;
		if (Number.isFinite(event.clientX)) pointer.latest = event.clientX;
		if (frame) win.cancelAnimationFrame(frame);
		applyPointer();
		if (reset()?.started) options.oncommit();
	}

	function onPointerCancel(event: PointerEvent) {
		if (pointer?.id === event.pointerId) cancel();
	}

	function onGlobalKeyDown(event: KeyboardEvent) {
		if (pointer && event.key === 'Escape') {
			event.preventDefault();
			cancel();
		}
	}

	function onKeyDown(event: KeyboardEvent) {
		if (
			options.keyboard === false ||
			options.disabled ||
			pointer ||
			event.ctrlKey ||
			event.metaKey ||
			event.altKey
		)
			return;
		const metrics = getMetrics();
		if (!metrics) return;
		const step = event.shiftKey ? 0.1 : 0.01;
		const direction = metrics.direction === 'rtl' ? -1 : 1;
		let ratio: number;
		switch (event.key) {
			case 'ArrowLeft':
				ratio = metrics.ratio - step * direction;
				break;
			case 'ArrowRight':
				ratio = metrics.ratio + step * direction;
				break;
			case 'ArrowDown':
				ratio = metrics.ratio - step;
				break;
			case 'ArrowUp':
				ratio = metrics.ratio + step;
				break;
			case 'Home':
				ratio = COLUMN_PAIR_MIN;
				break;
			case 'End':
				ratio = COLUMN_PAIR_MAX;
				break;
			default:
				return;
		}
		event.preventDefault();
		ratio = clampRatio(ratio);
		if (ratio === metrics.ratio) return;
		options.onstart();
		options.oninput(ratio);
		options.oncommit();
	}

	function onClick(event: MouseEvent) {
		if (win.performance.now() < suppressClickUntil) {
			event.preventDefault();
			event.stopImmediatePropagation();
		}
	}

	node.addEventListener('pointerdown', onPointerDown);
	node.addEventListener('lostpointercapture', onPointerCancel);
	node.addEventListener('keydown', onKeyDown);
	node.addEventListener('blur', cancel);
	node.addEventListener('click', onClick, true);

	return {
		update(next: ColumnResizeOptions) {
			if (next.disabled) cancel();
			options = next;
		},
		destroy() {
			cancel();
			node.style.touchAction = previousTouchAction;
			node.removeEventListener('pointerdown', onPointerDown);
			node.removeEventListener('lostpointercapture', onPointerCancel);
			node.removeEventListener('keydown', onKeyDown);
			node.removeEventListener('blur', cancel);
			node.removeEventListener('click', onClick, true);
		}
	};
}
