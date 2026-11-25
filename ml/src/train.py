from __future__ import annotations

import json
import random
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader
from tqdm import tqdm

from ml.config import (
    BACKEND_DATA_DIR,
    BATCH_SIZE,
    CHECKPOINTS_DIR,
    EARLY_STOP_PATIENCE,
    EPOCHS,
    LEARNING_RATE,
    NUM_WORKERS,
    SEED,
    WEIGHT_DECAY,
)
from ml.src.dataset import (
    Sen1Floods11Dataset,
    compute_train_stats,
    download_official_splits,
    load_split_pairs,
)
from ml.src.model import MaskedBCEDiceLoss, build_flood_unet


def set_seed(seed: int = SEED) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def compute_batch_counts(logits: torch.Tensor, targets: torch.Tensor, threshold: float = 0.5) -> tuple[int, int, int]:
    probs = torch.sigmoid(logits.squeeze(1))
    preds = probs >= threshold
    valid = targets != -1
    t_pos = (targets == 1) & valid
    p_pos = preds & valid

    tp = int((p_pos & t_pos).sum().item())
    fp = int((p_pos & ~t_pos).sum().item())
    fn = int((~p_pos & t_pos).sum().item())
    return tp, fp, fn


def train_model() -> Path:
    set_seed(SEED)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Training GeoTerra U-Net on device: {device}")

    split_csvs = download_official_splits()
    train_pairs = load_split_pairs(split_csvs["train"])
    val_pairs = load_split_pairs(split_csvs["valid"])
    if not train_pairs or not val_pairs:
        raise RuntimeError("Sen1Floods11 train/valid pairs missing. Run 01_get_sen1floods11.ipynb first.")

    mean, std = compute_train_stats(train_pairs)
    train_ds = Sen1Floods11Dataset(train_pairs, mean, std, augment=True, seed=SEED)
    val_ds = Sen1Floods11Dataset(val_pairs, mean, std, augment=False, seed=SEED)

    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True, num_workers=NUM_WORKERS, pin_memory=True)
    val_loader = DataLoader(val_ds, batch_size=4, shuffle=False, num_workers=NUM_WORKERS, pin_memory=True)

    model = build_flood_unet(encoder_weights="imagenet").to(device)
    criterion = MaskedBCEDiceLoss(bce_weight=0.5, dice_weight=0.5)
    optimizer = torch.optim.AdamW(model.parameters(), lr=LEARNING_RATE, weight_decay=WEIGHT_DECAY)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="max", factor=0.5, patience=2)
    scaler = torch.cuda.amp.GradScaler(enabled=device.type == "cuda")

    best_iou = -1.0
    best_epoch = 0
    epochs_without_improve = 0
    history: list[dict[str, float | int]] = []
    ckpt_path = CHECKPOINTS_DIR / "best_model.pt"

    for epoch in range(1, EPOCHS + 1):
        model.train()
        train_loss_sum = 0.0
        for imgs, masks in tqdm(train_loader, desc=f"Epoch {epoch}/{EPOCHS} [train]", leave=False):
            imgs, masks = imgs.to(device), masks.to(device)
            optimizer.zero_grad(set_to_none=True)
            with torch.cuda.amp.autocast(enabled=device.type == "cuda"):
                logits = model(imgs)
                loss = criterion(logits, masks)
            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()
            train_loss_sum += float(loss.item()) * imgs.size(0)

        train_loss = train_loss_sum / max(len(train_ds), 1)

        model.eval()
        val_loss_sum = 0.0
        tp_sum = fp_sum = fn_sum = 0
        with torch.no_grad():
            for imgs, masks in val_loader:
                imgs, masks = imgs.to(device), masks.to(device)
                with torch.cuda.amp.autocast(enabled=device.type == "cuda"):
                    logits = model(imgs)
                    loss = criterion(logits, masks)
                val_loss_sum += float(loss.item()) * imgs.size(0)
                tp, fp, fn = compute_batch_counts(logits, masks)
                tp_sum += tp
                fp_sum += fp
                fn_sum += fn

        val_loss = val_loss_sum / max(len(val_ds), 1)
        val_iou = tp_sum / max(tp_sum + fp_sum + fn_sum, 1)
        val_f1 = (2 * tp_sum) / max(2 * tp_sum + fp_sum + fn_sum, 1)

        scheduler.step(val_iou)
        history.append(
            {
                "epoch": epoch,
                "train_loss": round(train_loss, 4),
                "val_loss": round(val_loss, 4),
                "val_iou": round(val_iou, 4),
                "val_f1": round(val_f1, 4),
            }
        )
        print(
            f"Epoch {epoch:02d} | train_loss={train_loss:.4f} val_loss={val_loss:.4f} "
            f"val_iou={val_iou:.4f} val_f1={val_f1:.4f}"
        )

        if val_iou > best_iou:
            best_iou = val_iou
            best_epoch = epoch
            epochs_without_improve = 0
            torch.save(
                {
                    "epoch": epoch,
                    "val_iou": val_iou,
                    "val_f1": val_f1,
                    "model_state_dict": model.state_dict(),
                    "mean": mean.tolist(),
                    "std": std.tolist(),
                },
                ckpt_path,
            )
        else:
            epochs_without_improve += 1
            if epochs_without_improve >= EARLY_STOP_PATIENCE:
                print(f"Early stopping at epoch {epoch} (best epoch {best_epoch}, IoU {best_iou:.4f}).")
                break

    log_payload = {
        "sample": False,
        "epochs": history,
        "best_epoch": best_epoch,
        "best_val_iou": round(best_iou, 4),
    }
    (CHECKPOINTS_DIR / "training_log.json").write_text(json.dumps(log_payload, indent=2), encoding="utf-8")
    (BACKEND_DATA_DIR / "training_log.json").write_text(json.dumps(log_payload, indent=2), encoding="utf-8")
    return ckpt_path


if __name__ == "__main__":
    train_model()
