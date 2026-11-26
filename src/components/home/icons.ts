// Shared hand-drawn SVG icon loader and canvas renderer.
// Caches HTMLImageElement instances across components and invokes `onLoad`
// so paused/static canvases repaint as soon as icons arrive.

const cache = new Map<string, HTMLImageElement>();

export function loadIcon(src: string, onLoad?: () => void): HTMLImageElement {
	let img = cache.get(src);
	if (!img) {
		img = new Image();
		img.decoding = "async";
		img.src = src;
		cache.set(src, img);
	}
	if (onLoad && !img.complete) {
		img.addEventListener("load", onLoad, { once: true });
	}
	return img;
}

// Draws an SVG icon centered at (x, y), fitting within a `maxSize` box while
// preserving its intrinsic aspect ratio. Returns true if the image was ready.
export function drawIcon(
	ctx: CanvasRenderingContext2D,
	src: string,
	x: number,
	y: number,
	maxSize: number,
	onLoad?: () => void,
): boolean {
	const img = loadIcon(src, onLoad);
	if (!img.complete || img.naturalWidth < 1 || img.naturalHeight < 1) return false;
	const ratio = img.naturalWidth / img.naturalHeight;
	const w = ratio >= 1 ? maxSize : maxSize * ratio;
	const h = ratio >= 1 ? maxSize / ratio : maxSize;
	ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
	return true;
}
