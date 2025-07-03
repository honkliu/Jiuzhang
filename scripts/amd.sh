mkdir -p /mnt/resource_nvme/
sudo mdadm --create /dev/md128 -f --run --level 0 --raid-devices 8 $(ls /dev/nvme*n1)  
sudo mkfs.xfs -f /dev/md128 
sudo mount /dev/md128 /mnt/resource_nvme 
sudo chmod 1777 /mnt/resource_nvme  
mkdir –p /mnt/resource_nvme/hf_cache
export HF_HOME=/mnt/resource_nvme/hf_cache
mkdir -p /mnt/resource_nvme/docker
sudo tee /etc/docker/daemon.json > /dev/null <<EOF
{
    "data-root": "/mnt/resource_nvme/docker"
}
EOF
sudo chmod 0644 /etc/docker/daemon.json
sudo systemctl restart docker

