export type UserRole = "owner" | "editor" | "viewer";

export type AIFeature = "rewrite" | "summarize" | "translate" | "restructure";

export type AIInteractionStatus =
  | "streaming"
  | "completed"
  | "accepted"
  | "rejected"
  | "edited_applied"
  | "partially_applied"
  | "cancelled"
  | "failed";

export type AuthStatus = "loading" | "authenticated" | "guest";

export type AuthUser = {
  id: number;
  name: string;
  email: string;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
  refreshExpiresAt: number;
};

export type AuthSession = {
  user: AuthUser;
  tokens: AuthTokens;
  source: "backend";
};

export type AuthFormPayload = {
  name?: string;
  email: string;
  password: string;
};

export type DocumentRecord = {
  id: number;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export type DocumentShare = {
  user_id: number;
  name: string;
  email: string;
  role: Exclude<UserRole, "owner">;
};

export type AccessibleDocument = {
  document: DocumentRecord;
};

export type DocumentPermission = {
  id: number;
  document_id: number;
  user_id: number;
  role: UserRole;
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
  user_id?: number | null;
  feature: AIFeature;
  prompt_excerpt: string;
  response_text: string;
  model_name: string;
  status: AIInteractionStatus;
  created_at: string;
};

export type AIInvokeResponse = {
  feature: AIFeature;
  output_text: string;
  model_name: string;
  provider: string;
  status: AIInteractionStatus;
  mocked?: boolean;
  interaction_id?: number | null;
};

export type AIStreamStartEvent = {
  interaction_id: number;
  feature: AIFeature;
  provider: string;
  model_name: string;
};

export type AIStreamChunkEvent = {
  interaction_id: number;
  delta: string;
  text: string;
};

export type AIStreamDoneEvent = {
  interaction_id: number;
  feature: AIFeature;
  output_text: string;
  provider: string;
  model_name: string;
};

export type AIStreamErrorEvent = {
  interaction_id: number;
  message: string;
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

export function canManageSharing(role: UserRole) {
  return role === "owner";
}

export function canRestoreVersions(role: UserRole) {
  return role === "owner";
}

export function canDeleteDocument(role: UserRole) {
  return role === "owner";
}
