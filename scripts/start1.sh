docker run --gpus all -itd \
  --shm-size 1000g \
  -p 20000:20000 \
  -v ~/gitroot:/root/gitroot -v /mnt:/mnt \
  --ipc=host \
  --privileged \
  --network host \
  --name dskf_lmsysorg \
  -e NCCL_IB_DISABLE=0 \
  -e NCCL_IB_HCA=mlx5_ib0,mlx5_ib1,mlx5_ib2,mlx5_ib3,mlx5_ib4,mlx5_ib5,mlx5_ib6,mlx5_ib7 \
  -e NCCL_IB_GID_INDEX=3 \
  -e NCCL_IB_TIMEOUT=22 \
  -e NCCL_IB_QPS_PER_CONNECTION=8 \
  -e NCCL_IB_RETRY_CNT=12 \
  -e NCCL_NET_GDR_LEVEL=PHB \
  -e NCCL_SOCKET_IFNAME=ib0 \
  -e NCCL_DEBUG=INFO \
  lmsysorg/sglang:latest \
  bash -c "python3 -m sglang.launch_server --model-path /mnt/nvme_raid0/gitroot/DeepSeek-R1-0528-BF16 --tp 32 --dist-init-addr 172.16.1.18:20000 --nnodes 4 --node-rank 1 --trust-remote-code "

