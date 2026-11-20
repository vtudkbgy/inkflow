// Empêche l'ouverture d'une console cmd.exe en arrière-plan sous Windows en mode release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    plume_studio_pro_lib::run();
}
