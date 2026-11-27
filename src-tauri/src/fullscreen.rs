//! Plein écran « fenêtré » d'InkFlow.
//!
//! Le plein écran natif de tao (`window.set_fullscreen(true)`) place une fenêtre sans cadre
//! exactement sur le rectangle du moniteur. Windows (DWM) considère alors la fenêtre comme une
//! application plein écran : la surface WebView2 devient éligible au « flip indépendant »
//! (présentation directe sans composition DWM) et le système bascule entre composition et flip
//! direct dès qu'un élément système passe au-dessus (curseur du stylet, retour visuel Windows Ink,
//! infobulles, overlays). Chaque bascule coûte une ou plusieurs trames, d'où le trait saccadé au
//! stylet uniquement en plein écran.
//!
//! Ici, la fenêtre reste une fenêtre composée normale : décorations, ombre et redimensionnement
//! retirés, puis position et taille posées à la main sur le moniteur courant, avec 1 px de plus en
//! hauteur (hors écran). La surface ne correspond donc jamais exactement à l'écran : DWM continue de
//! composer à cadence régulière, comme en fenêtre normale. La géométrie d'origine est mémorisée
//! pour être restaurée à la sortie.
//!
//! Diagnostic : `INKFLOW_FULLSCREEN_MODE=native` rétablit le plein écran natif de tao (comparaison A/B).

use std::sync::Mutex;
use tauri::{Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewWindow};

/// Pixels ajoutés sous le bas de l'écran pour que la surface ne coïncide pas avec le moniteur.
const OFFSCREEN_EXTRA_HEIGHT_PX: u32 = 1;

#[derive(Clone, Copy, Debug)]
struct SavedGeometry {
    position: PhysicalPosition<i32>,
    inner_size: PhysicalSize<u32>,
    maximized: bool,
    decorated: bool,
    resizable: bool,
}

#[derive(Default)]
pub struct FullscreenState {
    inner: Mutex<FullscreenInner>,
}

#[derive(Default)]
struct FullscreenInner {
    active: bool,
    saved: Option<SavedGeometry>,
}

fn use_native_fullscreen() -> bool {
    std::env::var("INKFLOW_FULLSCREEN_MODE")
        .map(|v| v.trim().eq_ignore_ascii_case("native"))
        .unwrap_or(false)
}

fn err(e: impl std::fmt::Display) -> String {
    format!("Impossible de modifier le mode plein écran : {}", e)
}

/// État courant (plein écran fenêtré ou natif).
pub fn is_fullscreen<R: Runtime>(window: &WebviewWindow<R>) -> bool {
    if use_native_fullscreen() {
        return window.is_fullscreen().unwrap_or(false);
    }
    window
        .try_state::<FullscreenState>()
        .map(|s| s.inner.lock().map(|g| g.active).unwrap_or(false))
        .unwrap_or(false)
}

/// Active ou quitte le plein écran et retourne l'état obtenu.
pub fn set_fullscreen<R: Runtime>(window: &WebviewWindow<R>, enable: bool) -> Result<bool, String> {
    if use_native_fullscreen() {
        window.set_fullscreen(enable).map_err(err)?;
        return Ok(window.is_fullscreen().unwrap_or(enable));
    }
    let state = window
        .try_state::<FullscreenState>()
        .ok_or_else(|| err("état plein écran non initialisé"))?;
    let mut guard = state.inner.lock().map_err(|_| err("verrou plein écran empoisonné"))?;
    if guard.active == enable {
        return Ok(guard.active);
    }
    if enable {
        guard.saved = Some(enter(window)?);
        guard.active = true;
    } else {
        let saved = guard.saved.take();
        guard.active = false;
        leave(window, saved)?;
    }
    Ok(guard.active)
}

fn enter<R: Runtime>(window: &WebviewWindow<R>) -> Result<SavedGeometry, String> {
    // Un éventuel plein écran natif résiduel est d'abord quitté
    if window.is_fullscreen().unwrap_or(false) {
        window.set_fullscreen(false).map_err(err)?;
    }
    let maximized = window.is_maximized().unwrap_or(false);
    if maximized {
        // La géométrie mémorisée doit être celle de la fenêtre restaurée, pas celle de la zone de travail
        window.unmaximize().map_err(err)?;
    }
    let saved = SavedGeometry {
        position: window.outer_position().map_err(err)?,
        inner_size: window.inner_size().map_err(err)?,
        maximized,
        decorated: window.is_decorated().unwrap_or(true),
        resizable: window.is_resizable().unwrap_or(true),
    };

    let monitor = window
        .current_monitor()
        .map_err(err)?
        .or_else(|| window.primary_monitor().ok().flatten())
        .ok_or_else(|| err("aucun moniteur détecté"))?;
    let pos = *monitor.position();
    let size = *monitor.size();

    // Sans cadre ni bordure de redimensionnement (sinon curseurs de redimensionnement sur les bords)
    window.set_resizable(false).map_err(err)?;
    window.set_decorations(false).map_err(err)?;
    let _ = window.set_shadow(false);
    window
        .set_size(PhysicalSize::new(size.width, size.height + OFFSCREEN_EXTRA_HEIGHT_PX))
        .map_err(err)?;
    window.set_position(pos).map_err(err)?;
    let _ = window.set_focus();
    Ok(saved)
}

fn leave<R: Runtime>(window: &WebviewWindow<R>, saved: Option<SavedGeometry>) -> Result<(), String> {
    let saved = match saved {
        Some(s) => s,
        None => {
            window.set_decorations(true).map_err(err)?;
            let _ = window.set_shadow(true);
            window.set_resizable(true).map_err(err)?;
            return Ok(());
        }
    };
    window.set_decorations(saved.decorated).map_err(err)?;
    let _ = window.set_shadow(true);
    window.set_resizable(saved.resizable).map_err(err)?;
    window.set_size(saved.inner_size).map_err(err)?;
    window.set_position(saved.position).map_err(err)?;
    if saved.maximized {
        window.maximize().map_err(err)?;
    }
    Ok(())
}
