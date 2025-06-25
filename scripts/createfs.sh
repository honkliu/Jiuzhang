
NVME_DEVICES=(
  /dev/nvme0n1
  /dev/nvme1n1
  /dev/nvme2n1
  /dev/nvme3n1
  /dev/nvme4n1
  /dev/nvme5n1
  /dev/nvme6n1
  /dev/nvme7n1
)

RAID_DEVICE="/dev/md0"
MOUNT_POINT="/mnt/nvme_raid0"

echo "[1/6] 安装 mdadm..."
sudo apt update && sudo apt install -y mdadm

echo "[2/6] 清空磁盘签名..."
for dev in "${NVME_DEVICES[@]}"; do
  sudo wipefs -a "$dev"
done

echo "[3/6] 创建 RAID 0 阵列..."
sudo mdadm --create --verbose "$RAID_DEVICE" --level=0 --raid-devices=8 "${NVME_DEVICES[@]}"

echo "[4/6] 格式化 EXT4 文件系统..."
sudo mkfs.ext4 "$RAID_DEVICE"

echo "[5/6] 挂载 RAID 阵列..."
sudo mkdir -p "$MOUNT_POINT"
sudo mount "$RAID_DEVICE" "$MOUNT_POINT"

echo "[6/6] 配置持久化挂载..."
sudo mdadm --detail --scan | sudo tee -a /etc/mdadm/mdadm.conf
sudo update-initramfs -u
echo "$RAID_DEVICE $MOUNT_POINT ext4 defaults,nofail,discard 0 0" | sudo tee -a /etc/fstab

echo "✅ RAID 0 配置完成，已挂载至 $MOUNT_POINT"

