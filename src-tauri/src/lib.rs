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
            #[cfg(target_os = "macos")]
            {
                let window = app
                    .get_webview_window("main")
                    .expect("main window not found");

                let options = LiquidGlassOptions::new(NSGlassEffectViewStyle::Clear)
                    .radius(26.0)
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
            settings::open_settings_page
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
