use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};

//will return our /Documents/ResumationData, if does not exist it creates.
fn docs_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .document_dir()
        .map_err(|e| e.to_string())?
        .join("ResumationData");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    Ok(dir)
}

fn safe_path(app: &AppHandle, relative: &str) -> Result<PathBuf, String> {
    let path = Path::new(relative);
    let is_safe = path.components().all(|c| match c {
        Component::Normal(name) => !name.to_string_lossy().starts_with('.'),
        _ => false,
    });
    if !is_safe {
        return Err("invalid path".into());
    }
    Ok(docs_dir(app)?.join(path))
}

#[derive(Serialize)]
pub struct Entry {
    name: String,
    path: String,
    is_dir: bool,
}

#[tauri::command]
pub fn list_documents(app: AppHandle, folder: Option<String>) -> Result<Vec<Entry>, String> {
    let dir = match &folder {
        Some(f) if !f.is_empty() => safe_path(&app, f)?,
        _ => docs_dir(&app)?,
    };

    let mut entries = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?; // shadowing: reuse the name for the unwrapped value
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let path = match &folder {
            Some(f) if !f.is_empty() => format!("{f}/{name}"),
            _ => name.clone(),
        };
        entries.push(Entry {
            name,
            path,
            is_dir: entry.path().is_dir(),
        });
    }

    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

#[tauri::command]
pub fn read_document(app: AppHandle, name: String) -> Result<String, String> {
    fs::read_to_string(safe_path(&app, &name)?).map_err(|e| e.to_string())
}

// Raw file contents for binary documents such as .docx; arrives in JS as an ArrayBuffer.
#[tauri::command]
pub fn read_document_bytes(app: AppHandle, name: String) -> Result<tauri::ipc::Response, String> {
    let bytes = fs::read(safe_path(&app, &name)?).map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub fn save_document(app: AppHandle, name: String, contents: String) -> Result<(), String> {
    fs::write(safe_path(&app, &name)?, contents).map_err(|e| e.to_string())
}
