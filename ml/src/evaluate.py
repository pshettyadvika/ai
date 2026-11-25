from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader

from ml.config import BACKEND_DATA_DIR, CHECKPOINTS_DIR, SEED
from ml.src.dataset import (
    Sen1Floods11Dataset,
    download_official_splits,
    load_norm_stats,
    load_split_pairs,
    read_label_chip,
    read_s1_chip,
)
from ml.src.model import build_flood_unet


def _confusion_from_counts(tp: int, fp: int, fn: int, tn: int) -> dict[str, float | dict[str, int]]:
    iou = tp / max(tp + fp + fn, 1)
    f1 = (2 * tp) / max(2 * tp + fp + fn, 1)
    precision = tp / max(tp + fp, 1)
    recall = tp / max(tp + fn, 1)
    return {
        "iou": round(iou, 4),
        "f1": round(f1, 4),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "confusion_matrix": {"tn": tn, "fp": fp, "fn": fn, "tp": tp},
    }


def tune_vh_threshold_on_val(val_pairs: list[tuple[Path, Path]]) -> float:
    """Grid-search optimal VH dB water threshold strictly on the validation split."""
    candidates = np.arange(-24.0, -10.5, 0.5)
    best_thr = -16.5
    best_iou = -1.0

    for thr in candidates:
        tp = fp = fn = 0
        for s1_path, lbl_path in val_pairs:
            arr = read_s1_chip(s1_path)
            vh = arr[1]
            lbl = read_label_chip(lbl_path)
            valid = lbl != -1
            pred = (vh < thr) & valid
            t_pos = (lbl == 1) & valid
            tp += int((pred & t_pos).sum())
            fp += int((pred & ~t_pos).sum())
            fn += int((~pred & t_pos).sum())
        iou = tp / max(tp + fp + fn, 1)
        if iou > best_iou:
            best_iou = iou
            best_thr = float(thr)

    return round(best_thr, 2)


def eval_vh_baseline(pairs: list[tuple[Path, Path]], threshold_db: float) -> dict[str, float | dict[str, int]]:
    tp = fp = fn = tn = 0
    for s1_path, lbl_path in pairs:
        vh = read_s1_chip(s1_path)[1]
        lbl = read_label_chip(lbl_path)
        valid = lbl != -1
        pred = (vh < threshold_db) & valid
        t_pos = (lbl == 1) & valid
        tp += int((pred & t_pos).sum())
        fp += int((pred & ~t_pos).sum())
        fn += int((~pred & t_pos).sum())
        tn += int((~pred & ~t_pos & valid).sum())
    return _confusion_from_counts(tp, fp, fn, tn)


def eval_unet_split(
    model: torch.nn.Module,
    pairs: list[tuple[Path, Path]],
    mean: np.ndarray,
    std: np.ndarray,
    device: torch.device,
) -> dict[str, float | dict[str, int]]:
    ds = Sen1Floods11Dataset(pairs, mean, std, augment=False, seed=SEED)
    loader = DataLoader(ds, batch_size=4, shuffle=False)
    model.eval()
    tp = fp = fn = tn = 0

    with torch.no_grad():
        for imgs, masks in loader:
            imgs = imgs.to(device)
            probs = torch.sigmoid(model(imgs).squeeze(1)).cpu().numpy()
            masks_np = masks.numpy()
            valid = masks_np != -1
            preds = (probs >= 0.5) & valid
            t_pos = (masks_np == 1) & valid
            tp += int((preds & t_pos).sum())
            fp += int((preds & ~t_pos).sum())
            fn += int((~preds & t_pos).sum())
            tn += int((~preds & ~t_pos & valid).sum())

    return _confusion_from_counts(tp, fp, fn, tn)


def run_evaluation(ckpt_path: Path = CHECKPOINTS_DIR / "best_model.pt") -> dict:
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    split_csvs = download_official_splits()
    train_pairs = load_split_pairs(split_csvs["train"])
    val_pairs = load_split_pairs(split_csvs["valid"])
    test_pairs = load_split_pairs(split_csvs["test"])
    bolivia_pairs = load_split_pairs(split_csvs["bolivia"])

    vh_thr = tune_vh_threshold_on_val(val_pairs)
    base_val = eval_vh_baseline(val_pairs, vh_thr)
    base_test = eval_vh_baseline(test_pairs, vh_thr)
    base_bolivia = eval_vh_baseline(bolivia_pairs, vh_thr)

    mean, std = load_norm_stats()
    model = build_flood_unet(encoder_weights=None).to(device)
    ckpt = torch.load(ckpt_path, map_location=device)
    model.load_state_dict(ckpt["model_state_dict"])

    unet_val = eval_unet_split(model, val_pairs, mean, std, device)
    unet_test = eval_unet_split(model, test_pairs, mean, std, device)
    unet_bolivia = eval_unet_split(model, bolivia_pairs, mean, std, device)

    model_card = {
        "sample": False,
        "model_name": "GeoTerra-FloodSAR-UNet-ResNet34",
        "architecture": "segmentation_models_pytorch.Unet(encoder_name='resnet34', encoder_weights='imagenet', in_channels=2, classes=1)",
        "input_channels": [
            "Sentinel-1 VV (dB, clipped -30 to +5, train-normalized)",
            "Sentinel-1 VH (dB, clipped -30 to +5, train-normalized)",
        ],
        "loss_function": "0.5 * MaskedBCEWithLogitsLoss + 0.5 * MaskedDiceLoss (ignoring -1 no-data pixels)",
        "dataset": {
            "name": "Sen1Floods11 v1.1 Hand-Labeled Subset",
            "chips_total": len(train_pairs) + len(val_pairs) + len(test_pairs) + len(bolivia_pairs),
            "chip_size": "512x512",
            "crs": "EPSG:4326",
            "citation": "Bonafilia, D., Tellman, B., Anderson, T., & Issenberg, E. (2020). Sen1Floods11: A georeferenced dataset to train and test deep learning flood algorithms for Sentinel-1. CVPR Workshops.",
            "splits": {
                "train": len(train_pairs),
                "valid": len(val_pairs),
                "test": len(test_pairs),
                "bolivia_holdout": len(bolivia_pairs),
            },
        },
        "baseline": {
            "name": "Otsu/Tuned VH Backscatter Threshold",
            "tuned_threshold_vh_db": vh_thr,
            "tuned_on": "validation split only",
        },
        "metrics": {
            "validation": {
                "unet_iou": unet_val["iou"],
                "unet_f1": unet_val["f1"],
                "unet_precision": unet_val["precision"],
                "unet_recall": unet_val["recall"],
                "baseline_iou": base_val["iou"],
                "baseline_f1": base_val["f1"],
            },
            "test": {
                "unet_iou": unet_test["iou"],
                "unet_f1": unet_test["f1"],
                "unet_precision": unet_test["precision"],
                "unet_recall": unet_test["recall"],
                "baseline_iou": base_test["iou"],
                "baseline_f1": base_test["f1"],
                "confusion_matrix": unet_test["confusion_matrix"],
            },
            "bolivia_holdout": {
                "unet_iou": unet_bolivia["iou"],
                "unet_f1": unet_bolivia["f1"],
                "unet_precision": unet_bolivia["precision"],
                "unet_recall": unet_bolivia["recall"],
                "baseline_iou": base_bolivia["iou"],
                "baseline_f1": base_bolivia["f1"],
                "confusion_matrix": unet_bolivia["confusion_matrix"],
            },
            "karnataka_inference": {
                "validated": False,
                "note": "No ground-truth flood labels exist for this Karnataka window. Outputs are labeled 'Model prediction (unvalidated)'.",
            },
        },
        "limitations": [
            "Urban double-bounce radar reflections from dense Bengaluru buildings can mask street-level water.",
            "Terrain radar shadow in steep slopes or quarry walls can resemble dark specular water.",
            "Domain shift between Sen1Floods11 GRD scenes and Planetary Computer Sentinel-1 RTC scenes.",
            "Heavy canopy vegetation attenuates C-band SAR penetration under flooded tree cover.",
        ],
    }

    (CHECKPOINTS_DIR / "model_card.json").write_text(json.dumps(model_card, indent=2), encoding="utf-8")
    (BACKEND_DATA_DIR / "model_card.json").write_text(json.dumps(model_card, indent=2), encoding="utf-8")
    return model_card


if __name__ == "__main__":
    run_evaluation()
