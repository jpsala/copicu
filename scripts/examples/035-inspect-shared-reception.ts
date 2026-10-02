/// <reference path="./copicu-action.d.ts" />

// Replace example_channel with the reception channel ID, then associate and enable
// this Action in that channel's subscription. Discovery does not enable reception.
export default defineAction({
  id: "examples.inspectSharedReception",
  title: "Inspect shared reception",
  description: "Show an incoming publication's length without mutating history or Windows clipboard.",
  triggers: ["sharedReception"],
  input: { source: "none", selection: "none" },
  capabilities: ["shared:receive:example_channel", "ui:toast"],
  async run(ctx) {
    if (!ctx.sharedReception) throw new Error("A shared reception invocation is required");
    const received = await copicu.sharedClipboard.received();
    await copicu.ui.toast({ message: `Received ${received.text.length} characters`, tone: "info" });
  },
});
