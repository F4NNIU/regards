import { invoke } from "@tauri-apps/api/core";
import type { Draft } from "./compose";
import { t, tn } from "./i18n";

/**
 * The assistant (ADR-0015 §5): with the person's own key, a conversation
 * summarised or a reply drafted, only when they ask. Off until a provider
 * is chosen in Settings. What a model writes is text to read and check: a
 * summary is shown, a reply lands in a draft and is never sent by itself.
 */

/** Anthropic's API, or any server with OpenAI's chat completions API. */
export type AssistantKind = "anthropic" | "openai_compatible";

/** Mirrors `AssistantSettings`. The key never comes back. */
export interface AssistantSettings {
  /** `null`: off (the default). */
  kind: AssistantKind | null;
  base_url: string | null;
  model: string | null;
  /** A key is kept in the system's credential store. */
  has_key: boolean;
}

/** Mirrors `AssistantSetSettingsParams`. */
export interface AssistantChoice {
  /** `null` turns the assistant off and forgets the key. */
  kind: AssistantKind | null;
  /**
   * Anthropic's own when omitted. For an OpenAI-compatible server, its base,
   * up to `/v1`: `https://…/v1`, or `http://localhost:11434/v1` on this
   * computer (`http://` is for this computer only).
   */
  base_url?: string;
  /** `claude-opus-5-5` for Anthropic when omitted; needed otherwise. */
  model?: string;
  /**
   * A new key. Omitted: the one kept stays, unless the server changed (a
   * key goes only where it was given for). A server on this computer may need none.
   */
  api_key?: string;
}

/** Mirrors `AssistantTask`. */
export type AssistantTask = { kind: "summary" } | { kind: "reply"; instructions: string };

/** Mirrors `AssistantPreview`: what would go, before it goes. */
export interface AssistantPreview {
  /** Messages of the conversation that would be sent: the latest. */
  messages: number;
  /** Characters of their text, together (without what they quote). */
  characters: number;
  /** Left out: they look like they carry a sign-in or verification code. */
  left_out: number;
  /** The host that would get them. */
  destination: string;
  model: string;
}

/** Mirrors `AssistantResult`. */
export interface AssistantResult {
  /** The summary, or the reply's text: written by a model, to check. */
  text: string;
  /** For a reply: the draft it was written into, to review and send (or not). */
  draft: Draft | null;
}

/** An app that serves models on this computer, at a port of its own. */
export type LocalModelApp = "ollama" | "lm_studio" | "llama_cpp";

/** Mirrors `LocalModelServer`: a model server found on this computer. */
export interface LocalModelServer {
  app: LocalModelApp;
  /** As `AssistantChoice.base_url` takes it: `http://localhost:11434/v1`. */
  base_url: string;
  /** The models it lists, in its order; none when it has none yet. */
  models: string[];
}

/** The apps' names, as they write them. */
export const LOCAL_APP_NAMES: Record<LocalModelApp, string> = {
  ollama: "Ollama",
  lm_studio: "LM Studio",
  llama_cpp: "llama.cpp",
};

/** Where each app answers unless told otherwise: what `localModelServers` looks at. */
export const LOCAL_APP_BASES: Record<LocalModelApp, string> = {
  ollama: "http://localhost:11434/v1",
  lm_studio: "http://localhost:1234/v1",
  llama_cpp: "http://localhost:8080/v1",
};

/** Why a check failed. `other`: `detail` says what. */
export type AssistantProblem = "unreachable" | "key" | "not_found" | "busy" | "other";

/** Mirrors `AssistantCheck`. */
export interface AssistantCheck {
  /** The host that was asked. */
  destination: string;
  model: string;
  /** `null`: the model answered. */
  problem: AssistantProblem | null;
  /** What went wrong, in the daemon's words (English). */
  detail: string | null;
}

export const assistantSettings = () => invoke<AssistantSettings>("assistant_settings");

export const setAssistantSettings = (settings: AssistantChoice) =>
  invoke<AssistantSettings>("set_assistant_settings", { settings });

/**
 * The model servers answering on this computer (Ollama, LM Studio and
 * llama.cpp, at their usual ports), each with its models. Only this
 * computer is asked; it takes a second or two at most.
 */
export const localModelServers = () => invoke<LocalModelServer[]>("assistant_local_servers");

/**
 * Asks the saved model for one word, with no mail in it. It rejects only
 * while the assistant is off; a server that does not answer is a `problem`.
 * Can take a while when a model on this computer has to load first.
 */
export const checkAssistant = () => invoke<AssistantCheck>("assistant_check");

/** What `runAssistant` would send for this message's conversation, and where. */
export const previewAssistant = (messageId: number, task: AssistantTask) =>
  invoke<AssistantPreview>("assistant_preview", { messageId, task });

/** Can take a while (up to two minutes): show that it is working. */
export const runAssistant = (messageId: number, task: AssistantTask, all = false) =>
  invoke<AssistantResult>("assistant_run", { messageId, task, all });

/**
 * What a failed check means, in a sentence. `local`: the server is one on
 * this computer, so "is it running?" is the likely answer.
 */
export function describeProblem(check: AssistantCheck, local: boolean): string {
  switch (check.problem) {
    case "unreachable":
      return local
        ? t("Nothing answers at {destination}. Is the model server running?", { destination: check.destination })
        : t("{destination} could not be reached.", { destination: check.destination });
    case "key":
      return t("The key was refused, or the server needs one.");
    case "not_found":
      return t("{destination} does not know the model {model}, or its address is not the one given.", {
        destination: check.destination,
        model: check.model,
      });
    case "busy":
      return t("The server is busy or over its limits. Try again in a moment.");
    default:
      return check.detail ?? t("The server gave an answer Regards cannot read.");
  }
}

/** "2 messages (1,234 characters) go to api.anthropic.com, for claude-opus-5-5. 1 with a code is left out." */
export function describePreview(preview: AssistantPreview): string {
  const sent = tn(
    preview.messages,
    "1 message ({characters}) goes to {destination}, for {model}.",
    "{count} messages ({characters}) go to {destination}, for {model}.",
    {
      characters: tn(preview.characters, "1 character", "{count} characters"),
      destination: preview.destination,
      model: preview.model,
    },
  );
  if (preview.left_out === 0) return sent;
  return `${sent} ${tn(preview.left_out, "1 message with a code is left out.", "{count} messages with a code are left out.")}`;
}
