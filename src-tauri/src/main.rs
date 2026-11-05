#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod policy;
mod export;

use std::sync::Mutex;
use tauri::{menu::{Menu, MenuItem, PredefinedMenuItem, Submenu}, webview::{NewWindowResponse, PageLoadEvent, PermissionResponse}, Manager, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;
use policy::NavigationPolicy;

fn trusted_window(window: &WebviewWindow) -> Result<(), String> {
    let url = window.url().map_err(|_| "无法核验当前窗口。".to_string())?;
    if window.label() != "main" || !window.state::<NavigationPolicy>().allows(&url) {
        return Err("此窗口不能访问桌面功能。".into());
    }
    Ok(())
}

#[tauri::command]
async fn save_json(window: WebviewWindow, app: tauri::AppHandle, contents: String, filename: String) -> Result<bool, String> {
    trusted_window(&window)?;
    export::validate_request(&contents, &filename)?;
    // A caller cannot supply a destination path. Only the native save dialog selects it.
    tauri::async_runtime::spawn_blocking(move || {
        let selected = app.dialog().file().set_parent(&window).set_title("保存九境备份").add_filter("JSON", &["json"])
            .set_file_name(&filename).blocking_save_file();
        let Some(selected) = selected else { return Ok(false); };
        let path = selected.into_path().map_err(|_| "请选择本机 JSON 文件路径。".to_string())?;
        export::save_selected(&path, &contents)?;
        Ok(true)
    }).await.map_err(|_| "保存窗口未能完成，请重试。".to_string())?
}

#[tauri::command]
fn copy_text(window: WebviewWindow, app: tauri::AppHandle, text: String) -> Result<(), String> {
    trusted_window(&window)?;
    if text.len() > 1024 * 1024 { return Err("复制内容过长。".into()); }
    app.clipboard().write_text(text).map_err(|_| "剪贴板暂时不可用。".into())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize(); let _ = window.show(); let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![save_json, copy_text])
        .setup(|app| {
            // Unique identifier, product name and profile keep Electron's installation/data intact.
            let profile = app.path().app_local_data_dir()?.join("webview");
            std::fs::create_dir_all(&profile)?;
            let dev = if cfg!(dev) { app.config().build.dev_url.clone() } else { None };
            let policy = NavigationPolicy::new(cfg!(target_os = "windows"), dev);
            app.manage(policy.clone());
            let quit = MenuItem::with_id(app, "quit", "退出游戏", true, Some("CmdOrCtrl+Q"))?;
            let zoom_in = MenuItem::with_id(app, "zoom-in", "放大", true, Some("CmdOrCtrl+="))?;
            let zoom_out = MenuItem::with_id(app, "zoom-out", "缩小", true, Some("CmdOrCtrl+-"))?;
            let reset = MenuItem::with_id(app, "zoom-reset", "实际大小", true, Some("CmdOrCtrl+0"))?;
            let fullscreen = MenuItem::with_id(app, "fullscreen", "全屏", true, Some("F11"))?;
            let separator = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[
                &Submenu::with_items(app, "九境", true, &[&quit])?,
                &Submenu::with_items(app, "视图", true, &[&zoom_in, &zoom_out, &reset, &separator, &fullscreen])?,
            ])?;
            let config = app.config().app.windows.iter().find(|w| w.label == "main").ok_or("Missing main window configuration")?;
            let visible_policy = policy.clone();
            let zoom = Mutex::new(1.0_f64);
            WebviewWindowBuilder::from_config(app, config)?
                .data_directory(profile)
                .menu(menu)
                .on_navigation(move |url| policy.allows(url))
                .on_new_window(|_, _| NewWindowResponse::Deny)
                .on_permission_request(|_, _| PermissionResponse::Deny)
                // Export goes through save_json and a user-selected native dialog.
                .on_download(|_, _| false)
                .on_page_load(move |window, payload| {
                    if payload.event() == PageLoadEvent::Finished && visible_policy.allows(payload.url()) {
                        let _ = window.show();
                    }
                })
                .on_menu_event(move |window, event| {
                    let Some(webview) = window.app_handle().get_webview_window("main") else { return; };
                    match event.id().as_ref() {
                        "quit" => { let _ = webview.close(); },
                        "fullscreen" => { if let Ok(full) = webview.is_fullscreen() { let _ = webview.set_fullscreen(!full); } },
                        "zoom-in" | "zoom-out" | "zoom-reset" => {
                            if let Ok(mut current) = zoom.lock() {
                                let next = match event.id().as_ref() { "zoom-in" => (*current * 1.1).min(3.0), "zoom-out" => (*current / 1.1).max(0.5), _ => 1.0 };
                                if webview.set_zoom(next).is_ok() { *current = next; }
                            }
                        },
                        _ => (),
                    }
                })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Nine Realms Tauri could not start");
}
