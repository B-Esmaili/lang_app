const overlaySelector = '[data-reading-overlay]';
const mobileQuery = '(max-width: 38rem)';

function visibleViewport() {
	const viewport = window.visualViewport;
	const top = viewport?.offsetTop ?? 0;
	return { top, bottom: top + (viewport?.height ?? window.innerHeight) };
}

function overlays(target: Element): HTMLElement[] {
	const reader = target.closest('.course-reader');
	return [...document.querySelectorAll<HTMLElement>(overlaySelector)].filter((element) => {
		if (
			element.dataset.readingOverlay === 'mobile-bottom' &&
			!window.matchMedia(mobileQuery).matches
		)
			return false;
		const owner = element.closest('.course-reader');
		return (!owner || owner === reader) && element.getClientRects().length > 0;
	});
}

function scrollParent(target: Element): HTMLElement | null {
	for (let parent = target.parentElement; parent; parent = parent.parentElement) {
		if (parent === document.body || parent === document.documentElement) break;
		if (
			/(auto|scroll)/.test(getComputedStyle(parent).overflowY) &&
			parent.scrollHeight > parent.clientHeight
		)
			return parent;
	}
	return null;
}

/** The actual reading area, after sticky headers, the player, sheets, and keyboard. */
export function readingViewport(target: Element) {
	let { top, bottom } = visibleViewport();
	const targetBounds = target.getBoundingClientRect();
	for (const element of overlays(target)) {
		const bounds = element.getBoundingClientRect();
		if (
			bounds.right <= targetBounds.left ||
			bounds.left >= targetBounds.right ||
			bounds.bottom <= top ||
			bounds.top >= bottom
		)
			continue;
		if (element.dataset.readingOverlay === 'top') top = Math.max(top, bounds.bottom);
		else bottom = Math.min(bottom, bounds.top);
	}
	const parent = scrollParent(target);
	if (parent) {
		const bounds = parent.getBoundingClientRect();
		top = Math.max(top, bounds.top);
		bottom = Math.min(bottom, bounds.bottom);
	}
	return { top: top + 12, bottom: bottom - 12 };
}

/** Scroll only when obscured; center within the usable space, not the whole screen. */
export function scrollIntoReadingViewport(
	target: Element,
	bounds = target.getBoundingClientRect()
) {
	const { top, bottom } = readingViewport(target);
	if (bottom <= top || (bounds.top >= top && bounds.bottom <= bottom)) return;
	const available = Math.max(0, bottom - top - bounds.height);
	const delta = bounds.top - (top + available * 0.4);
	const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
		? 'instant'
		: 'smooth';
	const parent = scrollParent(target);
	(parent ?? window).scrollBy({ top: delta, behavior });
}

/** Share measured dock clearance with mobile sheets and reserve space for the last line. */
export function observeReadingViewport(root: HTMLElement) {
	let frame: number | null = null;
	let signature = '';
	const observed = new Set<Element>();
	const resizeObserver = new ResizeObserver(schedule);
	const setPixels = (name: string, value: number) => {
		const next = `${Math.ceil(value)}px`;
		if (root.style.getPropertyValue(name) !== next) root.style.setProperty(name, next);
	};
	function measure() {
		frame = null;
		const viewport = visibleViewport();
		setPixels('--reader-visual-bottom', Math.max(0, window.innerHeight - viewport.bottom));
		setPixels('--reader-visual-height', viewport.bottom - viewport.top);
		const elements = overlays(root);
		const nextObserved = new Set<Element>([root, ...elements]);
		for (const element of observed) {
			if (!nextObserved.has(element)) {
				resizeObserver.unobserve(element);
				observed.delete(element);
			}
		}
		for (const element of nextObserved) {
			if (!observed.has(element)) {
				resizeObserver.observe(element);
				observed.add(element);
			}
		}
		let playerClearance = 0;
		let bottomSpace = 0;
		const geometry: number[] = [viewport.top, viewport.bottom];
		for (const element of elements) {
			const bounds = element.getBoundingClientRect();
			if (element.dataset.readingOverlay === 'top') {
				geometry.push(bounds.height);
				continue;
			}
			const clearance = Math.max(0, viewport.bottom - bounds.top + 8);
			bottomSpace = Math.max(bottomSpace, clearance);
			if (element.matches('.media-element.is-docked'))
				playerClearance = Math.max(playerClearance, clearance);
			geometry.push(bounds.height, bounds.top);
		}
		setPixels('--reader-player-clearance', playerClearance);
		setPixels('--reader-bottom-space', bottomSpace);
		const nextSignature = geometry.join(':');
		if (signature !== nextSignature) {
			signature = nextSignature;
			root.dispatchEvent(new CustomEvent('readingviewportchange'));
		}
	}
	function schedule() {
		frame ??= requestAnimationFrame(measure);
	}
	const mutations = new MutationObserver(schedule);
	mutations.observe(root, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: ['class', 'data-reading-overlay']
	});
	window.addEventListener('resize', schedule);
	window.visualViewport?.addEventListener('resize', schedule);
	window.visualViewport?.addEventListener('scroll', schedule);
	schedule();
	return {
		destroy() {
			if (frame !== null) cancelAnimationFrame(frame);
			resizeObserver.disconnect();
			mutations.disconnect();
			window.removeEventListener('resize', schedule);
			window.visualViewport?.removeEventListener('resize', schedule);
			window.visualViewport?.removeEventListener('scroll', schedule);
		}
	};
}
