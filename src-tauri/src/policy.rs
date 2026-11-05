use tauri::Url;

#[derive(Clone)]
pub struct NavigationPolicy {
    windows: bool,
    dev: Option<Url>,
}

impl NavigationPolicy {
    pub fn new(windows: bool, dev: Option<Url>) -> Self {
        let dev = dev.filter(|url| {
            matches!(url.scheme(), "http" | "https")
                && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"))
                && url.username().is_empty()
                && url.password().is_none()
                && matches!(url.path(), "/" | "/index.html")
        });
        Self { windows, dev }
    }

    pub fn allows(&self, url: &Url) -> bool {
        if !url.username().is_empty() || url.password().is_some()
            || !matches!(url.path(), "/" | "/index.html") {
            return false;
        }
        let production = url.port().is_none() && if self.windows {
            url.scheme() == "https" && url.host_str() == Some("tauri.localhost")
        } else {
            url.scheme() == "tauri" && url.host_str() == Some("localhost")
        };
        production || self.dev.as_ref().is_some_and(|dev| url.origin() == dev.origin())
    }
}

pub fn valid_export_name(name: &str) -> bool {
    name.len() <= 160 && name.starts_with("Nine-Realms-") && name.ends_with(".json")
        && name.bytes().all(|c| c.is_ascii_alphanumeric() || b"-_.".contains(&c))
        && !name.contains("..")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_exact_bundled_document_or_explicit_loopback_dev_origin() {
        for windows in [false, true] {
            let p = NavigationPolicy::new(windows, None);
            let base = if windows { "https://tauri.localhost" } else { "tauri://localhost" };
            for path in ["/", "/index.html", "/index.html?restore=1#board"] {
                assert!(p.allows(&Url::parse(&format!("{base}{path}")).unwrap()));
            }
            for bad in ["https://example.com/", "http://tauri.localhost/", "https://tauri.localhost.evil/", "https://tauri.localhost:444/", "https://user@tauri.localhost/", "https://tauri.localhost/other.html", "file:///tmp/index.html", "data:text/html,hello", "javascript:alert(1)"] {
                assert!(!p.allows(&Url::parse(bad).unwrap()), "{bad}");
            }
        }
        let dev = NavigationPolicy::new(true, Some(Url::parse("http://127.0.0.1:1430/").unwrap()));
        assert!(dev.allows(&Url::parse("http://127.0.0.1:1430/index.html?reload=1").unwrap()));
        assert!(!dev.allows(&Url::parse("http://127.0.0.1:1431/").unwrap()));
        assert!(!dev.allows(&Url::parse("http://localhost:1430/").unwrap()));
        let remote = NavigationPolicy::new(true, Some(Url::parse("https://example.com/").unwrap()));
        assert!(!remote.allows(&Url::parse("https://example.com/").unwrap()));
    }

    #[test]
    fn exports_are_json_basenames_not_caller_supplied_paths() {
        assert!(valid_export_name("Nine-Realms-backup-2026-11-02.json"));
        assert!(valid_export_name("Nine-Realms-recovery-log.json"));
        for bad in ["../Nine-Realms-backup.json", "Nine-Realms-../backup.json", "C:\\Nine-Realms-backup.json", "Nine-Realms-backup.exe", "other.json", "Nine-Realms-backup.json\0"] {
            assert!(!valid_export_name(bad));
        }
    }
}
