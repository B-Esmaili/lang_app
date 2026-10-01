import type { LessonDocument, TemplateDefinition } from '../model';
import { canPlaceWidget } from '../model/editor-commands';

export type DropRect = { x: number; y: number; width: number; height: number };
export type LessonDragSource =
	| { kind: 'frame'; frameId: string }
	| { kind: 'widget'; widgetId: string }
	| { kind: 'library'; widgetType: string };
export type LessonDrop =
	| { kind: 'frame'; index: number; rect: DropRect }
	| { kind: 'widget'; frameId: string; slotId: string; index: number; rect: DropRect };
export type LessonDrag = { source: LessonDragSource; target?: LessonDrop; invalid?: boolean };
export type LessonDropGeometry = {
	width: number;
	height: number;
	frames: Array<{ id: string; rect: DropRect }>;
	slots: Array<{ frameId: string; id: string; rect: DropRect }>;
	widgets: Array<{ id: string; frameId: string; slotId: string; rect: DropRect }>;
};

/** Actual browser layout supplies hit targets, including natural text wrapping and RTL. */
export function measureLessonDropGeometry(paper: HTMLElement): LessonDropGeometry {
	const bounds = paper.getBoundingClientRect();
	const rect = (node: HTMLElement): DropRect => {
		const box = node.getBoundingClientRect();
		return {
			x: box.left - bounds.left,
			y: box.top - bounds.top,
			width: box.width,
			height: box.height
		};
	};
	return {
		width: bounds.width,
		height: bounds.height,
		frames: Array.from(paper.querySelectorAll<HTMLElement>('[data-lesson-frame]')).map((node) => ({
			id: node.dataset.frameId!,
			rect: rect(node)
		})),
		slots: Array.from(paper.querySelectorAll<HTMLElement>('[data-lesson-slot]')).map((node) => ({
			frameId: node.dataset.frameId!,
			id: node.dataset.slotId!,
			rect: rect(node)
		})),
		widgets: Array.from(paper.querySelectorAll<HTMLElement>('[data-lesson-widget]')).map(
			(node) => ({
				id: node.dataset.widgetId!,
				frameId: node.dataset.frameId!,
				slotId: node.dataset.slotId!,
				rect: rect(node)
			})
		)
	};
}

function contains(rect: DropRect, x: number, y: number) {
	return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

/** Destination indices refer to the list after the moving item is removed. */
export function lessonDropAt(
	geometry: LessonDropGeometry,
	document: LessonDocument,
	templates: readonly TemplateDefinition[],
	source: LessonDragSource,
	x: number,
	y: number
): LessonDrag {
	const none: LessonDrag = { source, invalid: true };
	if (x < 0 || x > geometry.width || y < 0 || y > geometry.height) return none;
	if (source.kind === 'frame') {
		const remaining = geometry.frames.filter((frame) => frame.id !== source.frameId);
		if (!remaining.length) return none;
		const next = remaining.findIndex(({ rect }) => y < rect.y + rect.height / 2);
		const index = next < 0 ? remaining.length : next;
		const neighbor = remaining[index] ?? remaining.at(-1)!;
		const top = index < remaining.length ? neighbor.rect.y : neighbor.rect.y + neighbor.rect.height;
		return {
			source,
			target: { kind: 'frame', index, rect: { ...neighbor.rect, y: top, height: 0 } }
		};
	}
	const slot = geometry.slots.find(({ rect }) => contains(rect, x, y));
	if (!slot) return none;
	const frame = document.frames.find((frame) => frame.id === slot.frameId);
	const type =
		source.kind === 'library'
			? source.widgetType
			: document.frames
					.flatMap((frame) => Object.values(frame.slots).flat())
					.find((widget) => widget.id === source.widgetId)?.type;
	if (!frame || !type || !canPlaceWidget(document, templates, type, frame.id, slot.id)) return none;
	const items = geometry.widgets.filter(
		(widget) =>
			widget.frameId === frame.id &&
			widget.slotId === slot.id &&
			(source.kind !== 'widget' || widget.id !== source.widgetId)
	);
	const next = items.findIndex(({ rect }) => y < rect.y + rect.height / 2);
	const index = next < 0 ? items.length : next;
	const top =
		items[index]?.rect.y ??
		(items.at(-1) ? items.at(-1)!.rect.y + items.at(-1)!.rect.height : slot.rect.y);
	return {
		source,
		target: {
			kind: 'widget',
			frameId: frame.id,
			slotId: slot.id,
			index,
			rect: { x: slot.rect.x, y: top, width: slot.rect.width, height: 0 }
		}
	};
}

export type LessonDragController = ReturnType<typeof createLessonDragController>;

/** Shared grip gesture for document elements and library cards. Text bodies never start a drag. */
export function createLessonDragController(options: {
	surface: () => HTMLElement | null;
	document: () => LessonDocument;
	templates: () => readonly TemplateDefinition[];
	enabled: () => boolean;
	onchange: (drag: LessonDrag | null) => void;
	ondrop: (source: LessonDragSource, target: LessonDrop) => void;
}) {
	let gesture: {
		id: number;
		node: HTMLElement;
		source: LessonDragSource;
		x: number;
		y: number;
		startX: number;
		startY: number;
		document: LessonDocument;
		started: boolean;
	} | null = null;
	let feedback: LessonDrag | null = null;
	let raf = 0;
	let previousTime = 0;
	let suppressUntil = 0;
	let suppressNode: HTMLElement | null = null;
	let blockedPointer: number | null = null;
	let suppressionTimer: ReturnType<typeof setTimeout> | undefined;

	function position() {
		if (!gesture) return;
		const surface = options.surface();
		feedback = { source: gesture.source, invalid: true };
		if (surface) {
			const bounds = surface.getBoundingClientRect();
			const topElement = surface.ownerDocument.elementFromPoint(gesture.x, gesture.y);
			// Do not accept drops through a toolbar or an open dialog.
			if (topElement && surface.contains(topElement))
				feedback = lessonDropAt(
					measureLessonDropGeometry(surface),
					options.document(),
					options.templates(),
					gesture.source,
					gesture.x - bounds.left,
					gesture.y - bounds.top
				);
		}
		options.onchange(feedback);
	}
	function suppress(event: Event) {
		if (performance.now() < suppressUntil && suppressNode?.contains(event.target as Node)) {
			event.preventDefault();
			event.stopImmediatePropagation();
		}
	}
	function reset(released = false) {
		if (!gesture) return;
		const old = gesture;
		gesture = null;
		feedback = null;
		if (raf) cancelAnimationFrame(raf);
		raf = 0;
		document.removeEventListener('pointermove', move, true);
		document.removeEventListener('pointerup', end, true);
		document.removeEventListener('pointercancel', cancelEvent, true);
		document.removeEventListener('keydown', keydown, true);
		window.removeEventListener('blur', cancel);
		old.node.removeEventListener('lostpointercapture', lostCapture);
		if (old.node.hasPointerCapture(old.id)) old.node.releasePointerCapture(old.id);
		if (old.started) {
			clearSuppression();
			suppressNode = old.node;
			suppressUntil = released ? performance.now() + 500 : Infinity;
			document.addEventListener('click', suppress, true);
			document.addEventListener('dblclick', suppress, true);
			document.addEventListener('pointerdown', nextPointer, true);
			if (released) suppressionTimer = setTimeout(clearSuppression, 550);
			else {
				blockedPointer = old.id;
				document.addEventListener('pointerup', blockedRelease, true);
				document.addEventListener('pointercancel', blockedRelease, true);
			}
		}
		options.onchange(null);
	}
	function clearSuppression() {
		clearTimeout(suppressionTimer);
		document.removeEventListener('click', suppress, true);
		document.removeEventListener('dblclick', suppress, true);
		document.removeEventListener('pointerdown', nextPointer, true);
		document.removeEventListener('pointerup', blockedRelease, true);
		document.removeEventListener('pointercancel', blockedRelease, true);
		suppressNode = null;
		blockedPointer = null;
	}
	function nextPointer(event: PointerEvent) {
		if (event.isPrimary) clearSuppression();
	}
	function blockedRelease(event: PointerEvent) {
		if (event.pointerId !== blockedPointer) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		blockedPointer = null;
		document.removeEventListener('pointerup', blockedRelease, true);
		document.removeEventListener('pointercancel', blockedRelease, true);
		suppressUntil = performance.now() + 500;
		suppressionTimer = setTimeout(clearSuppression, 550);
	}
	function cancel() {
		reset();
	}
	function lostCapture(event: PointerEvent) {
		// Touch first implicitly captures the pressed SVG/button. Transferring that
		// capture to its draggable card bubbles a loss event from the child.
		if (gesture && event.pointerId === gesture.id && event.target === gesture.node) cancel();
	}
	function cancelEvent(event: PointerEvent) {
		if (gesture?.id === event.pointerId) reset(true);
	}
	function keydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && gesture) {
			event.preventDefault();
			event.stopImmediatePropagation();
			cancel();
		}
	}
	function valid() {
		return (
			gesture &&
			gesture.node.isConnected &&
			options.enabled() &&
			gesture.document === options.document()
		);
	}
	function animate(time: number) {
		raf = 0;
		if (!valid()) {
			cancel();
			return;
		}
		if (gesture?.started) {
			const surface = options.surface();
			const bounds = surface?.getBoundingClientRect();
			if (bounds && gesture.x >= bounds.left && gesture.x <= bounds.right) {
				const edge = 64;
				const toolbar = surface
					?.closest('.lesson-editor')
					?.querySelector('.editor-toolbar')
					?.getBoundingClientRect();
				const top = Math.max(0, toolbar?.bottom ?? 160);
				const bottomInset =
					parseFloat(getComputedStyle(surface!).getPropertyValue('--sidebar-bottom-gap')) || 16;
				const bottom = window.innerHeight - bottomInset;
				const velocity =
					gesture.y < top + edge
						? -Math.min(1, (top + edge - gesture.y) / edge)
						: gesture.y > bottom - edge
							? Math.min(1, (gesture.y - bottom + edge) / edge)
							: 0;
				if (velocity)
					window.scrollBy(0, velocity * 700 * Math.min(0.04, (time - previousTime) / 1000));
			}
			position();
		}
		previousTime = time;
		if (gesture) raf = requestAnimationFrame(animate);
	}
	function move(event: PointerEvent) {
		if (!gesture || event.pointerId !== gesture.id) return;
		if (!valid()) {
			cancel();
			return;
		}
		gesture.x = event.clientX;
		gesture.y = event.clientY;
		if (!gesture.started && Math.hypot(gesture.x - gesture.startX, gesture.y - gesture.startY) < 6)
			return;
		if (!gesture.started) {
			gesture.started = true;
			// Capture only a real drag; a normal card click must reach its Add button.
			try {
				gesture.node.setPointerCapture(event.pointerId);
			} catch {
				/* Document listeners remain active. */
			}
		}
		event.preventDefault();
		event.stopImmediatePropagation();
		position();
	}
	function end(event: PointerEvent) {
		if (!gesture || event.pointerId !== gesture.id) return;
		if (!valid()) {
			if (gesture.started) {
				event.preventDefault();
				event.stopImmediatePropagation();
			}
			reset(true);
			return;
		}
		if (!gesture.started) {
			reset();
			return;
		}
		event.preventDefault();
		event.stopImmediatePropagation();
		gesture.x = event.clientX;
		gesture.y = event.clientY;
		position();
		const drop = feedback;
		reset(true);
		if (drop?.target && !drop.invalid) options.ondrop(drop.source, drop.target);
	}
	return {
		start(event: PointerEvent, node: HTMLElement, source: LessonDragSource) {
			if (gesture || !options.enabled() || !event.isPrimary || event.button !== 0) return false;
			gesture = {
				id: event.pointerId,
				node,
				source,
				x: event.clientX,
				y: event.clientY,
				startX: event.clientX,
				startY: event.clientY,
				document: options.document(),
				started: false
			};
			node.addEventListener('lostpointercapture', lostCapture);
			document.addEventListener('pointermove', move, { capture: true, passive: false });
			document.addEventListener('pointerup', end, true);
			document.addEventListener('pointercancel', cancelEvent, true);
			document.addEventListener('keydown', keydown, true);
			window.addEventListener('blur', cancel);
			previousTime = performance.now();
			raf = requestAnimationFrame(animate);
			return true;
		},
		get dragging() {
			return !!gesture?.started;
		},
		get pending() {
			return !!gesture;
		},
		cancel,
		destroy() {
			cancel();
			clearTimeout(suppressionTimer);
			if (typeof document !== 'undefined') clearSuppression();
		}
	};
}

export function libraryDragSource(
	node: HTMLElement,
	initial: { controller?: LessonDragController; widgetType: string; disabled?: boolean }
) {
	let options = initial;
	const down = (event: PointerEvent) => {
		if (options.disabled || !(event.target as Element).closest('[data-library-grip]')) return;
		options.controller?.start(event, node, { kind: 'library', widgetType: options.widgetType });
	};
	node.addEventListener('pointerdown', down);
	return {
		update(next: typeof options) {
			options = next;
		},
		destroy() {
			node.removeEventListener('pointerdown', down);
			if (options.controller?.pending) options.controller.cancel();
		}
	};
}

/** Attach only to a dedicated native grip, never to editable text or its wrapper. */
export function lessonDragHandle(
	node: HTMLElement,
	initial: { controller?: LessonDragController; source: LessonDragSource; disabled?: boolean }
) {
	let options = initial;
	const down = (event: PointerEvent) => {
		if (!options.disabled) options.controller?.start(event, node, options.source);
	};
	node.addEventListener('pointerdown', down);
	return {
		update(next: typeof options) {
			options = next;
		},
		destroy() {
			node.removeEventListener('pointerdown', down);
		}
	};
}
