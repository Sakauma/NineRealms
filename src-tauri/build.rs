fn main() {
    let attributes = tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["save_json", "copy_text"]),
    );
    tauri_build::try_build(attributes).expect("Tauri build configuration failed");
}
