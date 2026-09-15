#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::async_runtime::spawn_blocking;
use tauri::{Emitter, Window};

const ROUND_PROGRESS_EVENT: &str = "round-progress";

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TestConnectionResult {
    ok: bool,
    offline_mode: bool,
    message: String,
    endpoint: String,
    model: String,
    api_type: Option<String>,
    status: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
struct PythonEventEnvelope {
    event: String,
    payload: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelConfig {
    base_url: String,
    api_key: String,
    model: String,
    api_type: String,
    temperature: f64,
    offline_mode: bool,
    prompt_profile: String,
}

fn resource_root() -> Result<PathBuf, String> {
    let root = std::env::var_os("BAIBAI_RESOURCE_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.."));
    let root = root.canonicalize().map_err(|error| error.to_string())?;
    if !root.join("scripts/app_service.py").is_file() {
        return Err("Set BAIBAI_RESOURCE_ROOT to the installed skill resource directory".to_string());
    }
    Ok(root)
}

fn workspace_root() -> Result<PathBuf, String> {
    if let Some(root) = std::env::var_os("BAIBAI_WORKSPACE_ROOT") {
        let root = PathBuf::from(root).canonicalize().map_err(|error| error.to_string())?;
        if !root.is_dir() { return Err("BAIBAI_WORKSPACE_ROOT must be a directory".to_string()); }
        return Ok(root);
    }
    let cwd = std::env::current_dir().map_err(|error| error.to_string())?
        .canonicalize().map_err(|error| error.to_string())?;
    if cwd.starts_with(resource_root()?) {
        return Err("Set BAIBAI_WORKSPACE_ROOT before starting the desktop app; data must not default to the installation".to_string());
    }
    Ok(cwd)
}

fn script_path(root: &Path, relative_path: &str) -> String {
    serde_json::to_string(&root.join(relative_path).to_string_lossy()).expect("path string serialization")
}

fn python_executable(root: &Path) -> PathBuf {
    let venv_python = root.join(".venv").join("Scripts").join("python.exe");
    if venv_python.exists() {
        return venv_python;
    }
    PathBuf::from("python")
}

fn run_python_json(args: &[String]) -> Result<String, String> {
    let root = workspace_root()?;
    let resources = resource_root()?;
    let python = python_executable(&resources);
    let mut command = Command::new(python);
    command.current_dir(&root);
    command.env("BAIBAI_WORKSPACE_ROOT", &root);
    command.env("PYTHONIOENCODING", "utf-8");
    command.env("PYTHONUTF8", "1");
    command.arg(resources.join("scripts/app_service.py"));
    for arg in args {
        command.arg(arg);
    }
    let output = command.output().map_err(|error| error.to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let message = if !stderr.is_empty() { stderr } else { stdout };
        return Err(if message.is_empty() { "Python command failed".to_string() } else { message });
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn run_python_json_streaming(window: Window, args: &[String]) -> Result<serde_json::Value, String> {
    let root = workspace_root()?;
    let resources = resource_root()?;
    let python = python_executable(&resources);
    let mut command = Command::new(python);
    command.current_dir(&root);
    command.env("BAIBAI_WORKSPACE_ROOT", &root);
    command.env("PYTHONIOENCODING", "utf-8");
    command.env("PYTHONUTF8", "1");
    command.arg(resources.join("scripts/app_service.py"));
    for arg in args {
        command.arg(arg);
    }
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());

    let mut child = command.spawn().map_err(|error| error.to_string())?;
    let stdout = child.stdout.take().ok_or_else(|| "Cannot capture Python stdout".to_string())?;
    let stderr = child.stderr.take().ok_or_else(|| "Cannot capture Python stderr".to_string())?;

    let mut final_payload: Option<serde_json::Value> = None;
    for line in BufReader::new(stdout).lines() {
        let raw_line = line.map_err(|error| error.to_string())?;
        let trimmed = raw_line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let envelope: PythonEventEnvelope = serde_json::from_str(trimmed).map_err(|error| {
            format!("Failed to parse Python event: {error}; line: {trimmed}")
        })?;
        match envelope.event.as_str() {
            "round-progress" => {
                window
                    .emit(ROUND_PROGRESS_EVENT, envelope.payload)
                    .map_err(|error| error.to_string())?;
            }
            "result" => {
                final_payload = Some(envelope.payload);
            }
            "error" => {
                let message = envelope
                    .payload
                    .get("message")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("Python command failed")
                    .to_string();
                return Err(message);
            }
            other => {
                return Err(format!("Unsupported Python event: {other}"));
            }
        }
    }

    let stderr_output = {
        let mut buffer = String::new();
        let mut reader = BufReader::new(stderr);
        loop {
            let mut line = String::new();
            let bytes = reader.read_line(&mut line).map_err(|error| error.to_string())?;
            if bytes == 0 {
                break;
            }
            buffer.push_str(&line);
        }
        buffer.trim().to_string()
    };

    let status = child.wait().map_err(|error| error.to_string())?;
    if !status.success() {
        return Err(if stderr_output.is_empty() {
            "Python command failed".to_string()
        } else {
            stderr_output
        });
    }

    final_payload.ok_or_else(|| "Python command completed without result payload".to_string())
}

fn run_python_inline(code: &str) -> Result<String, String> {
    let root = workspace_root()?;
    let resources = resource_root()?;
    let python = python_executable(&resources);
    let output = Command::new(python)
        .current_dir(&root)
        .env("BAIBAI_WORKSPACE_ROOT", &root)
        .env("PYTHONPATH", resources.join("scripts"))
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1")
        .arg("-c")
        .arg(code)
        .output()
        .map_err(|error| error.to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let message = if !stderr.is_empty() { stderr } else { stdout };
        return Err(if message.is_empty() { "Python command failed".to_string() } else { message });
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
async fn load_model_config() -> Result<ModelConfig, String> {
    spawn_blocking(move || {
        let root = resource_root()?;
        let output = run_python_inline(
            &format!(
                "import json, runpy; module = runpy.run_path({}); print(json.dumps(module['load_app_config'](), ensure_ascii=False))",
                script_path(&root, "scripts/app_config.py")
            ),
        )?;
        serde_json::from_str(&output).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn save_model_config(config: ModelConfig) -> Result<ModelConfig, String> {
    spawn_blocking(move || {
        let root = resource_root()?;
        let config_json = serde_json::to_string(&config).map_err(|error| error.to_string())?;
        let quoted_json = serde_json::to_string(&config_json).map_err(|error| error.to_string())?;
        let output = run_python_inline(&format!(
            "import json, runpy; module = runpy.run_path({}); print(json.dumps(module['save_app_config'](json.loads({})), ensure_ascii=False))",
            script_path(&root, "scripts/app_config.py"),
            quoted_json
        ))?;
        serde_json::from_str(&output).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn test_model_connection(config: ModelConfig) -> Result<TestConnectionResult, String> {
    spawn_blocking(move || {
        let config_json = serde_json::to_string(&config).map_err(|error| error.to_string())?;
        let output = run_python_json(&[
            "test-connection".to_string(),
            config_json,
        ])?;
        serde_json::from_str(&output).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn get_document_status(source_path: String, prompt_profile: String) -> Result<serde_json::Value, String> {
    spawn_blocking(move || {
        let output = run_python_json(&["document-status".to_string(), source_path, prompt_profile])?;
        serde_json::from_str(&output).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn get_document_history(source_path: String) -> Result<serde_json::Value, String> {
    spawn_blocking(move || {
        let output = run_python_json(&["document-history".to_string(), source_path])?;
        serde_json::from_str(&output).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn list_document_histories() -> Result<serde_json::Value, String> {
    spawn_blocking(move || {
        let output = run_python_json(&["document-history-list".to_string()])?;
        serde_json::from_str(&output).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn delete_document_history(doc_id: String, from_round: Option<i32>) -> Result<serde_json::Value, String> {
    spawn_blocking(move || {
        let mut args = vec!["delete-document-history".to_string(), doc_id];
        if let Some(round) = from_round {
            args.push("--from-round".to_string());
            args.push(round.to_string());
        }
        let output = run_python_json(&args)?;
        serde_json::from_str(&output).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn request_stop(source_path: String, prompt_profile: String) -> Result<serde_json::Value, String> {
    spawn_blocking(move || {
        let output = run_python_json(&["request-stop".to_string(), source_path, prompt_profile])?;
        serde_json::from_str(&output).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn run_aigc_round(
    window: Window,
    source_path: String,
    model_config: ModelConfig,
    execution_options: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    spawn_blocking(move || {
        let config_json = serde_json::to_string(&model_config).map_err(|error| error.to_string())?;
        let mut args = vec![
            "run-round".to_string(),
            source_path,
            config_json,
        ];
        if let Some(options) = execution_options {
            args.push("--execution-options-json".to_string());
            args.push(serde_json::to_string(&options).map_err(|error| error.to_string())?);
        }
        run_python_json_streaming(window, &args)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn read_output_text(output_path: String) -> Result<serde_json::Value, String> {
    spawn_blocking(move || {
        let output = run_python_json(&["read-output".to_string(), output_path])?;
        serde_json::from_str(&output).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn read_output_preview(output_path: String, manifest_path: String) -> Result<serde_json::Value, String> {
    spawn_blocking(move || {
        let output = run_python_json(&["read-output-preview".to_string(), output_path, manifest_path])?;
        serde_json::from_str(&output).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn read_source_preview(input_path: String, manifest_path: String, prompt_profile: String) -> Result<serde_json::Value, String> {
    spawn_blocking(move || {
        let output = run_python_json(&["read-source-preview".to_string(), input_path, manifest_path, prompt_profile])?;
        serde_json::from_str(&output).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn export_round_output(output_path: String, export_path: String, target_format: String) -> Result<serde_json::Value, String> {
    spawn_blocking(move || {
        let output = run_python_json(&[
            "export-round".to_string(),
            output_path,
            export_path,
            target_format,
        ])?;
        serde_json::from_str(&output).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            load_model_config,
            save_model_config,
            test_model_connection,
            get_document_status,
            get_document_history,
            list_document_histories,
            delete_document_history,
            request_stop,
            run_aigc_round,
            read_output_text,
            read_output_preview,
            read_source_preview,
            export_round_output,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
