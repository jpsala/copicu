export type AssistantContext = {
  activeItemId: string | null;
  selectedItemIds: string[];
  query: string;
  visibleItemIds: string[];
};

export type AssistantMessageRole = "user" | "assistant" | "tool";
export type AssistantMessageStatus = "running" | "completed" | "failed" | "denied";

export type AssistantMessage = {
  id: string;
  role: AssistantMessageRole;
  text: string;
  toolName?: string;
  arguments?: Record<string, unknown>;
  status?: AssistantMessageStatus;
  createdAt: number;
};

export type AssistantApproval = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type AssistantModel = {
  id: string;
  name: string;
  reasoningEfforts: string[];
};

export type AssistantModelDefault = {
  model: string;
  reasoningEffort: string | null;
};

export type AssistantExecutionMode = "confirm" | "yolo";

export type AssistantModelCatalog = {
  endpoint: string;
  models: AssistantModel[];
};

export type AssistantSnapshot = {
  messages: AssistantMessage[];
  running: boolean;
  context: AssistantContext;
  approval: AssistantApproval | null;
  error: string | null;
  configured: boolean;
  model: string;
  endpoint: string;
  reasoningEffort: string | null;
  defaultModel: AssistantModelDefault | null;
  executionMode: AssistantExecutionMode;
};

export type AssistantSendRequest = {
  text: string;
};

export const ASSISTANT_UPDATED_EVENT = "copicu://assistant/updated";
export const ASSISTANT_WINDOW_LABEL = "assistant";

export const EMPTY_ASSISTANT_CONTEXT: AssistantContext = {
  activeItemId: null,
  selectedItemIds: [],
  query: "",
  visibleItemIds: [],
};

export function formatAssistantContext(context: AssistantContext): string {
  const selected = context.selectedItemIds.length;
  const visible = context.visibleItemIds.length;
  const active = context.activeItemId ? `#${context.activeItemId}` : "none";
  return `${selected} selected · ${visible} loaded · active ${active}`;
}

