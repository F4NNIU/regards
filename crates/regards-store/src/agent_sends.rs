//! What agents asked to send (migration 46), to notice the same message
//! asked twice: a replayed run, or an agent that lost track, writes the
//! same message again as a new draft. Only a fingerprint of the
//! recipients, subject and text is kept.

use crate::StoreError;
use crate::drafts::Draft;
use rusqlite::{Connection, OptionalExtension, Transaction, params};
use sha2::{Digest, Sha256};

/// The same message asked again within this long is a repeat.
pub const REPEAT_WITHIN_MS: i64 = 24 * 60 * 60 * 1000;
/// Requests are forgotten after this long.
const KEEP_MS: i64 = 7 * REPEAT_WITHIN_MS;

/// A request to send, as kept.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Asked {
    pub id: i64,
    pub fingerprint: String,
    /// Unix ms.
    pub asked_at: i64,
    /// The hold it waited as; `None` when it went after an undo window.
    pub hold_id: Option<i64>,
}

/// What makes two messages the same to the person who gets them: the
/// recipients, the subject and the text, whatever the draft. Kept to notice
/// an agent asking to send a message twice (a run replayed, say).
pub fn fingerprint(draft: &Draft) -> String {
    let mut people: Vec<String> = draft
        .to
        .iter()
        .chain(&draft.cc)
        .chain(&draft.bcc)
        .filter_map(|person| person.address.as_deref())
        .map(|address| address.trim().to_lowercase())
        .collect();
    people.sort();
    people.dedup();
    let words = |text: &str| text.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut hasher = Sha256::new();
    for part in [people.join(","), words(&draft.subject), words(&draft.body)] {
        hasher.update(part.len().to_le_bytes());
        hasher.update(part.as_bytes());
    }
    hasher.finalize().iter().map(|byte| format!("{byte:02x}")).collect()
}
/// Keep that an agent asked to send this message.
pub fn record(
    tx: &Transaction<'_>,
    account_id: &str,
    fingerprint: &str,
    now: i64,
    hold_id: Option<i64>,
) -> Result<(), StoreError> {
    tx.execute("DELETE FROM agent_sends WHERE asked_at < ?1", [now - KEEP_MS])?;
    tx.execute(
        "INSERT INTO agent_sends (account_id, fingerprint, asked_at, hold_id) VALUES (?1, ?2, ?3, ?4)",
        params![account_id, fingerprint, now, hold_id],
    )?;
    Ok(())
}

/// The request a hold waited as.
pub fn of_hold(conn: &Connection, hold_id: i64) -> Result<Option<Asked>, StoreError> {
    Ok(conn
        .query_row(
            "SELECT id, fingerprint, asked_at, hold_id FROM agent_sends WHERE hold_id = ?1",
            [hold_id],
            asked,
        )
        .optional()?)
}

/// The last time the same message was asked to be sent in the account, no
/// earlier than `since`; with `before`, only requests made before that one.
pub fn same_before(
    conn: &Connection,
    account_id: &str,
    fingerprint: &str,
    since: i64,
    before: Option<i64>,
) -> Result<Option<Asked>, StoreError> {
    Ok(conn
        .query_row(
            "SELECT id, fingerprint, asked_at, hold_id FROM agent_sends \
             WHERE account_id = ?1 AND fingerprint = ?2 AND asked_at >= ?3 AND id < ?4 \
             ORDER BY id DESC LIMIT 1",
            params![account_id, fingerprint, since, before.unwrap_or(i64::MAX)],
            asked,
        )
        .optional()?)
}

fn asked(row: &rusqlite::Row<'_>) -> rusqlite::Result<Asked> {
    Ok(Asked {
        id: row.get(0)?,
        fingerprint: row.get(1)?,
        asked_at: row.get(2)?,
        hold_id: row.get(3)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Store;
    use crate::accounts::{self, AuthKind, NewAccount, Security, Server};
    use regards_core::paths::DataDirs;

    #[tokio::test]
    async fn the_same_message_asked_again_is_found_within_a_day_and_per_account() {
        let temp = tempfile::tempdir().unwrap();
        let store = Store::open(&DataDirs::at(temp.path())).await.unwrap();
        store
            .write(|tx| {
                for id in ["work", "home"] {
                    let server = Server {
                        host: "mail.example.test".into(),
                        port: 993,
                        security: Security::Tls,
                    };
                    accounts::insert(
                        tx,
                        NewAccount {
                            id: id.into(),
                            display_name: "Ada".into(),
                            email: format!("ada@{id}.test"),
                            auth_kind: AuthKind::Password,
                            username: "ada".into(),
                            secret_key: "k".into(),
                            imap: server.clone(),
                            smtp: server,
                            imap_capabilities: vec![],
                        },
                    )?;
                }
                record(tx, "work", "aaa", 1_000, Some(7))?;
                record(tx, "work", "bbb", 2_000, None)?;
                record(tx, "work", "aaa", 3_000, Some(9))
            })
            .await
            .unwrap();
        let same = |account: &'static str, fingerprint: &'static str, since, before| {
            store.read(move |conn| same_before(conn, account, fingerprint, since, before))
        };
        // The latest; before the second request, the first.
        let latest = same("work", "aaa", 0, None).await.unwrap().unwrap();
        assert_eq!((latest.asked_at, latest.hold_id), (3_000, Some(9)));
        let second = store.read(|conn| of_hold(conn, 9)).await.unwrap().unwrap();
        let first = same("work", "aaa", 0, Some(second.id)).await.unwrap().unwrap();
        assert_eq!((first.asked_at, first.hold_id), (1_000, Some(7)));
        assert_eq!(
            same("work", "aaa", 0, Some(first.id)).await.unwrap(),
            None,
            "the first has none before"
        );
        // Not another message, not another account, not one too old.
        assert_eq!(same("work", "ccc", 0, None).await.unwrap(), None);
        assert_eq!(same("home", "aaa", 0, None).await.unwrap(), None);
        assert_eq!(same("work", "bbb", 2_001, None).await.unwrap(), None);

        // Old requests are forgotten when a new one is kept.
        store
            .write(|tx| record(tx, "home", "ddd", 3_000 + KEEP_MS, None))
            .await
            .unwrap();
        assert_eq!(
            same("work", "aaa", 0, None).await.unwrap().map(|a| a.asked_at),
            Some(3_000)
        );
        assert_eq!(same("work", "bbb", 0, None).await.unwrap(), None, "older than a week");
    }

    fn draft(to: &[&str], subject: &str, body: &str) -> Draft {
        Draft {
            id: 1,
            account_id: "work".into(),
            to: to
                .iter()
                .map(|address| regards_core::headers::Person {
                    name: None,
                    address: Some((*address).into()),
                })
                .collect(),
            cc: vec![],
            bcc: vec![],
            subject: subject.into(),
            body: body.into(),
            html: None,
            in_reply_to: None,
            references: vec![],
            replying_to: None,
            created_at: 0,
            updated_at: 0,
            sending: false,
            identity_id: None,
        }
    }

    #[test]
    fn the_same_message_in_another_draft_has_the_same_fingerprint() {
        let first = fingerprint(&draft(
            &["bob@example.test", "Ann@Example.test"],
            "Plans",
            "Hello Bob,\n\nSee you.",
        ));
        // Another draft: recipients in another order and case, spacing changed.
        let mut again = draft(
            &["ann@example.test", "BOB@example.test"],
            " Plans ",
            "Hello Bob,\r\n\r\nSee  you.\n",
        );
        again.id = 2;
        again.updated_at = 99;
        assert_eq!(fingerprint(&again), first);
        assert_eq!(first.len(), 64);
        // Another text, subject or recipient: another message.
        assert_ne!(
            fingerprint(&draft(
                &["bob@example.test", "ann@example.test"],
                "Plans",
                "Hello Bob, see you soon."
            )),
            first
        );
        assert_ne!(
            fingerprint(&draft(
                &["bob@example.test", "ann@example.test"],
                "Plan",
                "Hello Bob, See you."
            )),
            first
        );
        assert_ne!(
            fingerprint(&draft(&["bob@example.test"], "Plans", "Hello Bob, See you.")),
            first
        );
        // Where one part ends is part of it.
        assert_ne!(
            fingerprint(&draft(&["a@x.test"], "Plans now", "")),
            fingerprint(&draft(&["a@x.test"], "Plans", "now"))
        );
    }
}
