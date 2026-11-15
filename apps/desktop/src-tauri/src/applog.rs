//! The app's own log, `logs/app.log` beside the service's. An installed app
//! has no terminal: what it could not do (a notification, the badge, an
//! update check) and where it stopped, if it ever does, would otherwise be
//! lost. Like the service's log it never holds message content, passwords,
//! tokens or addresses, and it goes nowhere: Settings › Support puts it in
//! the diagnostics file the person exports.
//!
//! Lines are few, so the file is opened for each one and never held: erasing
//! Regards' data can remove it while the app runs.

use regards_core::build_info::{BUILD_ID, VERSION};
use regards_core::paths::DataDirs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

/// Past this the log becomes `app.log.1`, replacing the one before.
const MAX_BYTES: u64 = 1024 * 1024;

static FILE: OnceLock<PathBuf> = OnceLock::new();

/// At start, before anything can fail: where the log is, a first line, and
/// panics written to it as well as to the terminal.
pub(crate) fn start(dirs: Option<&DataDirs>) {
    let Some(dirs) = dirs else { return };
    let path = dirs.app_log();
    rotate(&path, MAX_BYTES);
    let _ = FILE.set(path);
    write(&format!(
        "started: {VERSION} ({BUILD_ID}) on {} {}",
        std::env::consts::OS,
        std::env::consts::ARCH
    ));
    let before = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |panic| {
        let message = panic
            .payload()
            .downcast_ref::<&str>()
            .map(|text| (*text).to_owned())
            .or_else(|| panic.payload().downcast_ref::<String>().cloned())
            .unwrap_or_default();
        let place = panic
            .location()
            .map(|at| format!("{}:{}", at.file(), at.line()))
            .unwrap_or_default();
        append(&format!("panic at {place}: {message}"));
        before(panic);
    }));
}

/// A line for the terminal (development) and for the log.
pub(crate) fn write(message: &str) {
    eprintln!("{message}");
    append(message);
}

fn append(message: &str) {
    if let Some(path) = FILE.get() {
        let secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|elapsed| elapsed.as_secs() as i64)
            .unwrap_or_default();
        append_to(path, secs, message);
    }
}

/// One line, `YYYY-MM-DD HH:MM:SS UTC  message`; what can't be written is dropped.
fn append_to(path: &Path, secs: i64, message: &str) {
    if let Some(folder) = path.parent() {
        let _ = std::fs::create_dir_all(folder);
    }
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(
            file,
            "{}:{:02} UTC  {}",
            crate::support::timestamp(secs),
            secs.rem_euclid(60),
            message.replace(['\r', '\n'], " ")
        );
    }
}

/// A log past `max` becomes the older one.
fn rotate(path: &Path, max: u64) {
    if std::fs::metadata(path).is_ok_and(|meta| meta.len() > max) {
        let _ = std::fs::rename(path, path.with_extension("log.1"));
    }
}

/// `app_log!("badge: {error}")`: as `eprintln!`, and kept in the app's log.
macro_rules! app_log {
    ($($arg:tt)*) => {
        $crate::applog::write(&format!($($arg)*))
    };
}
pub(crate) use app_log;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lines_are_dated_and_stay_on_one_line() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("logs").join("app.log");
        append_to(&path, 1_792_486_805, "badge: no\r\nicon");
        append_to(&path, 1_792_486_865, "second");
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            "2026-10-20 09:00:05 UTC  badge: no  icon\n2026-10-20 09:01:05 UTC  second\n"
        );
    }

    #[test]
    fn a_long_log_becomes_the_older_one() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("app.log");
        std::fs::write(&path, b"12345").unwrap();
        rotate(&path, 10);
        assert!(path.exists(), "short enough: kept");
        rotate(&path, 4);
        assert!(!path.exists());
        assert_eq!(std::fs::read(temp.path().join("app.log.1")).unwrap(), b"12345");
    }
}
