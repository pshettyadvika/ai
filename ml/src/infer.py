from __future__ import annotations

from pathlib import Path

import numpy as np
import torch

from ml.config import CHECKPOINTS_DIR, FLOOD_PROB_THRESHOLD, INFER_PATCH_SIZE, INFER_STRIDE
from ml.src.model import build_flood_unet


def _blend_window(size: int) -> np.ndarray:
    w1d = np.hanning(size + 2)[1:-1].astype(np.float32)
    w2d = np.outer(w1d, w1d)
    return np.maximum(w2d, 1e-3)


def sliding_window_flood_inference(
    s1_db_stack: np.ndarray,
    ckpt_path: Path = CHECKPOINTS_DIR / "best_model.pt",
    patch_size: int = INFER_PATCH_SIZE,
    stride: int = INFER_STRIDE,
    prob_threshold: float = FLOOD_PROB_THRESHOLD,
) -> tuple[np.ndarray, np.ndarray]:
    """Run overlapping 256x256 U-Net inference with Hann blending across a large S1-RTC mosaic."""
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    ckpt = torch.load(ckpt_path, map_location=device)
    mean = np.array(ckpt["mean"], dtype=np.float32).reshape(2, 1, 1)
    std = np.array(ckpt["std"], dtype=np.float32).reshape(2, 1, 1)

    model = build_flood_unet(encoder_weights=None).to(device)
    model.load_state_dict(ckpt["model_state_dict"])
    model.eval()

    norm_img = (s1_db_stack - mean) / std
    _, h, w = norm_img.shape
    pad_h = max(patch_size - h, 0) + (stride - (max(h - patch_size, 0) % stride)) % stride
    pad_w = max(patch_size - w, 0) + (stride - (max(w - patch_size, 0) % stride)) % stride
    padded = np.pad(norm_img, ((0, 0), (0, pad_h), (0, pad_w)), mode="reflect")
    _, ph, pw = padded.shape

    prob_accum = np.zeros((ph, pw), dtype=np.float32)
    weight_accum = np.zeros((ph, pw), dtype=np.float32)
    window = _blend_window(patch_size)

    with torch.no_grad():
        for y in range(0, ph - patch_size + 1, stride):
            batch_patches = []
            xs = list(range(0, pw - patch_size + 1, stride))
            for x in xs:
                batch_patches.append(padded[:, y : y + patch_size, x : x + patch_size])
            batch_tensor = torch.from_numpy(np.stack(batch_patches, axis=0)).float().to(device)
            logits = model(batch_tensor).squeeze(1)
            probs = torch.sigmoid(logits).cpu().numpy()
            for idx, x in enumerate(xs):
                prob_accum[y : y + patch_size, x : x + patch_size] += probs[idx] * window
                weight_accum[y : y + patch_size, x : x + patch_size] += window

    prob_map = (prob_accum / np.maximum(weight_accum, 1e-6))[:h, :w]
    binary_mask = (prob_map >= prob_threshold).astype(np.uint8)
    return binary_mask, prob_map
