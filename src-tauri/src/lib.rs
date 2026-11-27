mod fullscreen;
mod gdrive_oauth;

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

/// Active ou quitte le plein écran (plein écran fenêtré composé, voir `fullscreen.rs`)
#[tauri::command]
fn set_window_fullscreen(window: tauri::WebviewWindow, fullscreen: bool) -> Result<bool, String> {
    fullscreen::set_fullscreen(&window, fullscreen)
}

/// Bascule le plein écran et retourne le nouvel état
#[tauri::command]
fn toggle_window_fullscreen(window: tauri::WebviewWindow) -> Result<bool, String> {
    let next = !fullscreen::is_fullscreen(&window);
    fullscreen::set_fullscreen(&window, next)
}

/// Retourne l'état actuel du plein écran de la fenêtre
#[tauri::command]
fn get_window_fullscreen(window: tauri::WebviewWindow) -> Result<bool, String> {
    Ok(fullscreen::is_fullscreen(&window))
}

/// Synchronise l'interface (classe `is-fullscreen`, bouton) avant le premier rendu de la page.
const BOOT_FULLSCREEN_SCRIPT: &str = r#"(function () {
  try {
    window.__INKFLOW_BOOT_FULLSCREEN__ = true;
    var apply = function () {
      var d = document.documentElement;
      if (!d) return false;
      d.classList.add('is-fullscreen');
      d.setAttribute('data-fullscreen', 'true');
      return true;
    };
    if (!apply()) document.addEventListener('readystatechange', apply, { once: true });
  } catch (_) {}
})();"#;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Garantit dans WebView2 (Windows 10/11) la fluidité maximale des PointerEvent du stylet Windows Ink :
    // - Désactive la navigation latérale par balayage (OverscrollHistoryNavigation)
    // - Désactive les régions déplaçables parasites (msWebView2EnableDraggableRegions)
    // - Laisse la gestion du zoom pincement et du stylet à 100 % au moteur vectoriel de Plume Studio Pro
    // Des arguments déjà présents dans l'environnement (diagnostic, ex. --remote-debugging-port) sont conservés
    const BASE_WEBVIEW2_ARGS: &str =
        "--disable-features=msWebView2EnableDraggableRegions,OverscrollHistoryNavigation --disable-pinch --touch-events=enabled";
    let webview2_args = match std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS") {
        Ok(extra) if !extra.trim().is_empty() => format!("{} {}", BASE_WEBVIEW2_ARGS, extra.trim()),
        _ => BASE_WEBVIEW2_ARGS.to_string(),
    };
    std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", webview2_args);

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // S'assure que le dossier de données locales existe pour la persistance hors-ligne
            if let Ok(local_dir) = app.path().app_local_data_dir() {
                let _ = fs::create_dir_all(&local_dir);
            }

            // Fenêtre principale créée cachée (`create: false` dans tauri.conf.json), passée en plein
            // écran puis seulement montrée : aucun flash de fenêtre normale au lancement.
            app.manage(fullscreen::FullscreenState::default());
            let config = app
                .config()
                .app
                .windows
                .iter()
                .find(|w| w.label == "main")
                .cloned()
                .ok_or("Configuration de la fenêtre principale introuvable")?;
            let window = tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?
                .visible(false)
                .initialization_script(BOOT_FULLSCREEN_SCRIPT)
                .build()?;
            if let Err(e) = fullscreen::set_fullscreen(&window, true) {
                eprintln!("[InkFlow] plein écran au démarrage impossible : {}", e);
            }
            let _ = window.show();
            let _ = window.set_focus();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_binary_file,
            read_binary_file,
            get_local_storage_paths,
            set_window_fullscreen,
            toggle_window_fullscreen,
            get_window_fullscreen,
            gdrive_oauth::gdrive_oauth_link,
            gdrive_oauth::gdrive_oauth_refresh,
            gdrive_oauth::gdrive_oauth_revoke,
            gdrive_oauth::gdrive_oauth_cancel
        ])
        .run(tauri::generate_context!())
        .expect("Erreur lors de l'exécution de l'application Tauri v2 Plume Studio Pro");
}
