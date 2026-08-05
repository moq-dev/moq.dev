/**
 * moq.pub — serves the Vite build, and redirects a bare `/` to a freshly
 * invented broadcast so the publisher lands on a shareable URL.
 */
import { handler } from "../../lib/worker";

export default handler({ invent: true, project: "anon" });
