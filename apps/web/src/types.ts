export interface Profile {
  id: string;
  label: string;
  selfId: string;
  privateUserId: string;
  privateUserIds: string[];
  groupId: string;
  groupIds: string[];
}

export interface Config {
  profiles: Profile[];
  setupRequired: boolean;
  authRequired: boolean;
  authenticated: boolean;
}

export interface MessagePart {
  type: "text" | "image" | "file" | "face" | "mention" | "audio" | "video";
  text?: string;
  url?: string;
  alt?: string;
  name?: string;
  mime?: string;
  size?: number;
  duration?: number;
  userId?: string;
}

export interface Message {
  id: string;
  profile: string;
  conversation: "private" | "group";
  targetId: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  text: string;
  time: string;
  source?: string;
}

export interface Health {
  ok: boolean;
  onebot: boolean;
  onebots: Record<string, boolean>;
  service: string;
  version: string;
}
