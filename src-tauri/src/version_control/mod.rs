use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

use crate::directory::{project_dir, safe_path};

// Every project keeps its history in <project>/.versions:
//   objects/<sha256>       file contents, stored once per unique content
//   history/<doc>.json     the versions of one document
// A document can have named variants (e.g. SWE, AI, Systems): each keeps its
// own head and history, and the file on disk holds whichever one is current.
// Dot folders are hidden from list_documents and rejected by safe_path, so
// the store can't be seen or touched through the normal document commands.

const MAIN_VARIANT: &str = "Main";

fn main_variant() -> String {
    MAIN_VARIANT.to_string()
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Version {
    id: u32,
    parent: Option<u32>, // the version this one was made from
    hash: String,
    time: u64, // unix millis
    message: String,
    #[serde(default = "main_variant")]
    variant: String,
}

#[derive(Serialize, Deserialize)]
pub struct History {
    // The variant the file on disk belongs to.
    #[serde(default = "main_variant")]
    variant: String,
    // Each variant's head: the version its contents were last saved or restored as.
    #[serde(default)]
    heads: BTreeMap<String, u32>,
    versions: Vec<Version>,
    // Histories from before variants kept a single head; it becomes Main's.
    #[serde(default, skip_serializing)]
    head: Option<u32>,
}

impl Default for History {
    fn default() -> Self {
        History { variant: main_variant(), heads: BTreeMap::new(), versions: Vec::new(), head: None }
    }
}

impl History {
    fn head(&self) -> Option<u32> {
        self.heads.get(&self.variant).copied()
    }

    fn set_head(&mut self, id: u32) {
        self.heads.insert(self.variant.clone(), id);
    }

    fn version(&self, id: u32) -> Result<&Version, String> {
        self.versions.iter().find(|v| v.id == id).ok_or_else(|| "version not found".into())
    }
}

fn versions_dir(project: &Path) -> PathBuf {
    project.join(".versions")
}

fn history_path(project: &Path, doc: &str) -> PathBuf {
    versions_dir(project).join("history").join(format!("{doc}.json"))
}

fn object_path(project: &Path, hash: &str) -> PathBuf {
    versions_dir(project).join("objects").join(hash)
}

// Writes through a temp file so a crash can't leave a half-written file behind.
fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // Dot-prefixed so it stays hidden from the file browser while it exists.
    let name = path.file_name().ok_or("invalid path")?.to_string_lossy();
    let tmp = path.with_file_name(format!(".{name}.tmp"));
    fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

fn load_history(project: &Path, doc: &str) -> Result<History, String> {
    match fs::read(history_path(project, doc)) {
        Ok(bytes) => {
            let mut history: History = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
            if let Some(head) = history.head.take() {
                history.heads.entry(main_variant()).or_insert(head);
            }
            Ok(history)
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(History::default()),
        Err(e) => Err(e.to_string()),
    }
}

fn save_history(project: &Path, doc: &str, history: &History) -> Result<(), String> {
    let json = serde_json::to_vec_pretty(history).map_err(|e| e.to_string())?;
    write_atomic(&history_path(project, doc), &json)
}

// Stores the contents under their hash and returns it; identical contents are stored once.
fn store_object(project: &Path, bytes: &[u8]) -> Result<String, String> {
    let hash = hex::encode(Sha256::digest(bytes));
    let path = object_path(project, &hash);
    if !path.exists() {
        write_atomic(&path, bytes)?;
    }
    Ok(hash)
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// Snapshots the document as it is on disk into the current variant. If it
// hasn't changed since the head version, no duplicate is recorded: the head is
// returned, taking the message as its name if it's this variant's and unnamed.
fn save(project: &Path, file: &Path, doc: &str, message: &str) -> Result<Version, String> {
    let bytes = fs::read(file).map_err(|e| e.to_string())?;
    let hash = store_object(project, &bytes)?;
    let mut history = load_history(project, doc)?;

    let head_id = history.head();
    let variant = history.variant.clone();
    if let Some(head) = history.versions.iter_mut().find(|v| Some(v.id) == head_id) {
        if head.hash == hash {
            // A new variant starts on a version of the one it came from; naming
            // that gives the new variant a version of its own rather than renaming it.
            let own = head.variant == variant;
            if own && head.message.is_empty() && !message.is_empty() {
                head.message = message.to_string();
                let head = head.clone();
                save_history(project, doc, &history)?;
                return Ok(head);
            }
            if own || message.is_empty() {
                return Ok(head.clone());
            }
        }
    }

    let version = Version {
        id: history.versions.iter().map(|v| v.id).max().unwrap_or(0) + 1,
        parent: head_id,
        hash,
        time: now_millis(),
        message: message.to_string(),
        variant,
    };
    history.versions.push(version.clone());
    history.set_head(version.id);
    save_history(project, doc, &history)?;
    Ok(version)
}

fn read(project: &Path, doc: &str, id: u32) -> Result<Vec<u8>, String> {
    let history = load_history(project, doc)?;
    fs::read(object_path(project, &history.version(id)?.hash)).map_err(|e| e.to_string())
}

fn valid_variant_name(name: &str) -> bool {
    !name.is_empty() && name.chars().count() <= 40 && !name.chars().any(char::is_control)
}

// Starts a new variant from the document as it is now and makes it current.
// The file on disk doesn't change; later saves go to the new variant.
fn create_variant(project: &Path, file: &Path, doc: &str, name: &str) -> Result<(), String> {
    let name = name.trim();
    if !valid_variant_name(name) {
        return Err("invalid variant name".into());
    }
    if load_history(project, doc)?.heads.keys().any(|k| k.eq_ignore_ascii_case(name)) {
        return Err("variant exists".into());
    }
    let from = save(project, file, doc, "")?;

    let mut history = load_history(project, doc)?;
    history.variant = name.to_string();
    history.set_head(from.id);
    save_history(project, doc, &history)
}

// Saves the current variant, then puts another variant's head on disk.
fn switch_variant(project: &Path, file: &Path, doc: &str, name: &str) -> Result<(), String> {
    let target = *load_history(project, doc)?.heads.get(name).ok_or("variant not found")?;
    if file.exists() {
        save(project, file, doc, "")?;
    }
    write_atomic(file, &read(project, doc, target)?)?;

    let mut history = load_history(project, doc)?;
    history.variant = name.to_string();
    save_history(project, doc, &history)
}

// Puts an old version back on disk. The current contents are snapshotted
// first so nothing is lost, and saves after this branch off the restored version.
fn restore(project: &Path, file: &Path, doc: &str, id: u32) -> Result<(), String> {
    let bytes = read(project, doc, id)?;
    if file.exists() {
        save(project, file, doc, "Before restore")?;
    }
    write_atomic(file, &bytes)?;

    let mut history = load_history(project, doc)?;
    history.set_head(id);
    save_history(project, doc, &history)
}

#[tauri::command]
pub fn save_version(app: AppHandle, project: String, name: String, message: Option<String>) -> Result<Version, String> {
    let file = safe_path(&app, &project, &name)?;
    save(&project_dir(&app, &project)?, &file, &name, message.as_deref().unwrap_or(""))
}

#[tauri::command]
pub fn list_versions(app: AppHandle, project: String, name: String) -> Result<History, String> {
    safe_path(&app, &project, &name)?;
    load_history(&project_dir(&app, &project)?, &name)
}

// Raw contents of one version; arrives in JS as an ArrayBuffer.
#[tauri::command]
pub fn read_version(app: AppHandle, project: String, name: String, id: u32) -> Result<tauri::ipc::Response, String> {
    safe_path(&app, &project, &name)?;
    let bytes = read(&project_dir(&app, &project)?, &name, id)?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub fn restore_version(app: AppHandle, project: String, name: String, id: u32) -> Result<(), String> {
    let file = safe_path(&app, &project, &name)?;
    restore(&project_dir(&app, &project)?, &file, &name, id)
}

#[tauri::command]
pub fn create_document_variant(app: AppHandle, project: String, name: String, variant: String) -> Result<(), String> {
    let file = safe_path(&app, &project, &name)?;
    create_variant(&project_dir(&app, &project)?, &file, &name, &variant)
}

#[tauri::command]
pub fn switch_document_variant(app: AppHandle, project: String, name: String, variant: String) -> Result<(), String> {
    let file = safe_path(&app, &project, &name)?;
    switch_variant(&project_dir(&app, &project)?, &file, &name, &variant)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn save_restore_and_branch() {
        let project = std::env::temp_dir().join(format!("resumation-versions-{}", std::process::id()));
        fs::create_dir_all(project.join("jobs")).unwrap();
        let doc = "jobs/Resume.txt";
        let file = project.join(doc);

        fs::write(&file, "v1").unwrap();
        let v1 = save(&project, &file, doc, "first").unwrap();
        assert_eq!((v1.id, v1.parent), (1, None));

        // Saving unchanged contents doesn't add a version, but can name an unnamed one.
        assert_eq!(save(&project, &file, doc, "again").unwrap(), v1);
        fs::write(&file, "v2").unwrap();
        let v2 = save(&project, &file, doc, "").unwrap();
        assert_eq!(save(&project, &file, doc, "named").unwrap().message, "named");
        assert_eq!(load_history(&project, doc).unwrap().versions.len(), 2);

        assert_eq!((v2.id, v2.parent), (2, Some(1)));

        // Restoring v1 puts its contents back and keeps the unsaved edit as a version.
        fs::write(&file, "unsaved").unwrap();
        restore(&project, &file, doc, 1).unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), "v1");
        let versions = load_history(&project, doc).unwrap().versions;
        assert_eq!(versions.len(), 3);
        assert_eq!(read(&project, doc, 3).unwrap(), b"unsaved");

        // The next save branches off v1.
        fs::write(&file, "tailored").unwrap();
        let v4 = save(&project, &file, doc, "for Stripe").unwrap();
        assert_eq!((v4.id, v4.parent), (4, Some(1)));

        assert!(read(&project, doc, 99).is_err());
        fs::remove_dir_all(&project).unwrap();
    }

    #[test]
    fn variants() {
        let project = std::env::temp_dir().join(format!("resumation-variants-{}", std::process::id()));
        fs::create_dir_all(&project).unwrap();
        let doc = "Resume.txt";
        let file = project.join(doc);

        fs::write(&file, "base").unwrap();
        let base = save(&project, &file, doc, "").unwrap();

        // A new variant starts from the current contents, unsaved edits included.
        fs::write(&file, "base + edit").unwrap();
        create_variant(&project, &file, doc, "SWE").unwrap();
        let history = load_history(&project, doc).unwrap();
        assert_eq!(history.variant, "SWE");
        let edit = history.version(history.head().unwrap()).unwrap().clone();
        assert_eq!((edit.variant.as_str(), edit.parent), (MAIN_VARIANT, Some(base.id)));
        assert_eq!(history.heads[MAIN_VARIANT], edit.id);

        // Naming the shared starting point gives SWE its own version instead.
        let named = save(&project, &file, doc, "SWE start").unwrap();
        assert_eq!((named.variant.as_str(), named.parent), ("SWE", Some(edit.id)));
        assert_eq!(load_history(&project, doc).unwrap().version(edit.id).unwrap().message, "");

        fs::write(&file, "swe").unwrap();
        let swe = save(&project, &file, doc, "").unwrap();
        assert_eq!(swe.variant, "SWE");

        // Switching saves pending edits to SWE and puts Main's contents back.
        fs::write(&file, "swe, unsaved").unwrap();
        switch_variant(&project, &file, doc, MAIN_VARIANT).unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), "base + edit");
        switch_variant(&project, &file, doc, "SWE").unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), "swe, unsaved");

        assert!(create_variant(&project, &file, doc, "swe").is_err());
        assert!(create_variant(&project, &file, doc, "  ").is_err());
        assert!(switch_variant(&project, &file, doc, "AI").is_err());
        fs::remove_dir_all(&project).unwrap();
    }

    #[test]
    fn single_head_histories_become_main() {
        let project = std::env::temp_dir().join(format!("resumation-legacy-{}", std::process::id()));
        fs::create_dir_all(project.join(".versions/history")).unwrap();
        fs::write(history_path(&project, "a.txt"), r#"{"head":2,"versions":[]}"#).unwrap();
        let loaded = load_history(&project, "a.txt").unwrap();
        assert_eq!((loaded.variant.as_str(), loaded.head()), (MAIN_VARIANT, Some(2)));
        fs::remove_dir_all(&project).unwrap();
    }
}
