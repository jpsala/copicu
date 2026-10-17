import type { AppSettings } from "../shared/settings";
import { UiSwitch } from "./controls";
import { AiModelSelect } from "./AiModelSelect";

export function ExportNamingSettings({ value, ai, onChange }: {
  value: AppSettings["export"];
  ai: AppSettings["ai"];
  onChange: (value: AppSettings["export"]) => void;
}) {
  return <div style={{ display: "grid", gap: 8 }}>
    <UiSwitch showLabel label="Generate export names with AI" checked={value.aiNames} onChange={(checked) => onChange({ ...value, aiNames: checked })} />
    <AiModelSelect label="Export naming model" value={value.namingModel} ai={ai} loadLabel="Load export models"
      onChange={(model) => onChange({ ...value, namingModel: model })} />
    {value.aiNames && !value.namingModel ? <p role="status">Choose an export naming model. Until then, exports use conventional names.</p> : null}
    <small>You can choose the model before enabling naming. Uses the existing AI provider/key, with a model separate from the assistant. Models load only on request. Each export asks permission to send up to 4,000 characters per text clip. Never include secrets, credentials or personal data; detection is not exhaustive. Images stay local. Failures use conventional names.</small>
  </div>;
}
