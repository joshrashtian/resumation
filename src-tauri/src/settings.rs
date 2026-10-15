use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

const LABEL: &str = "settings";

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
            .inner_size(840.0, 840.0)
            .always_on_top(true)
            .center()
            .focused(true)
            .build()
            .map_err(|e| e.to_string())?;

    // Hide (rather than close) when focus is lost so reopening is instant.
    let handle = win.clone();
    win.on_window_event(move |event| {
        if let WindowEvent::Focused(false) = event {
            let _ = handle.hide();
        }
    });

    Ok(())
}
