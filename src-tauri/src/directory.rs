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

// A project is one folder directly inside ResumationData. The name must be a
// single plain folder name so it can't point anywhere else.
fn valid_project_name(name: &str) -> bool {
    let mut components = Path::new(name).components();
    matches!(
        (components.next(), components.next()),
        (Some(Component::Normal(_)), None)
    ) && !name.starts_with('.')
        && !name.contains(['/', '\\'])
}

// ResumationData/<name>, created if it does not exist yet.
fn project_dir(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    if !valid_project_name(name) {
        return Err("invalid project name".into());
    }
    let dir = docs_dir(app)?.join(name);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    Ok(dir)
}

// Resolves a path relative to a project's folder, rejecting anything that
// could escape it (.., absolute paths, hidden files).
fn safe_path(app: &AppHandle, project: &str, relative: &str) -> Result<PathBuf, String> {
    let path = Path::new(relative);
    let is_safe = path.components().all(|c| match c {
        Component::Normal(name) => !name.to_string_lossy().starts_with('.'),
        _ => false,
    });
    if !is_safe {
        return Err("invalid path".into());
    }
    Ok(project_dir(app, project)?.join(path))
}

#[derive(Serialize)]
pub struct Entry {
    name: String,
    path: String,
    is_dir: bool,
}

#[tauri::command]
pub fn list_projects(app: AppHandle) -> Result<Vec<String>, String> {
    let mut projects = Vec::new();
    for entry in fs::read_dir(docs_dir(&app)?).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if entry.path().is_dir() && valid_project_name(&name) {
            projects.push(name);
        }
    }
    projects.sort_by_key(|name| name.to_lowercase());
    Ok(projects)
}

#[tauri::command]
pub fn create_project(app: AppHandle, name: String) -> Result<String, String> {
    let name = name.trim().to_string();
    project_dir(&app, &name)?;
    Ok(name)
}

#[tauri::command]
pub fn list_documents(app: AppHandle, project: String, folder: Option<String>) -> Result<Vec<Entry>, String> {
    let dir = match &folder {
        Some(f) if !f.is_empty() => safe_path(&app, &project, f)?,
        _ => project_dir(&app, &project)?,
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
pub fn read_document(app: AppHandle, project: String, name: String) -> Result<String, String> {
    fs::read_to_string(safe_path(&app, &project, &name)?).map_err(|e| e.to_string())
}

// Raw file contents for binary documents such as .docx; arrives in JS as an ArrayBuffer.
#[tauri::command]
pub fn read_document_bytes(app: AppHandle, project: String, name: String) -> Result<tauri::ipc::Response, String> {
    let bytes = fs::read(safe_path(&app, &project, &name)?).map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub fn save_document(app: AppHandle, project: String, name: String, contents: String) -> Result<(), String> {
    fs::write(safe_path(&app, &project, &name)?, contents).map_err(|e| e.to_string())
}

// "Resume.docx" -> "Resume (2).docx" while that name is taken in dir.
fn unique_name(dir: &Path, name: &str) -> String {
    if !dir.join(name).exists() {
        return name.to_string();
    }
    let (stem, ext) = match name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() => (stem, format!(".{ext}")),
        _ => (name, String::new()),
    };
    (2..)
        .map(|n| format!("{stem} ({n}){ext}"))
        .find(|candidate| !dir.join(candidate).exists())
        .unwrap()
}

// Writes a new file into the project (or a folder inside it) without
// overwriting anything; returns its path relative to the project.
#[tauri::command]
pub fn create_document(
    app: AppHandle,
    project: String,
    folder: Option<String>,
    name: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    if name.contains(['/', '\\']) {
        return Err("invalid file name".into());
    }
    let folder = folder.filter(|f| !f.is_empty());
    let dir = match &folder {
        Some(f) => safe_path(&app, &project, f)?,
        None => project_dir(&app, &project)?,
    };
    safe_path(&app, &project, &name)?;
    let name = unique_name(&dir, &name);
    fs::write(dir.join(&name), bytes).map_err(|e| e.to_string())?;
    Ok(match folder {
        Some(f) => format!("{f}/{name}"),
        None => name,
    })
}

#[cfg(test)]
mod tests {
    use super::{unique_name, valid_project_name};
    use std::fs;

    #[test]
    fn project_names() {
        for ok in ["Resume", "Job Hunt 2026", "café"] {
            assert!(valid_project_name(ok), "{ok}");
        }
        for bad in ["", ".", "..", ".hidden", "a/b", "a\\b", "../x", "/abs", "a/"] {
            assert!(!valid_project_name(bad), "{bad}");
        }
    }

    #[test]
    fn unique_names() {
        let dir = std::env::temp_dir().join(format!("resumation-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        assert_eq!(unique_name(&dir, "Resume.docx"), "Resume.docx");
        fs::write(dir.join("Resume.docx"), "").unwrap();
        assert_eq!(unique_name(&dir, "Resume.docx"), "Resume (2).docx");
        fs::write(dir.join("Resume (2).docx"), "").unwrap();
        assert_eq!(unique_name(&dir, "Resume.docx"), "Resume (3).docx");
        fs::write(dir.join("notes"), "").unwrap();
        assert_eq!(unique_name(&dir, "notes"), "notes (2)");
        fs::remove_dir_all(&dir).unwrap();
    }
}
