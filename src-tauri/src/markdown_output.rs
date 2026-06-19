use std::path::{Path, PathBuf};

pub(crate) fn safe_file_name(value: &str) -> String {
    let mut safe = value
        .chars()
        .map(|character| match character {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' => character,
            ' ' | '.' => '-',
            _ => '-',
        })
        .collect::<String>()
        .trim_matches('-')
        .to_ascii_lowercase();
    if safe.is_empty() {
        safe = "copicu-output".to_string();
    }
    if safe.len() > 80 {
        safe.truncate(80);
        safe = safe.trim_matches('-').to_string();
    }
    if !safe.ends_with(".md") {
        safe.push_str(".md");
    }
    safe
}

pub(crate) fn unique_path(dir: &Path, file_name: &str) -> PathBuf {
    let initial = dir.join(file_name);
    if !initial.exists() {
        return initial;
    }
    let stem = file_name.strip_suffix(".md").unwrap_or(file_name);
    for index in 2..1000 {
        let candidate = dir.join(format!("{stem}-{index}.md"));
        if !candidate.exists() {
            return candidate;
        }
    }
    dir.join(format!("{stem}-latest.md"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_file_name_sanitizes_and_adds_markdown_extension() {
        assert_eq!(
            safe_file_name("My Project: Summary.md"),
            "my-project--summary-md.md"
        );
        assert_eq!(safe_file_name("***"), "copicu-output.md");
    }

    #[test]
    fn safe_file_name_truncates_long_values() {
        let name = safe_file_name(&"a".repeat(120));
        assert!(name.ends_with(".md"));
        assert!(name.len() <= 83);
    }

    #[test]
    fn unique_path_adds_suffix_when_file_exists() {
        let dir = std::env::temp_dir().join(format!(
            "copicu-markdown-output-test-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("temp dir");
        std::fs::write(dir.join("report.md"), "one").expect("first file");

        assert_eq!(unique_path(&dir, "report.md"), dir.join("report-2.md"));

        let _ = std::fs::remove_dir_all(&dir);
    }
}
