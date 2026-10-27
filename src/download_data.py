"""Download India state electricity demand and weather data from Zenodo.

Dataset: "Daily electricity demand data for Indian states, 2014-2024"
Authors: Hunt & Bloomfield (2025)
Zenodo Record: https://zenodo.org/records/14983362
API Endpoint:  https://zenodo.org/api/records/14983362

Downloads into data/raw/:
- Corrected daily energy met file(s) (corrected_daily_energy_met_MU.csv)
- Corrected peak demand file(s) (corrected_peak_met_MW.csv)
- Per-state daily meteorology files (36 state/UT CSVs)

Skips uncorrected demand files, national aggregate UTCI, and any zip archives.
Skips already-downloaded files whose MD5 checksum matches the Zenodo API.
"""

import hashlib
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

RECORD_ID = "14983362"
API_URL = f"https://zenodo.org/api/records/{RECORD_ID}"
RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"
USER_AGENT = "IndiaDemandForecasting/1.0 (https://zenodo.org/records/14983362)"

# Non-state aggregate or uncorrected files to exclude
EXCLUDED_FILES = {
    "daily_energy_met_MU.csv",          # uncorrected energy met
    "peak_met_MW.csv",                  # uncorrected peak met
    "peak_unmet_MW.csv",                # uncorrected peak unmet
    "weighted_daily_mean_utci_india.csv",  # national aggregate, not per-state
}


def compute_md5(file_path: Path, chunk_size: int = 1024 * 1024) -> str:
    """Compute the hex MD5 checksum of a local file."""
    md5 = hashlib.md5()
    with open(file_path, "rb") as f:
        while chunk := f.read(chunk_size):
            md5.update(chunk)
    return md5.hexdigest()


def format_size(num_bytes: int) -> str:
    """Format byte count into a human-readable string."""
    if num_bytes >= 1024 * 1024:
        return f"{num_bytes / (1024 * 1024):.2f} MB ({num_bytes:,} B)"
    if num_bytes >= 1024:
        return f"{num_bytes / 1024:.1f} KB ({num_bytes:,} B)"
    return f"{num_bytes:,} B"


def classify_file(filename: str) -> tuple[bool, str]:
    """Return (should_download, category_label) for a Zenodo file key."""
    if filename.endswith(".zip"):
        return False, "skip (zip archive; prefer individual files)"
    if filename in EXCLUDED_FILES:
        return False, "skip (uncorrected / national aggregate)"
    if not filename.endswith(".csv"):
        return False, "skip (non-CSV file)"
    if filename.startswith("corrected_") and "energy" in filename:
        return True, "corrected daily energy"
    if filename.startswith("corrected_") and "peak" in filename:
        return True, "corrected peak demand"
    return True, "per-state weather"


def fetch_record_metadata(retries: int = 5) -> dict:
    """Fetch JSON metadata from the Zenodo API with exponential backoff."""
    req = urllib.request.Request(API_URL, headers={"User-Agent": USER_AGENT})
    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as exc:
            if attempt == retries:
                raise RuntimeError(f"Failed to fetch Zenodo API after {retries} attempts: {exc}") from exc
            wait = 2 * attempt
            print(f"  [retry {attempt}/{retries}] API error ({exc}), waiting {wait}s...")
            time.sleep(wait)
    return {}


def download_with_progress(url: str, dest: Path, expected_size: int, expected_md5: str, retries: int = 5) -> None:
    """Download a file from Zenodo, display progress, and verify MD5."""
    temp_dest = dest.with_suffix(dest.suffix + ".part")

    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            md5 = hashlib.md5()
            downloaded = 0
            chunk_size = 256 * 1024  # 256 KB

            with urllib.request.urlopen(req, timeout=60) as resp, open(temp_dest, "wb") as out:
                while chunk := resp.read(chunk_size):
                    out.write(chunk)
                    md5.update(chunk)
                    downloaded += len(chunk)
                    if sys.stdout.isatty() and expected_size > 0:
                        pct = (downloaded / expected_size) * 100
                        filled = int(20 * downloaded // expected_size)
                        bar = "#" * filled + "-" * (20 - filled)
                        print(f"\r       [{bar}] {pct:5.1f}% ({downloaded:,}/{expected_size:,} B)", end="", flush=True)

            if sys.stdout.isatty():
                print()
            elif expected_size > 0:
                print(f"       [####################] 100.0% ({downloaded:,}/{expected_size:,} B)", flush=True)

            actual_md5 = md5.hexdigest()
            if expected_md5 and actual_md5 != expected_md5:
                temp_dest.unlink(missing_ok=True)
                raise ValueError(f"MD5 mismatch for {dest.name}: expected {expected_md5}, got {actual_md5}")

            temp_dest.replace(dest)
            return

        except Exception as exc:
            temp_dest.unlink(missing_ok=True)
            if attempt == retries:
                raise RuntimeError(f"Failed to download {dest.name} after {retries} attempts: {exc}") from exc
            wait = 2 * attempt
            print(f"    [retry {attempt}/{retries}] Error downloading {dest.name} ({exc}), waiting {wait}s...")
            time.sleep(wait)


def main() -> None:
    print(f"Fetching file list from Zenodo API: {API_URL}")
    record = fetch_record_metadata()
    files = sorted(record.get("files", []), key=lambda f: f.get("key", ""))

    print(f"\nFound {len(files)} files in Zenodo record {RECORD_ID}:")
    print("-" * 88)
    print(f"{'Filename':<38} | {'Size':<24} | {'Action / Category'}")
    print("-" * 88)

    selected_files = []
    for f in files:
        key = f["key"]
        size = f.get("size", 0)
        keep, category = classify_file(key)
        status = f"DOWNLOAD ({category})" if keep else category
        print(f"{key:<38} | {format_size(size):<24} | {status}")
        if keep:
            selected_files.append((f, category))

    print("-" * 88)
    total_bytes = sum(f["size"] for f, _ in selected_files)
    print(f"Selected {len(selected_files)} / {len(files)} files to download ({format_size(total_bytes)} total).\n")

    RAW_DIR.mkdir(parents=True, exist_ok=True)

    downloaded_count = 0
    skipped_count = 0

    for idx, (f, category) in enumerate(selected_files, start=1):
        key = f["key"]
        size = f.get("size", 0)
        raw_checksum = f.get("checksum", "")
        expected_md5 = raw_checksum.split(":", 1)[1] if raw_checksum.startswith("md5:") else raw_checksum
        url = f.get("links", {}).get("self") or f"https://zenodo.org/api/records/{RECORD_ID}/files/{key}/content"
        dest = RAW_DIR / key

        if dest.exists():
            local_md5 = compute_md5(dest)
            if not expected_md5 or local_md5 == expected_md5:
                print(f"[{idx:02d}/{len(selected_files):02d}] SKIP {key} (exists, MD5 verified: {local_md5})")
                skipped_count += 1
                continue
            print(f"[{idx:02d}/{len(selected_files):02d}] RE-DOWNLOAD {key} (existing file MD5 mismatch)")

        print(f"[{idx:02d}/{len(selected_files):02d}] DOWNLOAD {key} ({format_size(size)}, {category}) ...", flush=True)
        download_with_progress(url, dest, size, expected_md5)
        print(f"       Verified MD5: {expected_md5}", flush=True)
        downloaded_count += 1

    print(
        f"\nDone! {len(selected_files)} files ready in {RAW_DIR} "
        f"({downloaded_count} downloaded, {skipped_count} skipped as already verified)."
    )


if __name__ == "__main__":
    main()
