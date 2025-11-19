import { onMount } from "solid-js";

export default function Support() {
	onMount(() => {
		import("@kixelated/hang/support/element");
	});

	return <hang-support prop:show="full" prop:details={true} />;
}
