/// <reference path="./copicu-action.d.ts" />

// Replace example_channel here AND in the explicit capability with an enrolled channel ID.
// No shortcut is enabled by this example. The host owns encryption and retries.
export default defineAction({
  id: "examples.publishSelectedToSharedChannel",
  title: "Send selected text to shared channel",
  description: "Queue selected plain text clips on an explicitly authorized channel.",
  triggers: ["itemMenu", "commandPalette", "devRun"],
  input: { source: "pickerSelection", selection: "oneOrMore", kinds: ["text"] },
  capabilities: ["history:read-content", "shared:publish", "shared:publish:example_channel", "ui:toast"],
  async run() {
    let queued = 0;
    for (const id of await copicu.selection.ids()) {
      const item = await copicu.history.get(id, { content: true });
      const text = (item.text ?? "").replace(/\r\n/g, "\n");
      await copicu.sharedClipboard.publish({ channelId: "example_channel", text });
      queued += 1;
    }
    await copicu.ui.toast({ message: `Queued ${queued} clips for sharing`, tone: "success" });
  },
});
