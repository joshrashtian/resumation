use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

//will return our /Documents/Resumation, if does not exist it creates.
fn docs_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().document_dir().map_err(|e| e.to_string())?.join("Resumation");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    
    Ok(dir);
}

fn safe_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let is_plain_name = Path::new(name).file_name().map(|n| n == name).unwrap_or(false);
    if !is_plain_name {
        return Err("invalid file name".into());
    }
    Ok(docs_dir(app)?.join(name))
}

#[tauri::command]
pub fn list_documents(app: AppHandle) -> Result<Vec<String>, String> {
   let mut files = Vec::new();
    
   for entry in fs::read_dir(docs_dir(&app)?).map_err(|e| e.to_string())? {
    let file = file.map_err(|e| e.to_string)?;
    if file.path().is_file() {
        names.push(entry.file_name().to_string_lossy().into_owned());
        }
    }
}

#[tauri::command]
fn read_document(app: AppHandle, name: String) -> Result<String, String> {
    fs::read_to_string(safe_path(&app, &name)?).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_document(app: AppHandle, name: String, contents: String) -> Result<(), String> {
    fs::write(safe_path(&app, &name)?, contents).map_err(|e| e.to_string())
}
