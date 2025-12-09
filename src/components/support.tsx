import { onMount } from "solid-js";

export default function Support() {
	onMount(() => {
		import("@moq/hang/support/element");
	});

	return <hang-support prop:show="full" prop:details={true} />;
}
