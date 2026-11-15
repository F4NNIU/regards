//! "Remove everything from this computer" (Support): every credential
//! Regards kept goes at once. Then the daemon stops, leaving a marker, so its
//! files can go once nothing holds them: the app removes the data directory
//! as soon as the daemon has exited, and a daemon that starts and finds the
//! marker finishes the job before opening anything. `ui` only.
//!
//! The Windows uninstaller does the same with no daemon running
//! ([`without_daemon`], `regards erase`), when the person asks for their
//! data to go with the app.

use crate::accounts::{store_error, vault, vault_error};
use crate::{DaemonError, State};
use regards_core::paths::DataDirs;
use regards_ipc::protocol::{DaemonEraseParams, DaemonErased, RpcError, codes};
use regards_store::{Store, accounts};
use regards_vault::{SecretKey, Vault};
use serde_json::{Value, json};
use std::time::Duration;

/// `daemon.erase`: the credentials now; the files once the daemon has
/// stopped. The caller stops the daemon after replying.
pub(crate) async fn erase(state: &State, params: DaemonEraseParams) -> Result<Value, RpcError> {
    if params.confirm != DaemonEraseParams::CONFIRMATION {
        return Err(RpcError::new(
            codes::INVALID_PARAMS,
            format!(
                "to erase everything, confirm with \"{}\"",
                DaemonEraseParams::CONFIRMATION
            ),
        ));
    }
    let mut keys: Vec<SecretKey> = state
        .store
        .read(accounts::list)
        .await
        .map_err(store_error)?
        .into_iter()
        .map(|account| SecretKey::from_stored(account.secret_key))
        .collect();
    keys.push(crate::assistant::key());
    // Without a credential store, nothing was ever kept in one.
    if let Ok(vault) = vault(state).await {
        for key in &keys {
            // Nothing else goes if a password would stay behind.
            vault.delete(key).await.map_err(|error| {
                let mut refused = vault_error(error);
                refused.message = format!(
                    "the system credential store kept a password, so nothing was removed: {}",
                    refused.message
                );
                refused
            })?;
        }
    }
    std::fs::write(state.dirs.erase_marker(), b"").map_err(|error| {
        RpcError::new(
            codes::INTERNAL_ERROR,
            format!("could not mark the data for removal: {error}"),
        )
    })?;
    state.watchers.stop_all();
    state.backfills.stop_all();
    tracing::info!("everything is to be removed; stopping");
    Ok(json!(DaemonErased {
        credentials: u32::try_from(keys.len()).unwrap_or(u32::MAX),
    }))
}

/// At start, before anything is opened: when the last daemon was asked to
/// erase everything, remove what is left of it (all but the lock just
/// taken). The marker goes last, so a removal that fails is tried again.
pub(crate) fn finish(dirs: &DataDirs) {
    let marker = dirs.erase_marker();
    if !marker.exists() {
        return;
    }
    let left = dirs.remove_kept(&[dirs.lock_file(), marker.clone()]);
    if left == 0 {
        let _ = std::fs::remove_file(&marker);
        tracing::info!("everything Regards kept was removed");
    } else {
        tracing::warn!(left, "some of what Regards kept could not be removed yet");
    }
}

/// Everything Regards kept, removed with no daemon running: the credentials
/// first, then the files. Refused with [`DaemonError::AlreadyRunning`] while
/// a daemon owns `dirs`, and nothing goes if a password would stay behind.
/// The number of credentials removed. `vault` replaces the operating
/// system's credential store (tests).
pub async fn without_daemon(dirs: &DataDirs, vault: Option<Vault>) -> Result<u32, DaemonError> {
    if !dirs.data().exists() {
        return Ok(0);
    }
    let lock = crate::take_lock(dirs)?;
    let mut credentials = 0;
    // Without a database there is no account, so nothing in the credential store.
    if dirs.mail_db().exists() {
        let store = Store::open(dirs).await?;
        let mut keys: Vec<SecretKey> = store
            .read(accounts::list)
            .await?
            .into_iter()
            .map(|account| SecretKey::from_stored(account.secret_key))
            .collect();
        keys.push(crate::assistant::key());
        drop(store);
        let vault = match vault {
            Some(vault) => Ok(vault),
            None => tokio::task::spawn_blocking(Vault::native)
                .await
                .map_err(|error| DaemonError::Credentials(error.to_string()))?,
        };
        // Without a credential store, nothing was ever kept in one.
        if let Ok(vault) = vault {
            for key in &keys {
                vault
                    .delete(key)
                    .await
                    .map_err(|error| DaemonError::Credentials(error.to_string()))?;
            }
            credentials = u32::try_from(keys.len()).unwrap_or(u32::MAX);
        }
    }
    // A file the database just closed can be held for a moment more.
    let mut left = usize::MAX;
    for _ in 0..20 {
        left = dirs.remove_kept(&[dirs.lock_file()]);
        if left == 0 {
            break;
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    drop(lock);
    if left > 0 {
        return Err(DaemonError::DataDir {
            path: dirs.data().to_path_buf(),
            source: std::io::Error::other(format!("{left} of its files or folders could not be removed")),
        });
    }
    let _ = std::fs::remove_file(dirs.lock_file());
    // Gone too, unless the programs are installed in it.
    let _ = std::fs::remove_dir(dirs.data());
    Ok(credentials)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_next_start_removes_what_is_left_but_its_own_lock() {
        let temp = tempfile::tempdir().unwrap();
        let dirs = DataDirs::at(temp.path());
        let file = |name: &str| {
            let path = temp.path().join(name);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, b"x").unwrap();
        };
        for name in [
            "mail.db",
            "search.db",
            "desktop.json",
            "blobs/ab/cd",
            "logs/daemon.log",
            "daemon.lock",
            "regards.exe",
        ] {
            file(name);
        }
        finish(&dirs);
        assert!(temp.path().join("mail.db").exists(), "nothing goes without the marker");

        std::fs::write(dirs.erase_marker(), b"").unwrap();
        finish(&dirs);
        let mut left: Vec<String> = std::fs::read_dir(temp.path())
            .unwrap()
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect();
        left.sort();
        assert_eq!(
            left,
            ["daemon.lock", "regards.exe"],
            "its lock, and the installed program"
        );
    }
}
