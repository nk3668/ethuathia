use std::fs;
use std::io::ErrorKind;
use std::path::Path;
use tauri::Manager;

const SAVE_FILE_NAME: &str = "save.json";
const TEMP_SAVE_FILE_NAME: &str = "save.json.tmp";

/// Reads the save file from `dir`, returning `Ok(None)` when no save exists yet.
pub fn read_save_file(dir: &Path) -> Result<Option<String>, String> {
    match fs::read_to_string(dir.join(SAVE_FILE_NAME)) {
        Ok(contents) => Ok(Some(contents)),
        Err(err) if err.kind() == ErrorKind::NotFound => Ok(None),
        Err(err) => Err(format!("Failed to read save file: {err}")),
    }
}

/// Writes `data` to `dir/save.json` via a temporary file rename so partial writes do not corrupt
/// an existing save.
pub fn write_save_file(dir: &Path, data: &str) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|err| format!("Failed to create save directory: {err}"))?;
    let temp_path = dir.join(TEMP_SAVE_FILE_NAME);
    let save_path = dir.join(SAVE_FILE_NAME);
    fs::write(&temp_path, data).map_err(|err| format!("Failed to write temporary save file: {err}"))?;
    fs::rename(&temp_path, &save_path)
        .map_err(|err| format!("Failed to replace save file: {err}"))?;
    Ok(())
}

/// Removes `dir/save.json` if it exists; missing files are ignored.
pub fn clear_save_file(dir: &Path) -> Result<(), String> {
    match fs::remove_file(dir.join(SAVE_FILE_NAME)) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == ErrorKind::NotFound => Ok(()),
        Err(err) => Err(format!("Failed to clear save file: {err}")),
    }
}

#[tauri::command]
fn load_save(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Failed to resolve app data directory: {err}"))?;
    read_save_file(&dir)
}

#[tauri::command]
fn write_save(app: tauri::AppHandle, data: String) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Failed to resolve app data directory: {err}"))?;
    write_save_file(&dir, &data)
}

#[tauri::command]
fn clear_save(app: tauri::AppHandle) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Failed to resolve app data directory: {err}"))?;
    clear_save_file(&dir)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![load_save, write_save, clear_save])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{clear_save_file, read_save_file, write_save_file, SAVE_FILE_NAME, TEMP_SAVE_FILE_NAME};
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    struct TestDir(PathBuf);

    impl TestDir {
        fn new() -> Self {
            let id = COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "ethuathia-save-test-{}-{}",
                std::process::id(),
                id
            ));
            let _ = fs::remove_dir_all(&path);
            Self(path)
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn missing_save_returns_none() {
        let dir = TestDir::new();
        assert_eq!(read_save_file(&dir.0).unwrap(), None);
    }

    #[test]
    fn write_and_read_round_trip() {
        let dir = TestDir::new();
        write_save_file(&dir.0, "{\"version\":1}").unwrap();
        assert!(dir.0.join(SAVE_FILE_NAME).exists());
        assert!(!dir.0.join(TEMP_SAVE_FILE_NAME).exists());
        assert_eq!(
            read_save_file(&dir.0).unwrap(),
            Some("{\"version\":1}".to_string())
        );
    }

    #[test]
    fn write_overwrites_existing_save() {
        let dir = TestDir::new();
        write_save_file(&dir.0, "first").unwrap();
        write_save_file(&dir.0, "second").unwrap();
        assert_eq!(read_save_file(&dir.0).unwrap(), Some("second".to_string()));
    }

    #[test]
    fn clear_removes_save_and_is_idempotent() {
        let dir = TestDir::new();
        clear_save_file(&dir.0).unwrap();
        write_save_file(&dir.0, "payload").unwrap();
        clear_save_file(&dir.0).unwrap();
        assert_eq!(read_save_file(&dir.0).unwrap(), None);
        clear_save_file(&dir.0).unwrap();
    }
}
