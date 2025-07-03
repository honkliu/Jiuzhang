docker run \
  --device=/dev/kfd \
  --device=/dev/dri \
  --security-opt seccomp=unconfined \
  --cap-add=SYS_PTRACE \
  --group-add video \
  --privileged \
  --shm-size 32g \
  --ipc=host \
  --name dskf \
  -p 30000:30000 \
  -v /mnt/resource_nvme:/mnt/resource_nvme \
  -e HF_HOME=/mnt/resource_nvme/hf_cache \
  -e HSA_NO_SCRATCH_RECLAIM=1 \
  -e GPU_FORCE_BLIT_COPY_SIZE=64 \
  -e DEBUG_HIP_BLOCK_SYN=1024 \
  rocm/sgl-dev:20250701 \
  python3 -m sglang.launch_server --model-path /mnt/resource_nvme/DeepSeek-R1-0528 --tp 8 --trust-remote-code --chunked-prefill-size 131072 --enable-torch-compile --torch-compile-max-bs 256 --host 0.0.0.0 --port 30000 --api-key=123 > /mnt/resource_nvme/gitroot/output.log 2>&1


