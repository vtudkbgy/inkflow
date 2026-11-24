//! Liaison d'un compte Google (OAuth 2.0 « application de bureau »).
//!
//! Flux par code d'autorisation + PKCE (S256) avec redirection loopback
//! (`http://127.0.0.1:<port>`). Le front appelle les commandes Tauri
//! `gdrive_oauth_link`, `gdrive_oauth_refresh`, `gdrive_oauth_revoke` et
//! `gdrive_oauth_cancel` ; aucun secret n'est stocké ici.
//!
//! Politique « une seule liaison à la fois » : lancer une nouvelle liaison
//! ANNULE la précédente (son appel renvoie `Err("Liaison annulée.")`).
//!
//! Erreurs : toute erreur réseau (connexion, DNS, délai) commence par
//! `Réseau indisponible`. Une réponse d'erreur de Google est renvoyée sous la
//! forme `Google a refusé la requête (HTTP <code>, <error>) : <error_description>`,
//! donc `invalid_grant` apparaît tel quel dans le message.

use std::io::{ErrorKind, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use sha2::{Digest, Sha256};

const AUTH_ENDPOINT: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT: &str = "https://oauth2.googleapis.com/revoke";
const LINK_TIMEOUT: Duration = Duration::from_secs(300);
const POLL_INTERVAL: Duration = Duration::from_millis(100);
const MAX_REQUEST_LINE: usize = 8192;
const REQUEST_READ_TIMEOUT: Duration = Duration::from_secs(3);

/// Numéro de la liaison en attente (0 = aucune).
static ACTIVE_LINK: AtomicU64 = AtomicU64::new(0);
/// Compteur de liaisons, pour numéroter chaque tentative.
static LINK_COUNTER: AtomicU64 = AtomicU64::new(0);

// ---------------------------------------------------------------------------
// Fonctions pures
// ---------------------------------------------------------------------------

/// `code_challenge` S256 = base64url sans padding de SHA-256(verifier).
pub(crate) fn pkce_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

/// Chaîne aléatoire cryptographique en base64url sans padding (`byte_len` octets).
fn random_token(byte_len: usize) -> Result<String, String> {
    let mut buf = vec![0u8; byte_len];
    getrandom::fill(&mut buf)
        .map_err(|e| format!("Impossible de générer une valeur aléatoire sécurisée : {}", e))?;
    Ok(URL_SAFE_NO_PAD.encode(buf))
}

/// URL d'autorisation Google (paramètres encodés correctement).
pub(crate) fn build_auth_url(
    client_id: &str,
    redirect_uri: &str,
    scope: &str,
    code_challenge: &str,
    state: &str,
) -> Result<String, String> {
    let url = url::Url::parse_with_params(
        AUTH_ENDPOINT,
        &[
            ("client_id", client_id),
            ("redirect_uri", redirect_uri),
            ("response_type", "code"),
            ("scope", scope),
            ("code_challenge", code_challenge),
            ("code_challenge_method", "S256"),
            ("state", state),
            ("access_type", "offline"),
            ("prompt", "consent"),
        ],
    )
    .map_err(|e| format!("URL d'autorisation invalide : {}", e))?;
    Ok(url.into())
}

/// Ce que contient la première ligne d'une requête reçue sur la redirection.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Callback {
    /// Ni `code` ni `error` (ex. /favicon.ico) : à ignorer (réponse 404).
    Ignored,
    Code { code: String, state: Option<String> },
    Error { error: String, state: Option<String> },
}

/// Analyse `GET /?code=...&state=... HTTP/1.1`.
pub(crate) fn parse_callback_line(line: &str) -> Callback {
    let mut parts = line.split_whitespace();
    if parts.next() != Some("GET") {
        return Callback::Ignored;
    }
    let target = match parts.next() {
        Some(t) => t,
        None => return Callback::Ignored,
    };
    let parsed = match url::Url::parse(&format!("http://127.0.0.1{}", target)) {
        Ok(u) => u,
        Err(_) => return Callback::Ignored,
    };
    let (mut code, mut error, mut state) = (None, None, None);
    for (k, v) in parsed.query_pairs() {
        match k.as_ref() {
            "code" => code = Some(v.into_owned()),
            "error" => error = Some(v.into_owned()),
            "state" => state = Some(v.into_owned()),
            _ => {}
        }
    }
    match (code, error) {
        (_, Some(error)) => Callback::Error { error, state },
        (Some(code), None) if !code.is_empty() => Callback::Code { code, state },
        _ => Callback::Ignored,
    }
}

/// Message d'erreur français à partir d'une réponse d'erreur de Google.
pub(crate) fn google_error_message(status: u16, body: &str) -> String {
    let json: Option<serde_json::Value> = serde_json::from_str(body).ok();
    let field = |name: &str| {
        json.as_ref()
            .and_then(|v| v.get(name))
            .and_then(|v| v.as_str())
            .map(str::to_owned)
    };
    match (field("error"), field("error_description")) {
        (Some(e), Some(d)) => format!("Google a refusé la requête (HTTP {}, {}) : {}", status, e, d),
        (Some(e), None) => format!("Google a refusé la requête (HTTP {}, {}).", status, e),
        _ => format!("Google a refusé la requête (HTTP {}).", status),
    }
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn result_page(ok: bool, message: &str) -> String {
    let title = if ok { "InkFlow — compte relié" } else { "InkFlow — liaison échouée" };
    format!(
        "<!doctype html><html lang=\"fr\"><head><meta charset=\"utf-8\">\
<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\
<title>{title}</title>\
<style>body{{font-family:system-ui,Segoe UI,sans-serif;background:#f6f6f4;color:#222;\
display:flex;align-items:center;justify-content:center;height:100vh;margin:0}}\
main{{background:#fff;border:1px solid #ddd;border-radius:10px;padding:28px 36px;\
max-width:420px;text-align:center}}h1{{font-size:18px;margin:0 0 8px}}p{{margin:0;color:#555}}\
</style></head><body><main><h1>{title}</h1><p>{msg}</p></main></body></html>",
        title = title,
        msg = html_escape(message)
    )
}

fn http_response(status_line: &str, body: &str) -> String {
    format!(
        "HTTP/1.1 {}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\n\
Cache-Control: no-store\r\nConnection: close\r\n\r\n{}",
        status_line,
        body.len(),
        body
    )
}

// ---------------------------------------------------------------------------
// Réseau / système
// ---------------------------------------------------------------------------

fn net_err(e: reqwest::Error) -> String {
    format!("Réseau indisponible : {}", e)
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Client HTTP indisponible : {}", e))
}

/// POST application/x-www-form-urlencoded ; renvoie (statut HTTP, corps texte).
async fn post_form(url: &str, params: &[(&str, &str)]) -> Result<(u16, String), String> {
    let body = url::form_urlencoded::Serializer::new(String::new())
        .extend_pairs(params)
        .finish();
    let resp = http_client()?
        .post(url)
        .header(reqwest::header::CONTENT_TYPE, "application/x-www-form-urlencoded")
        .body(body)
        .send()
        .await
        .map_err(net_err)?;
    let status = resp.status().as_u16();
    let text = resp.text().await.map_err(net_err)?;
    Ok((status, text))
}

fn parse_token_response(status: u16, body: &str) -> Result<serde_json::Value, String> {
    if (200..300).contains(&status) {
        serde_json::from_str(body).map_err(|_| "Réponse inattendue de Google.".to_string())
    } else {
        Err(google_error_message(status, body))
    }
}

/// Ouvre l'URL dans le navigateur système, sans passer par un shell.
fn open_browser(url: &str) -> Result<(), String> {
    #[cfg(windows)]
    let result = std::process::Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", url])
        .spawn();
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(url).spawn();
    #[cfg(all(not(windows), not(target_os = "macos")))]
    let result = std::process::Command::new("xdg-open").arg(url).spawn();
    result
        .map(|_| ())
        .map_err(|e| format!("Impossible d'ouvrir le navigateur : {}", e))
}

/// Lit la première ligne de la requête HTTP (jusqu'à LF, 8 Kio max).
/// Échéance TOTALE par connexion : un client lent est abandonné.
fn read_request_line(stream: &mut TcpStream, total: Duration) -> Option<String> {
    let _ = stream.set_nonblocking(false);
    let deadline = Instant::now() + total;
    let mut buf = Vec::new();
    let mut chunk = [0u8; 1024];
    while buf.len() < MAX_REQUEST_LINE && !buf.contains(&b'\n') {
        let remaining = deadline.checked_duration_since(Instant::now())?;
        if remaining.is_zero() {
            return None;
        }
        let _ = stream.set_read_timeout(Some(remaining));
        match stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => buf.extend_from_slice(&chunk[..n]),
            Err(_) => return None, // délai dépassé ou connexion rompue : abandon
        }
    }
    let line = buf.split(|b| *b == b'\n').next()?;
    let line = String::from_utf8_lossy(line).trim().to_string();
    if line.is_empty() {
        None
    } else {
        Some(line)
    }
}

fn respond(stream: &mut TcpStream, status_line: &str, body: &str) {
    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));
    let _ = stream.write_all(http_response(status_line, body).as_bytes());
    let _ = stream.flush();
}

fn respond_result(stream: &mut TcpStream, ok: bool, message: &str) {
    respond(stream, "200 OK", &result_page(ok, message));
}

/// Un `state` absent ou différent n'est jamais fatal : une page tierce qui sonde
/// 127.0.0.1 ne doit pas pouvoir annuler la liaison (réponse 400, on continue d'attendre).
const BAD_STATE_BODY: &str = "Requête invalide (state).";

/// Attend la redirection (bloquant). Renvoie le code et le flux resté ouvert,
/// afin de répondre au navigateur une fois l'échange du code terminé.
fn wait_for_code(
    listener: TcpListener,
    expected_state: &str,
    my_id: u64,
) -> Result<(String, TcpStream), String> {
    let deadline = Instant::now() + LINK_TIMEOUT;
    loop {
        if ACTIVE_LINK.load(Ordering::SeqCst) != my_id {
            return Err("Liaison annulée.".to_string());
        }
        if Instant::now() >= deadline {
            return Err("Délai dépassé : aucune réponse de Google (5 minutes).".to_string());
        }
        let mut stream = match listener.accept() {
            Ok((s, _)) => s,
            Err(e) if e.kind() == ErrorKind::WouldBlock => {
                std::thread::sleep(POLL_INTERVAL);
                continue;
            }
            Err(e) => return Err(format!("Erreur du serveur local de redirection : {}", e)),
        };
        let line = match read_request_line(&mut stream, REQUEST_READ_TIMEOUT) {
            Some(l) => l,
            None => continue,
        };
        match parse_callback_line(&line) {
            Callback::Ignored => respond(&mut stream, "404 Not Found", "Not Found"),
            Callback::Code { code, state } => {
                if state.as_deref() != Some(expected_state) {
                    respond(&mut stream, "400 Bad Request", BAD_STATE_BODY);
                    continue;
                }
                return Ok((code, stream));
            }
            Callback::Error { error, state } => {
                if state.as_deref() != Some(expected_state) {
                    respond(&mut stream, "400 Bad Request", BAD_STATE_BODY);
                    continue;
                }
                let msg = if error == "access_denied" {
                    "Connexion refusée dans Google.".to_string()
                } else {
                    format!("Google a refusé la connexion ({}).", error)
                };
                respond_result(&mut stream, false, &msg);
                return Err(msg);
            }
        }
    }
}

/// Libère le « slot » de liaison si c'est toujours le nôtre.
struct ActiveGuard(u64);
impl Drop for ActiveGuard {
    fn drop(&mut self) {
        let _ = ACTIVE_LINK.compare_exchange(self.0, 0, Ordering::SeqCst, Ordering::SeqCst);
    }
}

// ---------------------------------------------------------------------------
// Commandes Tauri
// ---------------------------------------------------------------------------

/// Lie un compte Google : ouvre le navigateur, attend la redirection loopback,
/// échange le code (PKCE) et renvoie le JSON de Google (access_token, refresh_token…).
#[tauri::command]
pub async fn gdrive_oauth_link(
    client_id: String,
    client_secret: Option<String>,
    scope: String,
) -> Result<serde_json::Value, String> {
    let client_id = client_id.trim().to_string();
    if client_id.is_empty() {
        return Err("Identifiant client Google manquant.".to_string());
    }
    if scope.trim().is_empty() {
        return Err("Portée (scope) Google manquante.".to_string());
    }

    let verifier = random_token(32)?; // 43 caractères
    let challenge = pkce_challenge(&verifier);
    let state = random_token(16)?;

    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Impossible d'ouvrir le port local de redirection : {}", e))?;
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("Erreur du serveur local de redirection : {}", e))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Erreur du serveur local de redirection : {}", e))?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{}", port);

    let auth_url = build_auth_url(&client_id, &redirect_uri, &scope, &challenge, &state)?;

    // Annule toute liaison précédente (son numéro n'est plus l'actif).
    let my_id = LINK_COUNTER.fetch_add(1, Ordering::SeqCst) + 1;
    ACTIVE_LINK.store(my_id, Ordering::SeqCst);
    let _guard = ActiveGuard(my_id);

    open_browser(&auth_url)?;

    let expected_state = state.clone();
    let (code, mut stream) = tauri::async_runtime::spawn_blocking(move || {
        wait_for_code(listener, &expected_state, my_id)
    })
    .await
    .map_err(|e| format!("Erreur interne : {}", e))??;

    let secret = client_secret.unwrap_or_default();
    let mut params: Vec<(&str, &str)> = vec![
        ("code", code.as_str()),
        ("client_id", client_id.as_str()),
        ("code_verifier", verifier.as_str()),
        ("grant_type", "authorization_code"),
        ("redirect_uri", redirect_uri.as_str()),
    ];
    if !secret.is_empty() {
        params.push(("client_secret", secret.as_str()));
    }

    let outcome = match post_form(TOKEN_ENDPOINT, &params).await {
        Ok((status, body)) => parse_token_response(status, &body),
        Err(e) => Err(e),
    };
    // Annulée (ou remplacée) pendant l'échange du code : ne pas aboutir.
    let outcome = match outcome {
        Ok(_) if ACTIVE_LINK.load(Ordering::SeqCst) != my_id => Err("Liaison annulée.".to_string()),
        other => other,
    };
    match &outcome {
        Ok(_) => respond_result(
            &mut stream,
            true,
            "Compte Google relié à InkFlow. Vous pouvez fermer cet onglet.",
        ),
        Err(e) => respond_result(&mut stream, false, e),
    }
    outcome
}

/// Renouvelle un access_token à partir d'un refresh_token.
/// En cas de `invalid_grant`, le message contient ce mot.
#[tauri::command]
pub async fn gdrive_oauth_refresh(
    client_id: String,
    client_secret: Option<String>,
    refresh_token: String,
) -> Result<serde_json::Value, String> {
    let secret = client_secret.unwrap_or_default();
    let mut params: Vec<(&str, &str)> = vec![
        ("client_id", client_id.trim()),
        ("refresh_token", refresh_token.as_str()),
        ("grant_type", "refresh_token"),
    ];
    if !secret.is_empty() {
        params.push(("client_secret", secret.as_str()));
    }
    let (status, body) = post_form(TOKEN_ENDPOINT, &params).await?;
    parse_token_response(status, &body)
}

/// Révoque un jeton (refresh ou access). Un jeton déjà révoqué (`invalid_token`) est un succès.
#[tauri::command]
pub async fn gdrive_oauth_revoke(token: String) -> Result<(), String> {
    let (status, body) = post_form(REVOKE_ENDPOINT, &[("token", token.as_str())]).await?;
    if (200..300).contains(&status) {
        return Ok(());
    }
    let already_revoked = serde_json::from_str::<serde_json::Value>(&body)
        .ok()
        .and_then(|v| v.get("error").and_then(|e| e.as_str()).map(|e| e == "invalid_token"))
        .unwrap_or(false);
    if already_revoked {
        Ok(())
    } else {
        Err(google_error_message(status, &body))
    }
}

/// Annule la liaison en attente ; `true` si une liaison était en cours.
#[tauri::command]
pub async fn gdrive_oauth_cancel() -> Result<bool, String> {
    Ok(ACTIVE_LINK.swap(0, Ordering::SeqCst) != 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    /// Les tests qui écrivent dans ACTIVE_LINK (global) ne tournent pas en parallèle.
    static LINK_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn pkce_rfc7636_appendix_b() {
        assert_eq!(
            pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn random_token_is_url_safe_and_long_enough() {
        let v = random_token(32).unwrap();
        assert_eq!(v.len(), 43);
        assert!(v.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
        assert_ne!(v, random_token(32).unwrap());
    }

    #[test]
    fn callback_code_and_state() {
        assert_eq!(
            parse_callback_line("GET /?state=abc_-&code=4%2F0Ab%20c&scope=x HTTP/1.1"),
            Callback::Code { code: "4/0Ab c".into(), state: Some("abc_-".into()) }
        );
    }

    #[test]
    fn callback_error() {
        assert_eq!(
            parse_callback_line("GET /?error=access_denied&state=s HTTP/1.1"),
            Callback::Error { error: "access_denied".into(), state: Some("s".into()) }
        );
    }

    #[test]
    fn callback_ignored() {
        assert_eq!(parse_callback_line("GET /favicon.ico HTTP/1.1"), Callback::Ignored);
        assert_eq!(parse_callback_line("GET / HTTP/1.1"), Callback::Ignored);
        assert_eq!(parse_callback_line("GET /?code= HTTP/1.1"), Callback::Ignored);
        assert_eq!(parse_callback_line("POST /?code=x HTTP/1.1"), Callback::Ignored);
        assert_eq!(parse_callback_line(""), Callback::Ignored);
    }

    #[test]
    fn auth_url_contains_all_params() {
        let scope = "https://www.googleapis.com/auth/drive.file openid";
        let s = build_auth_url("id&1.apps", "http://127.0.0.1:5000", scope, "CHAL", "ST").unwrap();
        assert!(s.starts_with("https://accounts.google.com/o/oauth2/v2/auth?"));
        let u = url::Url::parse(&s).unwrap();
        let get = |k: &str| u.query_pairs().find(|(a, _)| a == k).map(|(_, v)| v.into_owned());
        assert_eq!(get("client_id").as_deref(), Some("id&1.apps"));
        assert_eq!(get("redirect_uri").as_deref(), Some("http://127.0.0.1:5000"));
        assert_eq!(get("response_type").as_deref(), Some("code"));
        assert_eq!(get("scope").as_deref(), Some(scope));
        assert_eq!(get("code_challenge").as_deref(), Some("CHAL"));
        assert_eq!(get("code_challenge_method").as_deref(), Some("S256"));
        assert_eq!(get("state").as_deref(), Some("ST"));
        assert_eq!(get("access_type").as_deref(), Some("offline"));
        assert_eq!(get("prompt").as_deref(), Some("consent"));
        assert!(!s.contains(' '));
        assert!(!s.contains("id&1"));
    }

    #[test]
    fn google_errors_are_readable() {
        let m = google_error_message(
            400,
            r#"{"error":"invalid_grant","error_description":"Token has been expired or revoked."}"#,
        );
        assert!(m.contains("invalid_grant") && m.contains("expired or revoked") && m.contains("400"));
        assert!(google_error_message(500, "<html>").contains("HTTP 500"));
    }

    #[test]
    fn token_response_parsing() {
        assert!(parse_token_response(200, r#"{"access_token":"a"}"#).is_ok());
        assert!(parse_token_response(400, r#"{"error":"invalid_grant"}"#)
            .unwrap_err()
            .contains("invalid_grant"));
    }

    #[test]
    fn result_page_escapes_html() {
        let p = result_page(false, "<script>x</script>");
        assert!(!p.contains("<script>x"));
        assert!(http_response("200 OK", &p).contains("charset=utf-8"));
    }

    #[test]
    fn wait_for_code_end_to_end_with_loopback() {
        let _lock = LINK_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        // Simule le navigateur : favicon (404), puis la vraie redirection.
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let port = listener.local_addr().unwrap().port();
        let id = 9_000_001;
        ACTIVE_LINK.store(id, Ordering::SeqCst);
        let client = std::thread::spawn(move || {
            let mut out = Vec::new();
            for path in ["/favicon.ico", "/?code=abc&state=ST"] {
                let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
                write!(s, "GET {} HTTP/1.1\r\nHost: x\r\n\r\n", path).unwrap();
                if path == "/favicon.ico" {
                    let mut r = String::new();
                    s.read_to_string(&mut r).unwrap();
                    out.push(r);
                }
            }
            out
        });
        let (code, _stream) = wait_for_code(listener, "ST", id).unwrap();
        assert_eq!(code, "abc");
        assert!(client.join().unwrap()[0].starts_with("HTTP/1.1 404"));
        ACTIVE_LINK.store(0, Ordering::SeqCst);
    }

    #[test]
    fn wait_for_code_ignores_bad_state_then_accepts_good_code() {
        let _lock = LINK_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let port = listener.local_addr().unwrap().port();
        let id = 9_000_003;
        ACTIVE_LINK.store(id, Ordering::SeqCst);
        let client = std::thread::spawn(move || {
            let mut statuses = Vec::new();
            for path in ["/?error=x", "/?code=evil&state=faux", "/?code=ok&state=ST"] {
                let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
                write!(s, "GET {} HTTP/1.1\r\nHost: x\r\n\r\n", path).unwrap();
                if !path.contains("state=ST") {
                    let mut r = String::new();
                    s.read_to_string(&mut r).unwrap();
                    statuses.push(r.lines().next().unwrap_or("").to_string());
                }
            }
            statuses
        });
        let (code, _stream) = wait_for_code(listener, "ST", id).unwrap();
        assert_eq!(code, "ok");
        for st in client.join().unwrap() {
            assert!(st.contains("400"), "{}", st);
        }
        ACTIVE_LINK.store(0, Ordering::SeqCst);
    }

    #[test]
    fn read_request_line_has_total_deadline() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let client = std::thread::spawn(move || {
            let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
            // Goutte-à-goutte : jamais de fin de ligne.
            for _ in 0..20 {
                if s.write_all(b"G").is_err() {
                    break;
                }
                std::thread::sleep(Duration::from_millis(50));
            }
        });
        let (mut server_side, _) = listener.accept().unwrap();
        let start = Instant::now();
        let line = read_request_line(&mut server_side, Duration::from_millis(300));
        assert!(start.elapsed() < Duration::from_millis(900));
        assert!(line.is_none());
        client.join().unwrap();
    }

    #[test]
    fn wait_for_code_is_cancelled() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        // Le slot actif (0 ou l'autre test) n'est pas 9_000_002 : annulation immédiate.
        let err = wait_for_code(listener, "ST", 9_000_002).unwrap_err();
        assert_eq!(err, "Liaison annulée.");
    }
}
