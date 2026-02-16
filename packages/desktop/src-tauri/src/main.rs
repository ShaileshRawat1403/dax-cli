// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Get the main window
            let main_window = app.get_window("main").unwrap();

            // Set up window event handlers
            main_window.on_window_event(|event| match event {
                tauri::WindowEvent::CloseRequested { .. } => {
                    println!("Window close requested");
                }
                _ => {}
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet, get_app_version,])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
