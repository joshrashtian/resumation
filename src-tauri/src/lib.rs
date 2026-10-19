mod directory;
mod settings;

use tauri::Manager;

#[cfg(target_os = "macos")]
use window_vibrancy::{LiquidGlassOptions, NSGlassEffectViewStyle, apply_liquid_glass};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // macOS keeps its traffic lights over the content (titleBarStyle
            // "Overlay" in tauri.conf.json); Windows goes fully frameless.
            #[cfg(target_os = "windows")]
            app.get_webview_window("main")
                .expect("main window not found")
                .set_decorations(false)?;

            #[cfg(target_os = "macos")]
            {
                let window = app
                    .get_webview_window("main")
                    .expect("main window not found");

                let options = LiquidGlassOptions::new(NSGlassEffectViewStyle::Clear)
                    .radius(50.0)
                    .opaque(false)
                    // macOS 27+ only, ignored on macOS 26
                    .interactive(true);

                apply_liquid_glass(&window, options)
                    .expect("apply_liquid_glass is only supported on macOS 26+");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            settings::open_settings_page,
            directory::read_document,
            directory::read_document_bytes,
            directory::save_document,
            directory::create_document,
            directory::list_documents,
            directory::list_projects,
            directory::create_project,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
