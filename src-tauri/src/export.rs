#[tauri::command]
pub fn export_file(name: &str, ) -> String {
    //TODO: export html -> pdf and save, or even export to Docx files.
    format!("Hello, {}! You've been greeted from Rust!", name)
}

