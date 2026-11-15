//! Undo (ADR-0007): each undoable action stores its inverse, the intent
//! that reverses it, for a limited time.

use crate::StoreError;
use rusqlite::{Connection, OptionalExtension, Transaction, params};
use std::collections::{HashMap, HashSet};

/// Store an inverse; returns the id the client uses to undo.
pub fn record(
    tx: &Transaction<'_>,
    description: &str,
    inverse: &str,
    now: i64,
    expires_at: i64,
) -> Result<i64, StoreError> {
    // Old entries are of no use to anyone.
    tx.execute("DELETE FROM undo_log WHERE expires_at < ?1", [now])?;
    tx.execute(
        "INSERT INTO undo_log (created_at, expires_at, description, inverse) VALUES (?1, ?2, ?3, ?4)",
        params![now, expires_at, description, inverse],
    )?;
    Ok(tx.last_insert_rowid())
}

/// Which of `ids` can still be undone at `now`.
pub fn open(conn: &Connection, ids: &[i64], now: i64) -> Result<HashSet<i64>, StoreError> {
    let ids = serde_json::to_string(ids).expect("numbers always serialize");
    let mut statement = conn
        .prepare_cached("SELECT id FROM undo_log WHERE id IN (SELECT value FROM json_each(?1)) AND expires_at >= ?2")?;
    let rows = statement.query_map(params![ids, now], |row| row.get(0))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// When each of `ids` that can still be undone at `now` stops being so.
pub fn open_until(conn: &Connection, ids: &[i64], now: i64) -> Result<HashMap<i64, i64>, StoreError> {
    let ids = serde_json::to_string(ids).expect("numbers always serialize");
    let mut statement = conn.prepare_cached(
        "SELECT id, expires_at FROM undo_log WHERE id IN (SELECT value FROM json_each(?1)) AND expires_at >= ?2",
    )?;
    let rows = statement.query_map(params![ids, now], |row| Ok((row.get(0)?, row.get(1)?)))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Keep an inverse until `expires_at`, when that is later than it would
/// last: what an agent did can be undone for longer (ADR-0012).
pub fn keep_until(tx: &Transaction<'_>, id: i64, expires_at: i64) -> Result<(), StoreError> {
    tx.execute(
        "UPDATE undo_log SET expires_at = ?2 WHERE id = ?1 AND expires_at < ?2",
        params![id, expires_at],
    )?;
    Ok(())
}

/// Take an inverse to apply it. Each can be used once, and only before it expires.
pub fn take(tx: &Transaction<'_>, id: i64, now: i64) -> Result<Option<String>, StoreError> {
    let inverse: Option<String> = tx
        .query_row(
            "SELECT inverse FROM undo_log WHERE id = ?1 AND expires_at >= ?2",
            params![id, now],
            |row| row.get(0),
        )
        .optional()?;
    tx.execute("DELETE FROM undo_log WHERE id = ?1", [id])?;
    Ok(inverse)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Store;
    use regards_core::paths::DataDirs;

    #[tokio::test]
    async fn an_inverse_can_be_taken_once_and_only_before_it_expires() {
        let temp = tempfile::tempdir().unwrap();
        let store = Store::open(&DataDirs::at(temp.path())).await.unwrap();
        let id = store
            .write(|tx| record(tx, "Archived", "{}", 100, 200))
            .await
            .unwrap()
            .value;
        let open_at = |now| store.read(move |conn| open(conn, &[id, 999], now));
        assert_eq!(open_at(150).await.unwrap(), HashSet::from([id]));
        assert!(open_at(201).await.unwrap().is_empty(), "expired");
        assert_eq!(
            store.write(move |tx| take(tx, id, 150)).await.unwrap().value.as_deref(),
            Some("{}")
        );
        assert!(open_at(150).await.unwrap().is_empty(), "used");
        assert_eq!(
            store.write(move |tx| take(tx, id, 150)).await.unwrap().value,
            None,
            "only once"
        );

        let late = store
            .write(|tx| record(tx, "Archived", "{}", 100, 200))
            .await
            .unwrap()
            .value;
        assert_eq!(
            store.write(move |tx| take(tx, late, 201)).await.unwrap().value,
            None,
            "expired"
        );
    }

    #[tokio::test]
    async fn an_inverse_can_be_kept_longer_never_shorter() {
        let temp = tempfile::tempdir().unwrap();
        let store = Store::open(&DataDirs::at(temp.path())).await.unwrap();
        let id = store
            .write(|tx| record(tx, "Archived", "{}", 100, 200))
            .await
            .unwrap()
            .value;
        let until = |now| store.read(move |conn| open_until(conn, &[id], now));
        assert_eq!(until(150).await.unwrap(), HashMap::from([(id, 200)]));
        store.write(move |tx| keep_until(tx, id, 5_000)).await.unwrap();
        assert_eq!(until(4_000).await.unwrap(), HashMap::from([(id, 5_000)]));
        store.write(move |tx| keep_until(tx, id, 300)).await.unwrap();
        assert_eq!(
            until(4_000).await.unwrap(),
            HashMap::from([(id, 5_000)]),
            "not cut short"
        );
        assert!(until(5_001).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn an_id_is_never_given_twice() {
        // An agent's activity names the undo of each change: a later undo
        // must not take the id of one that was used or ran out.
        let temp = tempfile::tempdir().unwrap();
        let store = Store::open(&DataDirs::at(temp.path())).await.unwrap();
        let first = store
            .write(|tx| record(tx, "Archived", "{}", 100, 200))
            .await
            .unwrap()
            .value;
        store.write(move |tx| take(tx, first, 150)).await.unwrap();
        let second = store
            .write(|tx| record(tx, "Pinned", "{}", 160, 260))
            .await
            .unwrap()
            .value;
        assert!(second > first, "{second} after {first}");
        // Ran out, and cleared by the next one recorded.
        let third = store
            .write(|tx| record(tx, "Snoozed", "{}", 1_000, 1_100))
            .await
            .unwrap()
            .value;
        assert!(third > second, "{third} after {second}");
    }
}
