import { partsToText, toOneBotMessage } from "./message.mjs";

/**
 * Build the exact OneBot v11 message event sent to AstrBot.
 * Keep this function pure so protocol contracts can be tested independently.
 */
export function buildOneBotMessageEvent({
  selfId,
  messageType,
  targetId,
  messageId,
  parts,
  privateUserId = selfId,
}) {
  const type = messageType === "group" ? "group" : "private";
  const message = toOneBotMessage(parts);
  if (!message.length) throw new Error("empty message");
  return {
    post_type: "message",
    message_type: type,
    self_id: Number(selfId),
    message_id: Number(messageId),
    time: Math.floor(Date.now() / 1000),
    message,
    raw_message: partsToText(parts),
    sender: {
      user_id: type === "private" ? Number(targetId) : Number(privateUserId || selfId),
      nickname: "Signal Window",
    },
    ...(type === "group" ? { group_id: Number(targetId) } : { user_id: Number(targetId) }),
  };
}
