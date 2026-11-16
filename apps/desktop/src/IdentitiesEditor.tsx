import { type FormEvent, useCallback, useEffect, useId, useState } from "react";
import { type Identity, listIdentities, makeDefaultIdentity, removeIdentity, saveIdentity } from "./identities";
import { Icon } from "./icons";
import { t } from "./i18n";
import { emailProblem } from "./Fields";

/**
 * An account's addresses (plan §5.9): the names and addresses it sends as.
 * New messages go out from the default; a reply from the address it was
 * written to. Each address's signature is chosen in Settings › Composer ›
 * Signatures (ADR-0021).
 */
export function IdentitiesEditor({ accountId }: { accountId: string }) {
  const [identities, setIdentities] = useState<Identity[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    listIdentities(accountId).then(setIdentities, (failure: unknown) => setError(String(failure)));
  }, [accountId]);
  useEffect(reload, [reload]);

  if (identities === null) return error ? <p className="error small" role="alert">{error}</p> : null;
  return (
    <div className="account-form">
      {error && <p className="error small" role="alert">{error}</p>}
      {identities.map((identity) => (
        <IdentityForm key={identity.id} accountId={accountId} identity={identity} onDone={reload} onError={setError} />
      ))}
      {adding ? (
        <IdentityForm
          accountId={accountId}
          identity={null}
          onDone={() => {
            setAdding(false);
            reload();
          }}
          onCancel={() => setAdding(false)}
          onError={setError}
        />
      ) : (
        <div>
          <button type="button" className="btn small" onClick={() => setAdding(true)}>
            <Icon name="plus" size={15} />
            {t("Add an address")}
          </button>
        </div>
      )}
    </div>
  );
}

function IdentityForm({
  accountId,
  identity,
  onDone,
  onCancel,
  onError,
}: {
  accountId: string;
  /** None: a new address. */
  identity: Identity | null;
  onDone: () => void;
  onCancel?: () => void;
  onError: (error: string | null) => void;
}) {
  const [name, setName] = useState(identity?.name ?? "");
  const [email, setEmail] = useState(identity?.email ?? "");
  const [busy, setBusy] = useState(false);
  // What is wrong with the address is said once the field is left, not while typing.
  const [left, setLeft] = useState(false);
  const problem = emailProblem(email);
  const problemId = useId();
  const changed = identity === null || name !== identity.name || email !== identity.email;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    onError(null);
    try {
      await action();
      onDone();
    } catch (failure) {
      onError(String(failure));
    } finally {
      setBusy(false);
    }
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (problem) {
      setLeft(true);
      return;
    }
    // Its default signature stays as chosen in Settings › Composer › Signatures.
    void run(() =>
      saveIdentity({ id: identity?.id ?? null, account_id: accountId, name, email, signature_id: identity?.signature_id ?? null }),
    );
  };

  return (
    <form onSubmit={save} noValidate>
      <fieldset>
        <legend>
          {identity ? identity.email : t("A new address")}
          {identity?.is_default && t(" · default")}
        </legend>
        <div className="form-row grow">
          <label>
            {t("Name")}
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Ada Lovelace")} />
          </label>
          <label>
            {t("Address")}
            <input
              className="input"
              type="email"
              value={email}
              aria-invalid={left && problem !== null}
              aria-describedby={left && problem ? problemId : undefined}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setLeft(true)}
              placeholder="ada@example.org"
            />
            {left && problem && (
              <span id={problemId} className="field-error" role="alert">
                {problem}
              </span>
            )}
          </label>
        </div>
        <div className="dialog-actions">
          {onCancel && (
            <button type="button" className="btn small" onClick={onCancel} disabled={busy}>
              {t("Cancel")}
            </button>
          )}
          {identity && !identity.is_default && (
            <>
              <button type="button" className="btn small" onClick={() => void run(() => makeDefaultIdentity(identity.id))} disabled={busy}>
                {t("Make default")}
              </button>
              <button type="button" className="btn small danger" onClick={() => void run(() => removeIdentity(identity.id))} disabled={busy}>
                {t("Remove")}
              </button>
            </>
          )}
          <button type="submit" className="btn small primary" disabled={busy || !changed || email.trim() === ""}>
            {identity ? t("Save") : t("Add")}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
