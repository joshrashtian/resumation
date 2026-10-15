use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[tauri::command]
pub async fn open_settings_page(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(LABEL) {
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let win =
        WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::App("index.html#/settings".into()))
            .title("Settings Page")
            .inner_size(540.0, 540.0)
            .always_on_top(true)
            .center()
            .focused(true)
            .build()
            .map_err(|e| e.to_string())?;

    let handle = win.clone();
    win.on_window_event(move |event| {
        if let WindowEvent::Focused(false) = event {
            let _ = handle.hide();
        }
    });

    Ok(())
}



