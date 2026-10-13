/** The stable Pi custom-message identity for peer-to-peer agent traffic. */
export const AGENT_MESSAGE_CUSTOM_TYPE = "agent-message";

/**
 * The engine's sender voice: silent control notices and actionable terminal-error messages
 * (lifecycle-notice.ts). Structured per-part metadata distinguishes them on restore.
 */
export const SCHEDULER = "scheduler";

export interface RoutedAgentMessagePart {
	from: string;
	content: string;
	/** Active scheduler input, not a silent notice. Absent on legacy silent scheduler messages. */
	actionable?: boolean;
}

/**
 * Structured mailbox payload retained in Pi's `details` field.
 *
 * The model only receives the text projection because provider protocols have no peer-agent
 * role. Keeping provenance structured here makes the session and UI more accurate than that
 * provider-level map (The Map Is Not the Territory, Make Illegal States Unrepresentable).
 */
export interface RoutedAgentMessage {
	parts: RoutedAgentMessagePart[];
}

export interface CustomAgentMessage {
	customType: typeof AGENT_MESSAGE_CUSTOM_TYPE;
	content: string;
	display: true;
	details: RoutedAgentMessage;
}

export function createRoutedAgentMessage(from: string, content: string, actionable?: true): RoutedAgentMessage {
	return { parts: [{ from, content, ...(actionable ? { actionable } : {}) }] };
}

/** Preserve paused mailbox order while releasing it as one race-free turn. */
export function mergeRoutedAgentMessages(messages: RoutedAgentMessage[]): RoutedAgentMessage {
	return { parts: messages.flatMap((message) => message.parts) };
}

/**
 * Pi converts custom messages to provider `user` messages, so sender identity must remain in
 * content as well as structured details. See the official extension API:
 * https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/extensions.md#pisendmessagemessage-options
 */
export function toCustomAgentMessage(message: RoutedAgentMessage): CustomAgentMessage {
	return {
		customType: AGENT_MESSAGE_CUSTOM_TYPE,
		content: message.parts.map((part) => `[message from ${part.from}]: ${part.content}`).join("\n\n"),
		display: true,
		details: message,
	};
}

/** Is this persisted message entirely silent scheduler notices (including legacy unmarked parts)? */
export function isLifecycleNotice(customType: unknown, details: unknown): boolean {
	if (customType !== AGENT_MESSAGE_CUSTOM_TYPE) return false;
	return parseRoutedAgentMessage(details)?.parts.every((part) => part.from === SCHEDULER && !part.actionable) ?? false;
}

/** Parse persisted extension details at the display boundary instead of trusting unknown data. */
export function parseRoutedAgentMessage(value: unknown): RoutedAgentMessage | undefined {
	if (!value || typeof value !== "object" || !("parts" in value) || !Array.isArray(value.parts)) return undefined;
	const parts: RoutedAgentMessagePart[] = [];
	for (const part of value.parts) {
		if (
			!part ||
			typeof part !== "object" ||
			!("from" in part) ||
			typeof part.from !== "string" ||
			!("content" in part) ||
			typeof part.content !== "string" ||
			("actionable" in part && typeof part.actionable !== "boolean")
		) {
			return undefined;
		}
		parts.push({ from: part.from, content: part.content, ...("actionable" in part ? { actionable: part.actionable as boolean } : {}) });
	}
	return parts.length > 0 ? { parts } : undefined;
}

// The label names the sender(s) as "from <name>": senders include 'main' and the scheduler,
// which are not subagents, so the label states direction rather than a role.
export function formatAgentMessageDisplay(message: RoutedAgentMessage): { label: string; body: string } {
	const senders = [...new Set(message.parts.map((part) => part.from))];
	const label = `from ${senders.join(", ")}`;
	if (senders.length === 1) {
		return {
			label,
			body: message.parts.map((part) => part.content).join("\n\n"),
		};
	}
	return {
		label,
		body: message.parts.map((part) => `[${part.from}]\n${part.content}`).join("\n\n"),
	};
}
