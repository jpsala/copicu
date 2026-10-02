/// <reference path="./copicu-action.d.ts" />

// Replace example_channel, explicitly bind this Action to the subscription,
// then allow its Windows clipboard output. Disable the built-in writer first.
export default defineAction({
  id: "examples.writeTransformedSharedReception",
  title: "Copy shared reception as uppercase",
  description: "Produce one guarded Windows clipboard output from immutable incoming text.",
  triggers: ["sharedReception"],
  input: { source: "none", selection: "none" },
  capabilities: ["shared:receive:example_channel", "clipboard:write"],
  async run() {
    const received = await copicu.sharedClipboard.received();
    await copicu.clipboard.writeText(received.text.toUpperCase());
  },
});
