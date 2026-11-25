from __future__ import annotations

import csv
import json
import urllib.request
from pathlib import Path
from typing import Tuple

import numpy as np
import rasterio
import torch
from torch.utils.data import Dataset

from ml.config import (
    CHECKPOINTS_DIR,
    CROP_SIZE,
    DB_MAX,
    DB_MIN,
    SEN1FLOODS11_DIR,
    SEN1FLOODS11_GITHUB_SPLITS,
    SPLITS_DIR,
)


def download_official_splits(splits_dir: Path = SPLITS_DIR) -> dict[str, Path]:
    splits_dir.mkdir(parents=True, exist_ok=True)
    paths: dict[str, Path] = {}
    for split_name, url in SEN1FLOODS11_GITHUB_SPLITS.items():
        dst = splits_dir / f"flood_{split_name}_data.csv"
        if not dst.exists():
            urllib.request.urlretrieve(url, dst)
        paths[split_name] = dst
    return paths


def load_split_pairs(csv_path: Path, data_root: Path = SEN1FLOODS11_DIR) -> list[tuple[Path, Path]]:
    s1_dir = data_root / "S1Hand"
    lbl_dir = data_root / "LabelHand"
    pairs: list[tuple[Path, Path]] = []
    with csv_path.open("r", encoding="utf-8") as fh:
        reader = csv.reader(fh)
        for row in reader:
            if not row or len(row) < 2:
                continue
            s1_name = Path(row[0].strip()).name
            lbl_name = Path(row[1].strip()).name
            s1_path = s1_dir / s1_name
            lbl_path = lbl_dir / lbl_name
            if s1_path.exists() and lbl_path.exists():
                pairs.append((s1_path, lbl_path))
    return pairs


def read_s1_chip(path: Path) -> np.ndarray:
    """Read 2-band S1 VV/VH chip in dB, replace NaNs, and clip to [DB_MIN, DB_MAX]."""
    with rasterio.open(path) as src:
        arr = src.read([1, 2]).astype(np.float32)
    arr = np.where(np.isfinite(arr), arr, DB_MIN)
    arr = np.clip(arr, DB_MIN, DB_MAX)
    return arr


def read_label_chip(path: Path) -> np.ndarray:
    """Read label mask (-1 no-data, 0 non-water, 1 water) as int64."""
    with rasterio.open(path) as src:
        mask = src.read(1).astype(np.int64)
    return mask


def compute_train_stats(
    train_pairs: list[tuple[Path, Path]],
    stats_path: Path = CHECKPOINTS_DIR / "norm_stats.json",
) -> Tuple[np.ndarray, np.ndarray]:
    """Compute per-channel mean and std strictly on the training split."""
    if not train_pairs:
        raise RuntimeError("No Sen1Floods11 training chips found. Run 01_get_sen1floods11.ipynb first.")

    channel_sum = np.zeros(2, dtype=np.float64)
    channel_sq_sum = np.zeros(2, dtype=np.float64)
    pixel_count = np.zeros(2, dtype=np.int64)

    for s1_path, lbl_path in train_pairs:
        arr = read_s1_chip(s1_path)
        lbl = read_label_chip(lbl_path)
        valid = lbl != -1
        for c in range(2):
            vals = arr[c][valid]
            if vals.size > 0:
                channel_sum[c] += float(vals.sum())
                channel_sq_sum[c] += float(np.square(vals, dtype=np.float64).sum())
                pixel_count[c] += int(vals.size)

    mean = (channel_sum / np.maximum(pixel_count, 1)).astype(np.float32)
    var = (channel_sq_sum / np.maximum(pixel_count, 1)) - np.square(mean, dtype=np.float64)
    std = np.sqrt(np.maximum(var, 1e-6)).astype(np.float32)

    stats_path.parent.mkdir(parents=True, exist_ok=True)
    stats_path.write_text(
        json.dumps({"mean": mean.tolist(), "std": std.tolist(), "db_min": DB_MIN, "db_max": DB_MAX}, indent=2),
        encoding="utf-8",
    )
    return mean, std


def load_norm_stats(stats_path: Path = CHECKPOINTS_DIR / "norm_stats.json") -> Tuple[np.ndarray, np.ndarray]:
    if not stats_path.exists():
        raise FileNotFoundError(f"Normalization stats not found at {stats_path}. Run training first.")
    data = json.loads(stats_path.read_text(encoding="utf-8"))
    return np.array(data["mean"], dtype=np.float32), np.array(data["std"], dtype=np.float32)


class Sen1Floods11Dataset(Dataset):
    """PyTorch Dataset for Sen1Floods11 v1.1 hand-labeled chips."""

    def __init__(
        self,
        pairs: list[tuple[Path, Path]],
        mean: np.ndarray,
        std: np.ndarray,
        augment: bool = False,
        crop_size: int = CROP_SIZE,
        seed: int = 42,
    ) -> None:
        self.pairs = pairs
        self.mean = mean.reshape(2, 1, 1)
        self.std = std.reshape(2, 1, 1)
        self.augment = augment
        self.crop_size = crop_size
        self.rng = np.random.default_rng(seed)

    def __len__(self) -> int:
        return len(self.pairs)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        s1_path, lbl_path = self.pairs[idx]
        image = read_s1_chip(s1_path)  # (2, H, W)
        mask = read_label_chip(lbl_path)  # (H, W)

        image = (image - self.mean) / self.std

        if self.augment:
            _, h, w = image.shape
            if h > self.crop_size and w > self.crop_size:
                top = int(self.rng.integers(0, h - self.crop_size + 1))
                left = int(self.rng.integers(0, w - self.crop_size + 1))
                image = image[:, top : top + self.crop_size, left : left + self.crop_size]
                mask = mask[top : top + self.crop_size, left : left + self.crop_size]

            if self.rng.random() < 0.5:
                image = np.flip(image, axis=2).copy()
                mask = np.flip(mask, axis=1).copy()
            if self.rng.random() < 0.5:
                image = np.flip(image, axis=1).copy()
                mask = np.flip(mask, axis=0).copy()

            k = int(self.rng.integers(0, 4))
            if k > 0:
                image = np.rot90(image, k=k, axes=(1, 2)).copy()
                mask = np.rot90(mask, k=k, axes=(0, 1)).copy()

        return torch.from_numpy(image).float(), torch.from_numpy(mask).long()
