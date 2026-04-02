export type UserRole = "owner" | "editor" | "commenter" | "viewer";

export type AIFeature = "rewrite" | "summarize" | "translate" | "restructure";

export type DocumentRecord = {
  id: number;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export type DocumentVersion = {
  id: number;
  document_id: number;
  label: string | null;
  content: string;
  created_at: string;
};

export type AIInteraction = {
  id: number;
  document_id: number | null;
  feature: AIFeature;
  prompt_excerpt: string;
  response_text: string;
  model_name: string;
  status: string;
  created_at: string;
};

export type AIInvokeResponse = {
  feature: AIFeature;
  output_text: string;
  model_name: string;
  provider: string;
  status: string;
  mocked?: boolean;
};

export type HealthResponse = {
  status: string;
  app_name: string;
};

export const roleOptions: Array<{
  value: UserRole;
  label: string;
  description: string;
}> = [
  {
    value: "owner",
    label: "Owner",
    description: "Can edit the document, save changes, and use AI suggestions.",
  },
  {
    value: "editor",
    label: "Editor",
    description: "Can update document text and invoke AI suggestions.",
  },
  {
    value: "commenter",
    label: "Commenter",
    description: "Read-only in this proof of concept, with visibility into connection status and AI output.",
  },
  {
    value: "viewer",
    label: "Viewer",
    description: "Read-only mode for walkthroughs and evaluation.",
  },
];

export function canEdit(role: UserRole) {
  return role === "owner" || role === "editor";
}

export function canUseAi(role: UserRole) {
  return role === "owner" || role === "editor";
}

export function canCreateVersions(role: UserRole) {
  return role === "owner";
}
