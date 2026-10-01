export type DragState = {
	sourceId: string;
	targetId: string | null;
	placement: 'before' | 'after';
	x: number;
	y: number;
	keyboard: boolean;
};

export type DragHandleOptions = {
	id: string;
	disabled?: boolean;
	scope: () => HTMLElement | null;
	orderedIds: readonly string[];
	sourceAt?: (event: PointerEvent) => string | null;
	keyboard?: boolean;
	manageTouchAction?: boolean;
	onstart: (state: DragState) => void;
	onmove: (state: DragState) => void;
	ondrop: (state: DragState) => void;
	oncancel: () => void;
};

type PointerOrigin = { id: number; x: number; y: number };

/**
 * Drag from a dedicated handle, leaving the rest of each card available for scrolling and selection.
 * The owner renders drag feedback and commits changes only in ondrop; hit targets stay stationary.
 */
export function dragHandle(node: HTMLElement, initialOptions: DragHandleOptions) {
	const doc = node.ownerDocument;
	const win = doc.defaultView!;
	const previousTouchAction = node.style.touchAction;
	let options = initialOptions;
	let sourceId = options.id;
	let scope: HTMLElement | null = null;
	let pointer: PointerOrigin | null = null;
	let state: DragState | null = null;
	let keyboardPosition: number | null = null;
	let frame = 0;
	let lastFrame = 0;
	let suppressClickUntil = 0;
	let listening = false;

	if (options.manageTouchAction !== false) node.style.touchAction = 'none';

	function hasScope() {
		return !!scope?.isConnected && node.isConnected && options.scope() === scope;
	}

	function targets() {
		return Array.from(scope?.querySelectorAll<HTMLElement>('[data-drop-id]') ?? []).map(targetFor);
	}
	function targetFor(element: HTMLElement) {
		return {
			id: element.dataset.dropId!,
			element,
			rect: element.getBoundingClientRect(),
			axis: axis(element),
			direction:
				win.getComputedStyle(element).direction === 'rtl' ? ('rtl' as const) : ('ltr' as const),
			scrollIntoView: () => element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
		};
	}

	function axis(target: HTMLElement) {
		const explicit = target.closest<HTMLElement>('[data-drop-axis]')?.dataset.dropAxis;
		if (explicit === 'horizontal' || explicit === 'vertical') return explicit;
		const parent = target.parentElement;
		if (parent) {
			const style = win.getComputedStyle(parent);
			if (
				style.display.includes('grid') &&
				style.gridTemplateColumns.trim().split(/\s+/).length > 1
			)
				return 'horizontal';
		}
		return 'vertical';
	}

	function hitTarget(x: number, y: number) {
		for (const element of doc.elementsFromPoint(x, y)) {
			const target = element.closest<HTMLElement>('[data-drop-id]');
			if (target && scope?.contains(target) && options.orderedIds.includes(target.dataset.dropId!))
				return targetFor(target);
		}
		return null;
	}

	function movePointer(x: number, y: number) {
		if (!state) return;
		const target = hitTarget(x, y);
		let placement: DragState['placement'] = 'before';
		if (target) {
			const rect = target.rect;
			const horizontal = target.axis === 'horizontal';
			const rtl = horizontal && target.direction === 'rtl';
			const firstHalf = horizontal
				? x < rect.left + rect.width / 2
				: y < rect.top + rect.height / 2;
			placement = firstHalf !== rtl ? 'before' : 'after';
		}
		const next = { ...state, x, y, targetId: target?.id ?? null, placement };
		if (
			next.x === state.x &&
			next.y === state.y &&
			next.targetId === state.targetId &&
			next.placement === state.placement
		)
			return;
		state = next;
		options.onmove({ ...next });
	}

	function edgeDelta(position: number, start: number, end: number, seconds: number) {
		if (position < start || position > end || end <= start) return 0;
		const edge = Math.min(56, (end - start) / 4);
		if (position < start + edge) return -650 * seconds * (1 - (position - start) / edge);
		if (position > end - edge) return 650 * seconds * (1 - (end - position) / edge);
		return 0;
	}

	function autoScroll(seconds: number) {
		if (!state || state.keyboard || !scope) return false;
		const { x, y } = state;
		let element = doc.elementsFromPoint(x, y).find((item) => scope?.contains(item)) as
			HTMLElement | undefined;
		while (element) {
			const isPage = element === doc.scrollingElement;
			const style = win.getComputedStyle(element);
			const canScrollY =
				(isPage || /auto|scroll|overlay/.test(style.overflowY)) &&
				element.scrollHeight > element.clientHeight;
			const canScrollX =
				(isPage || /auto|scroll|overlay/.test(style.overflowX)) &&
				element.scrollWidth > element.clientWidth;
			if (canScrollX || canScrollY) {
				const rect = element.getBoundingClientRect();
				const left = isPage ? 0 : Math.max(0, rect.left);
				const top = isPage ? 0 : Math.max(0, rect.top);
				const right = isPage ? win.innerWidth : Math.min(win.innerWidth, rect.right);
				const bottom = isPage ? win.innerHeight : Math.min(win.innerHeight, rect.bottom);
				const beforeX = element.scrollLeft;
				const beforeY = element.scrollTop;
				if (canScrollX) element.scrollLeft += edgeDelta(x, left, right, seconds);
				if (canScrollY) element.scrollTop += edgeDelta(y, top, bottom, seconds);
				if (beforeX !== element.scrollLeft || beforeY !== element.scrollTop) return true;
			}
			element = element.parentElement ?? undefined;
		}
		return false;
	}

	function animate(time: number) {
		frame = 0;
		if (!hasScope() || options.disabled) {
			cancel();
			return;
		}
		if (state && !state.keyboard) {
			autoScroll(Math.min((time - lastFrame) / 1000, 0.04));
			movePointer(state.x, state.y);
		}
		lastFrame = time;
		if (listening) frame = win.requestAnimationFrame(animate);
	}

	function startListening() {
		if (listening) return;
		listening = true;
		doc.addEventListener('pointermove', onPointerMove, { passive: false });
		doc.addEventListener('pointerup', onPointerUp);
		doc.addEventListener('pointercancel', onPointerCancel);
		doc.addEventListener('keydown', onGlobalKeyDown);
		win.addEventListener('blur', cancel);
		lastFrame = win.performance.now();
		frame = win.requestAnimationFrame(animate);
	}

	function reset() {
		const capturedId = pointer?.id;
		if (state && !state.keyboard) suppressClickUntil = win.performance.now() + 500;
		pointer = null;
		state = null;
		scope = null;
		keyboardPosition = null;
		if (frame) win.cancelAnimationFrame(frame);
		frame = 0;
		if (listening) {
			doc.removeEventListener('pointermove', onPointerMove);
			doc.removeEventListener('pointerup', onPointerUp);
			doc.removeEventListener('pointercancel', onPointerCancel);
			doc.removeEventListener('keydown', onGlobalKeyDown);
			win.removeEventListener('blur', cancel);
			listening = false;
		}
		if (capturedId !== undefined && node.hasPointerCapture(capturedId))
			node.releasePointerCapture(capturedId);
	}

	function cancel() {
		const wasDragging = !!state;
		reset();
		if (wasDragging) options.oncancel();
	}

	function drop() {
		if (!state) return;
		if (
			!hasScope() ||
			!state.targetId ||
			!options.orderedIds.includes(state.targetId) ||
			!targets().some((target) => target.id === state?.targetId)
		) {
			cancel();
			return;
		}
		const result = { ...state };
		reset();
		options.ondrop(result);
	}

	function onPointerDown(event: PointerEvent) {
		if (options.disabled || pointer || state || event.button !== 0 || !event.isPrimary) return;
		const resolved = options.sourceAt ? options.sourceAt(event) : options.id;
		if (!resolved) return;
		sourceId = resolved;
		scope = options.scope();
		if (!scope?.isConnected) return;
		pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
		try {
			node.setPointerCapture(event.pointerId);
		} catch {
			// Document listeners also support environments where capture is unavailable.
		}
		startListening();
	}

	function onPointerMove(event: PointerEvent) {
		if (!pointer || event.pointerId !== pointer.id) return;
		if (!hasScope()) {
			cancel();
			return;
		}
		if (!state) {
			if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < 6) return;
			state = {
				sourceId,
				targetId: null,
				placement: 'before',
				x: event.clientX,
				y: event.clientY,
				keyboard: false
			};
			options.onstart({ ...state });
		}
		if (event.cancelable) event.preventDefault();
		movePointer(event.clientX, event.clientY);
	}

	function onPointerUp(event: PointerEvent) {
		if (!pointer || event.pointerId !== pointer.id) return;
		if (state) {
			movePointer(event.clientX, event.clientY);
			drop();
		} else reset();
	}

	function onPointerCancel(event: PointerEvent) {
		if (pointer?.id === event.pointerId) cancel();
	}

	function onLostPointerCapture(event: PointerEvent) {
		if (pointer?.id === event.pointerId) cancel();
	}

	function onGlobalKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape' && (state || pointer)) {
			event.preventDefault();
			cancel();
		}
	}

	function moveKeyboard(delta: number) {
		if (!state) return;
		const remaining = options.orderedIds.filter((id) => id !== sourceId);
		if (!remaining.length) return;
		keyboardPosition =
			keyboardPosition === null
				? delta > 0
					? 0
					: remaining.length
				: Math.max(0, Math.min(remaining.length, keyboardPosition + delta));
		const originalIndex = options.orderedIds.indexOf(sourceId);
		const unchanged = originalIndex !== -1 && keyboardPosition === originalIndex;
		const before = keyboardPosition === 0 || (delta < 0 && keyboardPosition < remaining.length);
		const targetId = unchanged
			? sourceId
			: remaining[before ? keyboardPosition : keyboardPosition - 1];
		const placement = unchanged || before ? 'before' : 'after';
		const sourceParent = node.closest('[data-drop-id]')?.parentElement;
		const matching = targets().filter((target) => target.id === targetId);
		const target =
			matching.find((item) => item.element.parentElement === sourceParent) ?? matching[0];
		if (!target) return;
		target.scrollIntoView();
		const rect = target.rect;
		state = {
			...state,
			targetId,
			placement,
			x: rect.left + rect.width / 2,
			y: rect.top + rect.height / 2
		};
		options.onmove({ ...state });
	}

	function onKeyDown(event: KeyboardEvent) {
		if (
			options.keyboard === false ||
			options.disabled ||
			event.altKey ||
			event.ctrlKey ||
			event.metaKey
		)
			return;
		const activation = event.key === ' ' || event.key === 'Enter';
		if (activation && !pointer) {
			event.preventDefault();
			if (event.repeat) return;
			if (state) drop();
			else {
				sourceId = options.id;
				scope = options.scope();
				if (!scope?.isConnected) return;
				const sourceIndex = options.orderedIds.indexOf(sourceId);
				keyboardPosition = sourceIndex === -1 ? null : sourceIndex;
				const rect = node.getBoundingClientRect();
				state = {
					sourceId,
					targetId: sourceIndex === -1 ? null : sourceId,
					placement: 'before',
					x: rect.left + rect.width / 2,
					y: rect.top + rect.height / 2,
					keyboard: true
				};
				startListening();
				options.onstart({ ...state });
			}
		} else if (state?.keyboard && event.key.startsWith('Arrow')) {
			event.preventDefault();
			const rtl = win.getComputedStyle(node).direction === 'rtl';
			const forward = event.key === 'ArrowDown' || event.key === (rtl ? 'ArrowLeft' : 'ArrowRight');
			moveKeyboard(forward ? 1 : -1);
		}
	}

	function onClick(event: MouseEvent) {
		if (win.performance.now() < suppressClickUntil) {
			event.preventDefault();
			event.stopImmediatePropagation();
		}
	}

	node.addEventListener('pointerdown', onPointerDown);
	node.addEventListener('lostpointercapture', onLostPointerCapture);
	node.addEventListener('keydown', onKeyDown);
	node.addEventListener('blur', cancel);
	node.addEventListener('click', onClick, true);

	return {
		update(next: DragHandleOptions) {
			if (next.id !== options.id || next.disabled) cancel();
			options = next;
			if (listening && !hasScope()) cancel();
		},
		destroy() {
			cancel();
			node.style.touchAction = previousTouchAction;
			node.removeEventListener('pointerdown', onPointerDown);
			node.removeEventListener('lostpointercapture', onLostPointerCapture);
			node.removeEventListener('keydown', onKeyDown);
			node.removeEventListener('blur', cancel);
			node.removeEventListener('click', onClick, true);
		}
	};
}
