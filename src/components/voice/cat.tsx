// The moq.pro cat, lip-syncing to whatever `voice` plays. It is drawn on twos with a boiling
// outline, like a chalk cartoon.
//
// Mouths are separate files so they can be redrawn by hand: public/voice/mouth/<shape>.svg, one
// per name in SHAPES. Each is a 200x120 box whose point (100,50) is the center of the mouth, and
// the box sits at (108,265) in the cat's 420x420 favicon box, just under the eyes. Draw on
// transparent: the cat's slate shows through. The boil distorts the mouth along with the cat.
import { createEffect, createSignal, createUniqueId, For, onCleanup, onMount } from "solid-js";
import { centroid, ease, follow, level, pick, SHAPES, type Shape } from "./mouth";

// moq.pro's favicon (app/static/favicon.svg), in its own upside-down tenths.
const M =
	"M1051 3668c-57-38-76-94-141-404-33-159-79-372-101-474-22-102-69-322-104-490-109-521-163-769-200-930-64-277-96-443-102-532l-6-87 31-31c25-24 37-30 54-25 57 17 111 103 163 258 87 260 535 2103 535 2200 0 47 25 10 90-136 165-368 249-517 338-598 98-89 99-90 471-60 130 10 266 18 302 18 111-1 141 20 267 188 116 154 182 261 264 425 63 126 57 114 63 108 3-3 23-120 45-259 56-366 85-537 170-989 16-91 46-259 66-375 58-349 87-447 208-705l81-174 6 54c4 30 17 118 30 195 18 109 22 178 22 310-1 211-12 288-148 1010-19 99-55 299-80 445-82 469-122 639-192 815-46 115-76 159-121 181-45 21-79 11-107-33-11-18-32-37-47-44-42-17-103-90-141-166-74-146-230-503-264-603-20-58-39-108-42-112-4-4-35-3-70 3-94 17-284-2-456-45-76-20-140-34-140-33-23 36-163 316-239 477-116 247-204 415-251 481-18 25-35 55-39 65-3 11-22 35-41 54-47 45-123 54-174 18z";
const EYES = [
	"M2306 2070c-39-12-73-46-101-101-50-98-41-173 29-243 53-53 95-63 170-42 145 43 191 228 83 334-56 54-116 71-181 52z",
	"M1715 2035c-92-33-147-134-124-229 32-137 195-182 295-82 66 66 71 165 13 245-51 71-112 93-184 66z",
];
const FAVICON = "translate(0 420) scale(0.1 -0.1)";
// Squash the eyes toward their middle row.
const BLINK = "translate(0 230) scale(1 0.15) translate(0 -230)";

// Animation timing: mouths on twos at 24 fps, a new boil every third frame.
const MOUTH_MS = 83;
const BOIL_MS = 125;
const BLINK_MS = 120;

type Tap = { analyser: AnalyserNode; samples: Float32Array<ArrayBuffer>; spectrum: Float32Array<ArrayBuffer> };

export default function Cat(props: { voice?: AudioNode; class?: string }) {
	const id = createUniqueId();
	const [shape, setShape] = createSignal<Shape>("rest");
	const [blink, setBlink] = createSignal(false);
	const [boil, setBoil] = createSignal(false);
	let turbulence!: SVGFETurbulenceElement;
	let tap: Tap | undefined;

	// A side branch off the player's output: nothing downstream of the analyser, so playback is
	// untouched. It is never disconnected because it lives exactly as long as the node it hangs
	// off, which goes when the call's AudioContext closes.
	createEffect(() => {
		const voice = props.voice;
		if (!voice) return;
		const analyser = new AnalyserNode(voice.context, { fftSize: 1024 });
		voice.connect(analyser);
		const current = {
			analyser,
			samples: new Float32Array(analyser.fftSize),
			spectrum: new Float32Array(analyser.frequencyBinCount),
		};
		tap = current;
		onCleanup(() => {
			if (tap === current) tap = undefined;
		});
	});

	onMount(() => {
		// Reduced motion keeps the lip sync and blinks but drops the boil, which never stops.
		const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
		setBoil(!still);

		let open = 0;
		// The voice's brightness now and on average, in Hz, to tell its dark sounds from its bright.
		let bright = 0;
		let usual = 0;
		let last = performance.now();
		let mouthAt = 0;
		let boilAt = 0;
		let blinkAt = last + 2500;
		let frame = 0;

		const tick = (now: number) => {
			const dt = now - last;
			last = now;

			let target = 0;
			if (tap) {
				const { analyser, samples, spectrum } = tap;
				analyser.getFloatTimeDomainData(samples);
				target = level(samples);
				if (target > 0) {
					analyser.getFloatFrequencyData(spectrum);
					const hz = centroid(spectrum, analyser.context.sampleRate / analyser.fftSize);
					bright = bright ? ease(bright, hz, 0.3, dt) : hz;
					usual = usual ? ease(usual, hz, 0.02, dt) : hz;
				}
			}
			open = follow(open, target, dt);

			if (now - mouthAt >= MOUTH_MS) {
				mouthAt = now;
				setShape(pick(open, usual ? bright / usual : 1));
			}
			if (!still && now - boilAt >= BOIL_MS) {
				boilAt = now;
				turbulence.setAttribute("seed", String(Math.floor(Math.random() * 997)));
			}
			setBlink(now >= blinkAt);
			if (now >= blinkAt + BLINK_MS) blinkAt = now + 2000 + Math.random() * 4000;

			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		onCleanup(() => cancelAnimationFrame(frame));
	});

	return (
		<svg viewBox="0 0 420 420" class={props.class} role="img" aria-label="The MoQ cat">
			<defs>
				<filter id={`${id}-boil`} x="-5%" y="-5%" width="110%" height="110%">
					<feTurbulence ref={turbulence} type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="1" />
					<feDisplacementMap in="SourceGraphic" scale="5" />
				</filter>
			</defs>
			<rect width="420" height="420" rx="90" fill="#0f172a" />
			<g filter={boil() ? `url(#${id}-boil)` : undefined}>
				<path transform={FAVICON} d={M} fill="#fafafa" />
				<g transform={blink() ? BLINK : undefined}>
					<g transform={FAVICON} fill="#4cc315">
						<For each={EYES}>{(d) => <path d={d} />}</For>
					</g>
				</g>
				{/* All five stay loaded so a swap never waits on the network. */}
				<For each={SHAPES}>
					{(s) => (
						<image
							href={`/voice/mouth/${s}.svg`}
							x="108"
							y="265"
							width="200"
							height="120"
							visibility={shape() === s ? "visible" : "hidden"}
						/>
					)}
				</For>
			</g>
		</svg>
	);
}
