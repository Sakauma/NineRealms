use std::{io::Write, path::Path};
use crate::policy::valid_export_name;

pub const MAX_EXPORT_BYTES: usize = 16 * 1024 * 1024;

fn valid_json(contents: &str) -> bool {
    contents.len() <= MAX_EXPORT_BYTES && serde_json::from_str::<serde_json::Value>(contents).is_ok()
}

pub fn validate_request(contents: &str, filename: &str) -> Result<(), String> {
    if !valid_export_name(filename) || !valid_json(contents) {
        return Err("导出文件格式或大小无效。".into());
    }
    Ok(())
}

pub fn save_selected(path: &Path, contents: &str) -> Result<(), String> {
    if !valid_json(contents) || path.extension().and_then(|s| s.to_str()).map_or(true, |s| !s.eq_ignore_ascii_case("json")) {
        return Err("请使用有效的 JSON 文件。".into());
    }
    let parent = path.parent().ok_or("保存位置无效。")?;
    let mut pending = tempfile::NamedTempFile::new_in(parent).map_err(|_| "无法在所选位置创建文件。".to_string())?;
    pending.write_all(contents.as_bytes()).map_err(|_| "备份写入未完成。".to_string())?;
    pending.as_file().sync_all().map_err(|_| "备份写入未完成。".to_string())?;
    pending.persist(path).map_err(|_| "备份保存未完成，请检查文件权限。".to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_and_replaces_only_selected_json_after_validation() {
        let folder = tempfile::tempdir().unwrap();
        let selected = folder.path().join("chosen.json");
        save_selected(&selected, "{\"save\":1}").unwrap();
        save_selected(&selected, "{\"save\":2}").unwrap();
        assert_eq!(std::fs::read_to_string(&selected).unwrap(), "{\"save\":2}");
        assert!(save_selected(&selected, "bad JSON").is_err());
        assert_eq!(std::fs::read_to_string(&selected).unwrap(), "{\"save\":2}");
        assert_eq!(std::fs::read_dir(folder.path()).unwrap().count(), 1);
    }

    #[test]
    fn bad_requests_never_create_or_truncate_an_export() {
        let folder = tempfile::tempdir().unwrap();
        let existing = folder.path().join("keep.json");
        std::fs::write(&existing, "{\"old\":true}").unwrap();
        assert!(validate_request("{}", "../Nine-Realms-backup.json").is_err());
        assert!(validate_request(&" ".repeat(MAX_EXPORT_BYTES + 1), "Nine-Realms-backup.json").is_err());
        assert!(save_selected(&folder.path().join("missing/new.json"), "{}").is_err());
        assert!(save_selected(&folder.path().join("unsafe.exe"), "{}").is_err());
        assert_eq!(std::fs::read_to_string(existing).unwrap(), "{\"old\":true}");
        assert_eq!(std::fs::read_dir(folder.path()).unwrap().count(), 1);
    }
}
