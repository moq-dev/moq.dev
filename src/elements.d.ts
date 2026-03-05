// Provides TypeScript support for any web components that add themselves to HTMLElementTagNameMap.
// See: https://github.com/solidjs/solid/issues/616#issuecomment-1144074821
declare module "solid-js" {
	namespace JSX {
		type ElementProps<T> = {
			[K in keyof T]: Props<T[K]> & HTMLAttributes<T[K]>;
		};
		// Prefixes all properties with `prop:` to match Solid's property setting syntax
		type Props<T> = {
			[K in keyof T as `prop:${string & K}`]?: T[K];
		};
		interface IntrinsicElements extends ElementProps<HTMLElementTagNameMap> {}
	}
}

export {};
