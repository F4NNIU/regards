import { useEffect, useState } from "react";
import {
  type AssistantCheck,
  type AssistantSettings,
  type LocalModelServer,
  LOCAL_APP_BASES,
  LOCAL_APP_NAMES,
  assistantSettings,
  checkAssistant,
  describeProblem,
  localModelServers,
  setAssistantSettings,
} from "./assistant";
import { assistantChanged } from "./AssistantDialog";
import { Icon } from "./icons";
import { Option, Select } from "./SettingsControls";
import { t, tn } from "./i18n";
import { SecretInput } from "./Fields";

/**
 * What the person picks. "local" is a model server found on this computer:
 * it is kept as an OpenAI-compatible server at that app's usual address.
 */
type Provider = "off" | "local" | "anthropic" | "openai_compatible";

/** `localhost:11434` of `http://localhost:11434/v1`. */
const host = (baseUrl: string) => baseUrl.replace(/^https?:\/\//, "").split("/")[0];

/** Kept settings that "Model on this computer" would have made. */
const isLocal = (settings: AssistantSettings) =>
  settings.kind === "openai_compatible" && Object.values(LOCAL_APP_BASES).includes(settings.base_url ?? "");

const providerOf = (settings: AssistantSettings | null): Provider =>
  !settings?.kind ? "off" : isLocal(settings) ? "local" : settings.kind;

/**
 * Settings › Assistant: off until a provider is chosen. With a model on this
 * computer (found by itself, its models listed) or the person's own key, the
 * assistant summarises a conversation or drafts a reply, only when asked,
 * after showing what would go where. Saving asks the model for one word, so
 * a wrong address, model or key shows here and not at the first summary.
 */
export function AssistantPage() {
  const [saved, setSaved] = useState<AssistantSettings | null>(null);
  const [provider, setProvider] = useState<Provider>("off");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [key, setKey] = useState("");
  /** The model servers found on this computer; `null` until looked for. */
  const [servers, setServers] = useState<LocalModelServer[] | null>(null);
  const [looking, setLooking] = useState(false);
  /** The found server chosen, by its address. */
  const [server, setServer] = useState("");
  /** A server on this computer rarely wants a key: its field shows on request. */
  const [wantsKey, setWantsKey] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "testing">("idle");
  const [check, setCheck] = useState<AssistantCheck | null>(null);
  const [error, setError] = useState<string | null>(null);

  const show = (settings: AssistantSettings) => {
    const local = isLocal(settings);
    setSaved(settings);
    setProvider(providerOf(settings));
    setServer(local ? (settings.base_url ?? "") : "");
    setBaseUrl(settings.kind === "openai_compatible" && !local ? (settings.base_url ?? "") : "");
    setModel(settings.model ?? "");
    setKey("");
    setWantsKey(local && settings.has_key);
  };
  useEffect(() => {
    assistantSettings().then(show, (failure: unknown) => setError(String(failure)));
  }, []);

  const look = () => {
    setLooking(true);
    setError(null);
    localModelServers().then(
      (found) => {
        setServers(found);
        setLooking(false);
      },
      (failure: unknown) => {
        setServers([]);
        setLooking(false);
        setError(String(failure));
      },
    );
  };
  const local = provider === "local";
  // Looked for when the person asks for a model on this computer, not before.
  useEffect(() => {
    if (local) look();
  }, [local]);

  const found = servers?.find((one) => one.base_url === server) ?? servers?.[0] ?? null;
  const foundModel = found ? (found.models.includes(model) ? model : (found.models[0] ?? "")) : "";
  const anthropic = provider === "anthropic";
  const other = provider === "openai_compatible";
  const keptKey = saved?.has_key && providerOf(saved) === provider;
  const changed = local
    ? found !== null &&
      (providerOf(saved) !== "local" || saved?.base_url !== found.base_url || saved?.model !== foundModel || key.trim() !== "")
    : provider !== providerOf(saved) ||
      key.trim() !== "" ||
      model.trim() !== (saved?.model ?? "") ||
      (other && baseUrl.trim() !== (saved?.base_url ?? ""));
  const ready = local ? found !== null && foundModel !== "" : true;
  const busy = state !== "idle";

  const test = () => {
    setState("testing");
    setCheck(null);
    checkAssistant().then(
      (result) => {
        setCheck(result);
        setState("idle");
      },
      (failure: unknown) => {
        setState("idle");
        setError(String(failure));
      },
    );
  };

  const save = (choice: Provider) => {
    setState("saving");
    setError(null);
    setCheck(null);
    const secret = key.trim() ? { api_key: key.trim() } : {};
    setAssistantSettings(
      choice === "off"
        ? { kind: null }
        : choice === "local"
          ? { kind: "openai_compatible", base_url: found?.base_url ?? "", model: foundModel, ...secret }
          : {
              kind: choice,
              ...(choice === "openai_compatible" ? { base_url: baseUrl.trim() } : {}),
              ...(model.trim() ? { model: model.trim() } : {}),
              ...secret,
            },
    ).then(
      (settings) => {
        show(settings);
        assistantChanged();
        if (settings.kind) test();
        else setState("idle");
      },
      (failure: unknown) => {
        setState("idle");
        setError(String(failure));
      },
    );
  };

  const keyField = (
    <label>
      {anthropic ? t("API key") : t("API key (if the server needs one)")}
      <SecretInput
        what="key"
        autoComplete="off"
        value={key}
        placeholder={keptKey ? t("Kept in this computer's credential store; type to replace it") : anthropic ? "sk-ant-…" : ""}
        onChange={setKey}
      />
      <span className="muted small">
        {anthropic
          ? t("From the Anthropic Console. Kept in this computer's credential store, and sent only to that server.")
          : t("Kept in this computer's credential store, and sent only to that server.")}
      </span>
    </label>
  );

  return (
    <>
      <h3>{t("Assistant")}</h3>
      <p className="muted settings-note">
        {t("With your own AI key, or a model on this computer, the assistant summarises a conversation or drafts a reply. Only when you ask, and only after showing what would be sent and where. A reply lands in a draft for you to check; nothing is sent by itself. Mail that looks like it carries a sign-in code is left out.")}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Option icon="bolt" label={t("Provider")} description={t("Off until you choose one. Turning it off forgets the key.")}>
        <Select
          label={t("Provider")}
          value={provider}
          options={[
            { id: "off", label: t("Off") },
            { id: "local", label: t("Model on this computer") },
            { id: "anthropic", label: t("Anthropic") },
            { id: "openai_compatible", label: t("Another server") },
          ]}
          onChange={(next) => {
            setProvider(next);
            setState("idle");
            setError(null);
            setCheck(null);
            if (next !== providerOf(saved)) {
              setModel("");
              setKey("");
              setWantsKey(false);
            }
            if (next === "off" && saved?.kind) save("off");
          }}
        />
      </Option>
      {provider !== "off" && (
        <div className="assistant-fields">
          {local && (looking || servers === null) && (
            <p className="muted small" role="status">
              {t("Looking for a model server on this computer…")}
            </p>
          )}
          {local && !looking && servers !== null && !found && (
            <div className="assistant-missing" role="status">
              <Icon name="alert" size={17} />
              <div>
                <strong>{t("No model server is answering on this computer")}</strong>
                <span>
                  {t("Looked for Ollama (port 11434), LM Studio (1234) and llama.cpp (8080). Start one of them, then look again.")}
                </span>
                <div className="assistant-missing-actions">
                  <button type="button" className="btn small" onClick={look}>
                    {t("Look again")}
                  </button>
                  <button
                    type="button"
                    className="btn small ghost"
                    onClick={() => {
                      setProvider("openai_compatible");
                      setBaseUrl((address) => address || LOCAL_APP_BASES.ollama);
                    }}
                  >
                    {t("Enter the address myself")}
                  </button>
                </div>
                <span className="muted">{t("The search only asks this computer. Nothing goes to the network.")}</span>
              </div>
            </div>
          )}
          {local && !looking && found && (
            <>
              <div className="assistant-found" role="status">
                <Icon name="check" size={17} />
                <span>
                  <strong>{t("{app} is running on this computer", { app: LOCAL_APP_NAMES[found.app] })}</strong>
                  <span className="muted small">{host(found.base_url)}</span>
                </span>
                <button type="button" className="link" onClick={look}>
                  {t("Look again")}
                </button>
              </div>
              {servers !== null && servers.length > 1 && (
                <label>
                  {t("Server")}
                  <Select
                    label={t("Server")}
                    value={found.base_url}
                    options={servers.map((one) => ({
                      id: one.base_url,
                      label: `${LOCAL_APP_NAMES[one.app]} · ${host(one.base_url)}`,
                    }))}
                    onChange={(next) => {
                      setServer(next);
                      setCheck(null);
                    }}
                  />
                </label>
              )}
              {found.models.length > 0 ? (
                <label>
                  {t("Model")}
                  <Select
                    label={t("Model")}
                    value={foundModel}
                    options={found.models.map((name) => ({ id: name, label: name }))}
                    onChange={(next) => {
                      setModel(next);
                      setCheck(null);
                    }}
                  />
                  <span className="muted small">
                    {tn(found.models.length, "1 model installed in {app}.", "{count} models installed in {app}.", {
                      app: LOCAL_APP_NAMES[found.app],
                    })}
                  </span>
                </label>
              ) : (
                <p className="muted small">
                  {t("{app} has no model yet. Add one there, then look again.", { app: LOCAL_APP_NAMES[found.app] })}
                </p>
              )}
              {wantsKey ? (
                keyField
              ) : (
                <button type="button" className="link assistant-key-toggle" onClick={() => setWantsKey(true)}>
                  <Icon name="chevronRight" size={13} />
                  {t("The server needs a key")}
                </button>
              )}
            </>
          )}
          {other && (
            <label>
              {t("Server address")}
              <input
                className="input"
                value={baseUrl}
                placeholder="https://…/v1"
                onChange={(event) => setBaseUrl(event.target.value)}
              />
              <span className="muted small">
                {t("Any server with OpenAI's chat API. Up to /v1. http:// only for a server on this computer.")}
              </span>
            </label>
          )}
          {!local && (
            <label>
              {t("Model")}
              <input
                className="input"
                value={model}
                placeholder={anthropic ? "claude-opus-5-5" : ""}
                onChange={(event) => setModel(event.target.value)}
              />
              {anthropic && <span className="muted small">{t("Empty: claude-opus-5-5.")}</span>}
            </label>
          )}
          {!local && keyField}
          {(!local || found) && (
            <div className="assistant-save">
              <button type="button" className="btn primary" onClick={() => save(provider)} disabled={!changed || !ready || busy}>
                {state === "saving" ? t("Saving…") : t("Save and test")}
              </button>
              {!changed && saved?.kind && (
                <button type="button" className="btn" onClick={test} disabled={busy}>
                  {t("Test again")}
                </button>
              )}
              <span className="small assistant-result" aria-live="polite">
                {state === "testing" && (
                  <span className="muted">{t("Saved. Asking {model} for a word…", { model: saved?.model ?? "" })}</span>
                )}
                {state === "idle" && check && !check.problem && (
                  <span className="assistant-ok">
                    <Icon name="check" size={15} />
                    {t("Connected: {model} answered.", { model: check.model })}
                  </span>
                )}
                {state === "idle" && check?.problem && (
                  <span className="error">
                    {t("Saved, but the test failed.")} {describeProblem(check, providerOf(saved) === "local")}
                  </span>
                )}
              </span>
            </div>
          )}
          {state === "idle" && check && !check.problem && (
            <p className="muted small">
              {local ? `${t("Your mail stays on this computer: requests go to localhost only.")} ` : ""}
              {t("Summarise and Draft reply are in each message's More menu.")}
            </p>
          )}
        </div>
      )}
    </>
  );
}
