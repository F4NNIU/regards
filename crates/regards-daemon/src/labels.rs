//! Gmail labels (migration 37). Over IMAP, Gmail shows each label as a folder
//! that holds a copy of every message with that label. Adding a label copies
//! the message there; removing one deletes that copy, which Gmail takes as
//! the label removed (the mail stays in All Mail). Both apply here at once,
//! then reach the server through the operation queue (ADR-0010), and can be
//! undone for a while.

use crate::State;
use crate::actions::check_count;
use crate::compose::now_ms;
use regards_ipc::protocol::{
    LabelsResult, MessageIds, MessageLabels, RpcError, SetLabelsParams, SetLabelsResult, codes,
};
use regards_store::operations::{self, FlagName, NewOperation, OperationKind};
use regards_store::{StoreError, accounts, labels, mailboxes, messages};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;

/// What a Gmail server announces: its folders are labels.
const GMAIL: &str = "X-GM-EXT-1";

/// A label added or removed, as undo knows it: the message (its id), its
/// account, its Message-ID, the label's folder.
pub(crate) type LabelUndo = (i64, String, String, i64);

/// `message.labels`: each message's labels, as label folder ids.
pub(crate) async fn labels(state: &State, params: MessageIds) -> Result<Value, RpcError> {
    check_count(&params.ids)?;
    let ids = params.ids;
    let found = state
        .store
        .read(move |conn| labels::of(conn, &ids))
        .await
        .map_err(conflict)?;
    Ok(json!(LabelsResult {
        messages: listed(found)
    }))
}

/// Whether a server with these capabilities has labels.
fn has_labels(capabilities: &[String]) -> bool {
    capabilities.iter().any(|capability| capability == GMAIL)
}

/// An agent changes labels only where folders are labels (Gmail). Elsewhere
/// the copy in a folder may be the only one, and "removing the label" would
/// delete the mail for good.
pub(crate) async fn for_agents(state: &State, account_id: &str) -> Result<(), RpcError> {
    let id = account_id.to_owned();
    let labelled = state
        .store
        .read(move |conn| Ok(accounts::get(conn, &id)?.is_some_and(|account| has_labels(&account.imap_capabilities))))
        .await
        .map_err(crate::session::internal)?;
    if labelled {
        return Ok(());
    }
    Err(RpcError::new(
        codes::CONFLICT,
        "this account has no labels (only Gmail accounts do): move the message to a folder instead",
    ))
}

/// `message.set_labels`: the same labels added to, and removed from, each message.
pub(crate) async fn set(state: &Arc<State>, params: SetLabelsParams) -> Result<Value, RpcError> {
    check_count(&params.ids)?;
    if params.add.iter().any(|label| params.remove.contains(label)) {
        return Err(RpcError::new(
            codes::INVALID_PARAMS,
            "a label cannot be added and removed at once",
        ));
    }
    let now = now_ms();
    let committed = state
        .store
        .write(move |tx| {
            let changed = change(tx, &params.ids, &params.add, &params.remove, now)?;
            let undo = crate::actions::record_labels_undo(tx, &changed.added, &changed.removed, now)?;
            Ok((labels::of(tx, &params.ids)?, changed.gone, changed.accounts, undo))
        })
        .await
        .map_err(conflict)?;
    let (now_labelled, gone, accounts, undo) = committed.value;
    for account in accounts {
        state.queue.wake(state, &account);
    }
    Ok(json!(SetLabelsResult {
        messages: listed(now_labelled),
        gone,
        undo,
    }))
}

/// What [`change`] did.
#[derive(Default)]
struct Changed {
    /// Labels a message did not have, and now has.
    added: Vec<LabelUndo>,
    /// Labels a message had, and no longer has.
    removed: Vec<LabelUndo>,
    /// Copies deleted with a label removed.
    gone: Vec<i64>,
    /// The accounts with something to send to the server.
    accounts: BTreeSet<String>,
}

/// Add labels to, and remove labels from, each message: here at once, and
/// queued for the server.
fn change(
    tx: &rusqlite::Transaction<'_>,
    ids: &[i64],
    add: &[i64],
    remove: &[i64],
    now: i64,
) -> Result<Changed, StoreError> {
    let mut changed = Changed::default();
    let mut copies: BTreeMap<(i64, i64), BTreeSet<u32>> = BTreeMap::new();
    let mut deletes: BTreeMap<i64, BTreeSet<u32>> = BTreeMap::new();
    for id in ids {
        let message = messages::get(tx, *id)?
            .filter(|message| !message.flags.deleted)
            .ok_or_else(|| StoreError::Conflict(format!("no message {id}")))?;
        let folder = mailboxes::get(tx, message.mailbox_id)?
            .ok_or_else(|| StoreError::Conflict("the folder no longer exists".into()))?;
        let message_id = message
            .message_id
            .clone()
            .ok_or_else(|| StoreError::Conflict("This message has no Message-ID, so it cannot be labelled".into()))?;
        for label in add.iter().chain(remove) {
            let target = mailboxes::get(tx, *label)?.ok_or_else(|| StoreError::Conflict("no such label".into()))?;
            if target.account_id != folder.account_id || !labels::is_label_folder(tx, *label)? {
                return Err(StoreError::Conflict(format!(
                    "{} is not a label of this account",
                    target.name
                )));
            }
        }
        let has: BTreeSet<i64> = labels::of(tx, &[*id])?
            .into_iter()
            .flat_map(|(_, labels)| labels)
            .collect();
        let known = |label: i64| (*id, folder.account_id.clone(), message_id.clone(), label);
        for label in add {
            if has.contains(label) {
                continue;
            }
            labels::add_pending(tx, &folder.account_id, &message_id, *label, now)?;
            copies
                .entry((message.mailbox_id, *label))
                .or_default()
                .insert(message.uid);
            changed.added.push(known(*label));
            changed.accounts.insert(folder.account_id.clone());
        }
        for label in remove {
            let mut had = false;
            if labels::remove_pending(tx, &folder.account_id, &message_id, *label)? {
                // Added and removed before the server heard of it.
                operations::withdraw_copy(tx, message.mailbox_id, message.uid, *label)?;
                had = true;
            }
            for (copy, uid) in labels::copies_in(tx, *label, &message_id)? {
                deletes.entry(*label).or_default().insert(uid);
                changed.gone.push(copy);
                had = true;
            }
            if had {
                changed.removed.push(known(*label));
            }
            changed.accounts.insert(folder.account_id.clone());
        }
    }
    for ((source, target), uids) in copies {
        let uid_validity = synced(tx, source)?;
        operations::enqueue(
            tx,
            &NewOperation {
                mailbox_id: source,
                uid_validity,
                kind: OperationKind::Copy,
                uids: uids.into_iter().collect(),
                flags: vec![],
                target_mailbox_id: Some(target),
            },
            now,
        )?;
    }
    for (mailbox_id, uids) in deletes {
        let uid_validity = synced(tx, mailbox_id)?;
        let uids: Vec<u32> = uids.into_iter().collect();
        operations::apply_locally(tx, mailbox_id, &uids, &[FlagName::Deleted], true)?;
        operations::enqueue(
            tx,
            &NewOperation {
                mailbox_id,
                uid_validity,
                kind: OperationKind::Delete,
                uids,
                flags: vec![],
                target_mailbox_id: None,
            },
            now,
        )?;
    }
    Ok(changed)
}

/// Reverse a label change: remove the labels it added, add those it removed
/// again. What can no longer be reversed is skipped: a label deleted since,
/// a message no copy of which is left. A label the person changed back
/// themselves is left as they set it. Returns how many labels changed, and
/// the accounts with something to send.
pub(crate) fn undo(
    tx: &rusqlite::Transaction<'_>,
    added: &[LabelUndo],
    removed: &[LabelUndo],
    now: i64,
) -> Result<(usize, BTreeSet<String>), StoreError> {
    let mut undone = 0;
    let mut accounts = BTreeSet::new();
    for (id, account, message_id, label) in added {
        if !is_label_of(tx, *label, account)? {
            continue;
        }
        let Some(from) = copy_to_change(tx, *id, account, message_id, None)? else {
            continue;
        };
        let changed = change(tx, &[from], &[], &[*label], now)?;
        undone += changed.removed.len();
        accounts.extend(changed.accounts);
    }
    for (id, account, message_id, label) in removed {
        if !is_label_of(tx, *label, account)? {
            continue;
        }
        // The copy in the label's folder is the one that was deleted.
        let Some(from) = copy_to_change(tx, *id, account, message_id, Some(*label))? else {
            continue;
        };
        let changed = change(tx, &[from], &[*label], &[], now)?;
        undone += changed.added.len();
        accounts.extend(changed.accounts);
    }
    Ok((undone, accounts))
}

/// Whether `label` is still a label folder of `account`.
fn is_label_of(tx: &rusqlite::Transaction<'_>, label: i64, account: &str) -> Result<bool, StoreError> {
    Ok(
        mailboxes::get(tx, label)?.is_some_and(|folder| folder.account_id == account)
            && labels::is_label_folder(tx, label)?,
    )
}

/// The copy of a message to change labels on: the one the change was made
/// on while it is still there, or another the account has. With `not_in`
/// (a label to add again), not the copy in that label's folder, and only one
/// in a synced folder, since it is copied from there.
fn copy_to_change(
    tx: &rusqlite::Transaction<'_>,
    id: i64,
    account: &str,
    message_id: &str,
    not_in: Option<i64>,
) -> Result<Option<i64>, StoreError> {
    let usable = |message: &messages::Message| -> Result<bool, StoreError> {
        if message.flags.deleted || message.message_id.as_deref() != Some(message_id) {
            return Ok(false);
        }
        match not_in {
            None => Ok(true),
            Some(label) => Ok(message.mailbox_id != label
                && mailboxes::get(tx, message.mailbox_id)?.is_some_and(|folder| folder.uid_validity.is_some())),
        }
    };
    if let Some(message) = messages::get(tx, id)?
        && usable(&message)?
    {
        return Ok(Some(id));
    }
    for copy in messages::copies(tx, account, message_id)? {
        if usable(&copy)? {
            return Ok(Some(copy.id));
        }
    }
    Ok(None)
}

/// The folder's UIDVALIDITY: operations need it, so it must have been synced.
fn synced(tx: &rusqlite::Transaction<'_>, mailbox_id: i64) -> Result<u32, StoreError> {
    let folder =
        mailboxes::get(tx, mailbox_id)?.ok_or_else(|| StoreError::Conflict("the folder no longer exists".into()))?;
    folder
        .uid_validity
        .map(|validity| validity as u32)
        .ok_or_else(|| StoreError::Conflict(format!("{} has not been synced yet", folder.name)))
}

fn listed(found: Vec<(i64, Vec<i64>)>) -> Vec<MessageLabels> {
    found
        .into_iter()
        .map(|(id, labels)| MessageLabels { id, labels })
        .collect()
}

fn conflict(error: StoreError) -> RpcError {
    match error {
        StoreError::Conflict(message) => RpcError::new(codes::CONFLICT, message),
        other => crate::session::internal(other),
    }
}

#[cfg(test)]
mod tests {
    use super::has_labels;

    #[test]
    fn only_gmail_has_labels() {
        let server = |capabilities: &[&str]| -> Vec<String> { capabilities.iter().map(|c| (*c).to_owned()).collect() };
        assert!(has_labels(&server(&["IMAP4rev1", "X-GM-EXT-1", "MOVE"])));
        assert!(!has_labels(&server(&["IMAP4rev1", "MOVE", "UIDPLUS"])));
    }
}
