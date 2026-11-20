use std::fs;
use std::path::PathBuf;
use tauri::Manager;

/// Sauvegarde directe d'un fichier binaire (ex: PDF annoté exporté par `pdf-lib`, image PNG/SVG ou sauvegarde JSON)
#[tauri::command]
fn save_binary_file(path: String, bytes: Vec<u8>) -> Result<String, String> {
    let target = PathBuf::from(&path);
    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| format!("Impossible de créer le dossier parent : {}", e))?;
        }
    }
    fs::write(&target, &bytes).map_err(|e| format!("Erreur d'écriture du fichier PDF/binaire : {}", e))?;
    Ok(target.to_string_lossy().into_owned())
}

/// Lecture directe d'un fichier binaire local (ex: importation d'un fichier `.pdf` depuis le disque)
#[tauri::command]
fn read_binary_file(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| format!("Erreur de lecture du fichier PDF ({}) : {}", path, e))
}

/// Retourne les chemins de stockage local natifs (AppData, LocalData, Documents, Téléchargements)
#[tauri::command]
fn get_local_storage_paths(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let resolver = app.path();
    let app_data = resolver.app_data_dir().ok().map(|p| p.to_string_lossy().into_owned());
    let app_local_data = resolver.app_local_data_dir().ok().map(|p| p.to_string_lossy().into_owned());
    let documents = resolver.document_dir().ok().map(|p| p.to_string_lossy().into_owned());
    let downloads = resolver.download_dir().ok().map(|p| p.to_string_lossy().into_owned());

    Ok(serde_json::json!({
        "runtime": "tauri-v2-webview2",
        "appDataDir": app_data,
        "appLocalDataDir": app_local_data,
        "documentDir": documents,
        "downloadDir": downloads
    }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Garantit dans WebView2 (Windows 10/11) la fluidité maximale des PointerEvent du stylet Windows Ink :
    // - Désactive la navigation latérale par balayage (OverscrollHistoryNavigation)
    // - Désactive les régions déplaçables parasites (msWebView2EnableDraggableRegions)
    // - Laisse la gestion du zoom pincement et du stylet à 100 % au moteur vectoriel de Plume Studio Pro
    std::env::set_var(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "--disable-features=msWebView2EnableDraggableRegions,OverscrollHistoryNavigation --disable-pinch --touch-events=enabled",
    );

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // S'assure que le dossier de données locales existe pour la persistance hors-ligne
            if let Ok(local_dir) = app.path().app_local_data_dir() {
                let _ = fs::create_dir_all(&local_dir);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_binary_file,
            read_binary_file,
            get_local_storage_paths
        ])
        .run(tauri::generate_context!())
        .expect("Erreur lors de l'exécution de l'application Tauri v2 Plume Studio Pro");
}
