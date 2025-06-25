#!/bin/bash

SRC_DIR="/mnt/nvme_raid0/gitroot/DeepSeek-R1-0528-BF16"
DEST_USER="hpcuser"
DEST_BASE="172.16.1."
DEST_START=122
DEST_DIR="/mnt/nvme_raid0/gitroot/DeepSeek-R1-0528-BF16"
KEY_FILE="$HOME/.ssh/a1001.pem"
BATCH_SIZE=8

# Detect InfiniBand IPs
SRC_IPS=($(ip -o -4 addr show | awk '/ib[0-9]/ {split($4,a,"/"); print a[1]}'))

cd "$SRC_DIR" || { echo "❌ Source directory not found: $SRC_DIR"; exit 1; }

mapfile -t FILES < <(find . -maxdepth 1 -type f)
TOTAL=${#FILES[@]}
NUM_LINKS=${#SRC_IPS[@]}
CHUNK=$(( (TOTAL + NUM_LINKS - 1) / NUM_LINKS ))

for i in "${!SRC_IPS[@]}"; do
  SRC_IP="${SRC_IPS[$i]}"
  DEST_IP="${DEST_BASE}$((DEST_START + i))"
  FILE_BATCH=("${FILES[@]:i*CHUNK:CHUNK}")

  (
    for ((j = 0; j < ${#FILE_BATCH[@]}; j += BATCH_SIZE)); do
      SUB_BATCH=("${FILE_BATCH[@]:j:BATCH_SIZE}")
      for f in "${SUB_BATCH[@]}"; do
        echo "➡️  [$SRC_IP → $DEST_IP] $f"
        scp -i "$KEY_FILE" -o BindAddress="$SRC_IP" "$f" "$DEST_USER@$DEST_IP:$DEST_DIR/"
      done
    done
  ) &
done

wait
echo "✅ All files transferred in batches of $BATCH_SIZE per IB interface."
