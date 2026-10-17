import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AssistantModelCatalog } from "../shared/assistant";
import type { AppSettings } from "../shared/settings";
import { UiButton, UiSelect } from "./controls";

/** Catalog lookup is an explicit action and uses the current provider draft,
 * so enabling AI does not require saving/reopening Settings to choose a model. */
export function AiModelSelect({ label, value, ai, onChange, loadLabel = "Load models" }: {
  label: string;
  value: string;
  ai: AppSettings["ai"];
  onChange: (value: string) => void;
  loadLabel?: string;
}) {
  const [catalog, setCatalog] = useState<AssistantModelCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const sourceVersion = useRef(0);
  useEffect(() => { sourceVersion.current++; setCatalog(null); setError(""); }, [ai.endpoint, ai.apiKey]);
  const choices = (catalog?.models ?? []).map((model) => ({ value: model.id, label: `${model.name} (${model.id})` }));
  if (value && !choices.some((model) => model.value === value)) choices.unshift({ value, label: `${value} (configured)` });
  async function load() {
    setError("");
    if (!ai.enabled) { setError("Enable AI in AI settings first, then load models. No clips are sent when listing models."); return; }
    setLoading(true);
    const source = sourceVersion.current;
    try {
      const models = await invoke<AssistantModelCatalog>("clip_export_models", { ai });
      if (source === sourceVersion.current) setCatalog(models);
    }
    catch (error) { if (source === sourceVersion.current) setError(`Could not load models. Check the AI provider and API key. ${String(error)}`); }
    finally { setLoading(false); }
  }
  return <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
    <UiSelect label={label} aria-label={label} placeholder="Load models, then search by name" searchable clearable
      data={choices} value={value || null} nothingFoundMessage={catalog ? "No matching model" : "Load models to see available names"}
      onChange={(model) => onChange(model ?? "")} />
    <UiButton type="button" variant="default" size="compact-xs" disabled={loading} onClick={() => void load()}>
      {loading ? "Loading models…" : loadLabel}
    </UiButton>
    {catalog ? <small>{catalog.models.length} models loaded. Search by name above.</small> : null}
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}
