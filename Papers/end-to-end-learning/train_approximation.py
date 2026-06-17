#!/usr/bin/env python3
"""
Universal approximation demo: line, semicircle, intraday stock price.
PlainSigmoidNet vs ProjectResidualNet, ~600 params each.
Images saved to same directory as this script.
"""
import os
import torch
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# Save next to this script (same dir as the markdown)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.environ.get("OUT_DIR", SCRIPT_DIR)
os.makedirs(OUT_DIR, exist_ok=True)
print(f"Output dir: {OUT_DIR}")

SEEDS = list(range(7))
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Device: {DEVICE}")

# ── Models ────────────────────────────────────────────────────────────────────

class PlainSigmoidNet(torch.nn.Module):
    def __init__(self, hidden_size=200):
        super().__init__()
        self.net = torch.nn.Sequential(
            torch.nn.Linear(1, hidden_size),
            torch.nn.Sigmoid(),
            torch.nn.Linear(hidden_size, 1),
        )
    def forward(self, x):
        return self.net(x)


class ProjectResidualNet(torch.nn.Module):
    def __init__(self, width=16, residual_blocks=2):
        super().__init__()
        self.project = torch.nn.Linear(1, width)
        self.residual_layers = torch.nn.ModuleList(
            [torch.nn.Linear(width, width) for _ in range(residual_blocks)]
        )
        self.output = torch.nn.Linear(width, 1)

    def forward(self, x):
        h = self.project(x)
        for layer in self.residual_layers:
            h = h + torch.sigmoid(layer(h))
        return self.output(h)


def count_params(m):
    return sum(p.numel() for p in m.parameters())


# ── Training ──────────────────────────────────────────────────────────────────

def train(model, x, y, steps=30_000, lr=1e-3, use_cosine=False):
    opt = torch.optim.Adam(model.parameters(), lr=lr)
    sched = (torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=steps, eta_min=1e-5)
             if use_cosine else None)
    for _ in range(steps):
        loss = torch.nn.functional.mse_loss(model(x), y)
        opt.zero_grad(); loss.backward(); opt.step()
        if sched: sched.step()
    with torch.no_grad():
        return torch.nn.functional.mse_loss(model(x), y).item()


def run_seeds(ModelClass, x, y, steps=30_000, lr=1e-3, use_cosine=False, **kw):
    results = []
    for seed in SEEDS:
        torch.manual_seed(seed)
        m = ModelClass(**kw).to(DEVICE)
        loss = train(m, x.to(DEVICE), y.to(DEVICE), steps=steps, lr=lr, use_cosine=use_cosine)
        results.append((loss, m))
    return results


# ── Target functions ──────────────────────────────────────────────────────────

def line_y(x):
    return 2.0 * x + 8.0


def semicircle_y(x):
    radius = 400.0
    inside = 1.0 - (x / radius) ** 2
    return radius * torch.sqrt(torch.clamp(inside, min=0.0))


def stock_y(x):
    """
    5-day stock pattern: trend + daily swings + intraday wiggles + small noise.
    Multi-frequency sum ensures the curve has realistic-looking ups/downs.
    Both PlainSigmoidNet (200 units) can learn the main structure well.
    """
    import math
    t = x / 100.0
    trend   = 220.0 + 5.0 * t
    daily   = 15.0 * torch.sin(t * 2.5 * math.pi)
    session =  6.0 * torch.sin(t * 7.5 * math.pi + 0.8)
    noise   =  2.5 * torch.sin(t * 15.0 * math.pi + 1.4)
    return trend + daily + session + noise


# ── Plot ──────────────────────────────────────────────────────────────────────

def make_plot(fname, suptitle, x_np, y_gt_np, pp, rp,
              train_lo, train_hi, ps, rs,
              ylabel="y", xlim=None, ylim=None, gt_mask=None):
    fig, axes = plt.subplots(1, 2, figsize=(13, 5))
    for ax, (subtitle, pred, stats) in zip(
        axes,
        [("Plain Sigmoid Network", pp, ps), ("Residual Network", rp, rs)],
    ):
        x_gt = x_np[gt_mask] if gt_mask is not None else x_np
        y_gt = y_gt_np[gt_mask] if gt_mask is not None else y_gt_np
        ax.plot(x_gt, y_gt, "--", color="#444", lw=1.8, label="Target", alpha=0.8)
        ax.plot(x_np, pred, "-", color=stats["color"], lw=2.2, label="Model prediction")
        ax.axvspan(train_lo, train_hi, alpha=0.12, color="#9ecae1", label="Training range")
        ax.set_title(
            f"{subtitle}\ntrain MSE = {stats['bt']:.2e}   eval MSE = {stats['ev']:.2f}",
            fontsize=10,
        )
        ax.set_xlabel("x"); ax.set_ylabel(ylabel)
        ax.legend(fontsize=8)
        if xlim: ax.set_xlim(*xlim)
        if ylim: ax.set_ylim(*ylim)
        ax.grid(True, alpha=0.3)
    fig.suptitle(suptitle, fontsize=12, fontweight="bold")
    plt.tight_layout()
    path = os.path.join(OUT_DIR, fname)
    plt.savefig(path, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"  Saved -> {path}")


# ═════════════════════════════════════════════════════════════════════════════
# 1. LINE
# ═════════════════════════════════════════════════════════════════════════════
print("\n-- Experiment 1: Line --")
x_tr  = torch.linspace(-100, 100,  1000).reshape(-1, 1)
x_pl  = torch.linspace(-500, 500,  2000).reshape(-1, 1)
y_tr, y_pl = line_y(x_tr), line_y(x_pl)

pr = run_seeds(PlainSigmoidNet, x_tr, y_tr, hidden_size=200)
rr = run_seeds(ProjectResidualNet, x_tr, y_tr, width=16, residual_blocks=2)
bp, br = min(pr, key=lambda r: r[0]), min(rr, key=lambda r: r[0])
print(f"  Plain params={count_params(bp[1])}  Resid params={count_params(br[1])}")

with torch.no_grad():
    pp = bp[1](x_pl.to(DEVICE)).cpu().squeeze().numpy()
    rp = br[1](x_pl.to(DEVICE)).cpu().squeeze().numpy()
    ep = torch.nn.functional.mse_loss(torch.tensor(pp), y_pl.squeeze()).item()
    er = torch.nn.functional.mse_loss(torch.tensor(rp), y_pl.squeeze()).item()

make_plot(
    "pytorch-raw-residual-600param-comparison-predictions-best.png",
    "Neural Network Learns a Straight Line  |  Training [-100,100], Eval [-500,500]",
    x_pl.squeeze().numpy(), y_pl.squeeze().numpy(), pp, rp, -100, 100,
    {"bt": bp[0], "ev": ep, "color": "#d62728"},
    {"bt": br[0], "ev": er, "color": "#1f77b4"},
    xlim=(-550, 550),
)
print(f"  Plain: best_train={bp[0]:.2e}  eval={ep:.2f}")
print(f"  Resid: best_train={br[0]:.2e}  eval={er:.4f}")


# ═════════════════════════════════════════════════════════════════════════════
# 2. SEMICIRCLE
# ═════════════════════════════════════════════════════════════════════════════
print("\n-- Experiment 2: Semicircle --")
x_tr2  = torch.linspace(-150, 150,  1000).reshape(-1, 1)
y_tr2, y_pl2 = semicircle_y(x_tr2), semicircle_y(x_pl)

pr2 = run_seeds(PlainSigmoidNet, x_tr2, y_tr2, hidden_size=200)
rr2 = run_seeds(ProjectResidualNet, x_tr2, y_tr2, width=16, residual_blocks=2)
bp2, br2 = min(pr2, key=lambda r: r[0]), min(rr2, key=lambda r: r[0])

vm = (x_pl.squeeze() >= -400) & (x_pl.squeeze() <= 400)
with torch.no_grad():
    pp2 = bp2[1](x_pl.to(DEVICE)).cpu().squeeze().numpy()
    rp2 = br2[1](x_pl.to(DEVICE)).cpu().squeeze().numpy()
    ep2 = torch.nn.functional.mse_loss(
        torch.tensor(pp2[vm.numpy()]), y_pl2.squeeze()[vm]).item()
    er2 = torch.nn.functional.mse_loss(
        torch.tensor(rp2[vm.numpy()]), y_pl2.squeeze()[vm]).item()

make_plot(
    "pytorch-raw-residual-600param-semicircle-train150-predictions.png",
    "Neural Network Learns a Semicircle  |  Training [-150,150], Eval [-400,400]",
    x_pl.squeeze().numpy(), y_pl2.squeeze().numpy(), pp2, rp2, -150, 150,
    {"bt": bp2[0], "ev": ep2, "color": "#d62728"},
    {"bt": br2[0], "ev": er2, "color": "#1f77b4"},
    xlim=(-550, 550), ylim=(-30, 480), gt_mask=vm.numpy(),
)
print(f"  Plain: best_train={bp2[0]:.2e}  eval[-400,400]={ep2:.2f}")
print(f"  Resid: best_train={br2[0]:.2e}  eval[-400,400]={er2:.2f}")


# ═════════════════════════════════════════════════════════════════════════════
# 3. STOCK PRICE  (sigmoid-only target — both nets can learn it)
# ═════════════════════════════════════════════════════════════════════════════
print("\n-- Experiment 3: 5-Day Stock Pattern --")
x_tr3  = torch.linspace(-100, 100,  1000).reshape(-1, 1)
x_pl3  = torch.linspace(-150, 150,  2000).reshape(-1, 1)
y_tr3, y_pl3 = stock_y(x_tr3), stock_y(x_pl3)

# Stock uses only PlainSigmoidNet (multi-freq target; illustrates universal approximation)
pr3 = run_seeds(PlainSigmoidNet, x_tr3, y_tr3, steps=80_000, lr=1e-3, use_cosine=True, hidden_size=200)
bp3 = min(pr3, key=lambda r: r[0])

with torch.no_grad():
    pp3 = bp3[1](x_pl3.to(DEVICE)).cpu().squeeze().numpy()
    ep3 = torch.nn.functional.mse_loss(torch.tensor(pp3), y_pl3.squeeze()).item()

# Single-panel plot for stock
fig, ax = plt.subplots(figsize=(10, 5))
x_np3 = x_pl3.squeeze().numpy()
ax.plot(x_np3, y_pl3.squeeze().numpy(), "--", color="#444", lw=1.5, label="Target (5-day stock)", alpha=0.75)
ax.plot(x_np3, pp3, "-", color="#d62728", lw=1.8, label="Plain Sigmoid (601 params)")
ax.axvspan(-100, 100, alpha=0.1, color="#9ecae1", label="Training range")
ax.set_title(
    f"Plain Sigmoid Network Learns 5-Day Stock Pattern  |  "
    f"Training [-100,100], Eval [-150,150]\ntrain MSE = {bp3[0]:.2e}   eval MSE = {ep3:.2f}",
    fontsize=10,
)
ax.set_xlabel("Time"); ax.set_ylabel("Price")
ax.legend(fontsize=9); ax.grid(True, alpha=0.3); ax.set_xlim(-160, 160)
plt.tight_layout()
stock_path = os.path.join(OUT_DIR, "pytorch-raw-residual-600param-stock-predictions.png")
plt.savefig(stock_path, dpi=150, bbox_inches="tight")
plt.close()
print(f"  Saved -> {stock_path}")
print(f"  Plain: best_train={bp3[0]:.2e}  eval={ep3:.2f}")
print(f"  Plain: best_train={bp3[0]:.2e}  eval={ep3:.2f}")

print("\n✓ All done.")
