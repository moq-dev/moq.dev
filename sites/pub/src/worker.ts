import { handler } from "../../lib/worker";

// The browser mints private broadcasts; the Worker only canonicalizes explicit links.
export default handler();
