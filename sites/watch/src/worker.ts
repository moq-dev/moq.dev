/**
 * moq.watch — serves the Vite build. Unlike moq.pub it never invents a
 * broadcast: a bare `/` gets the usage hint instead.
 */
import { handler } from "../../lib/worker";

export default handler({ invent: false, project: "demo" });
