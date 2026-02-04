docker run \
  --device=/dev/kfd \
  --device=/dev/dri \
  --security-opt seccomp=unconfined \
  --cap-add=SYS_PTRACE \
  --group-add video \
  --privileged \
  --shm-size 32g \
  --ipc=host \
  --name dskf1 \
  -p 30000:30000 \
  -v /mnt/nvme_raid0:/mnt/nvme_raid0 \
  -e HF_HOME=/mnt/nvme_raid0/hf_cache \
  -e HSA_NO_SCRATCH_RECLAIM=1 \
  -e GPU_FORCE_BLIT_COPY_SIZE=64 \
  -e DEBUG_HIP_BLOCK_SYN=1024 \
  lmsysorg/sglang:v0.4.9.post1-rocm630-srt \
  python3 -m sglang.launch_server --model-path /mnt/nvme_raid0/huggingface/hub/models--deepseek-ai--De
epSeek-V3.1-Terminus/snapshots/19510d6dc61f79dbd925bd51ee8a9081c509a4b6 --tp 8 --trust-remote-code --c
hunked-prefill-size 131072 --torch-compile-max-bs 256 --host 0.0.0.0 --port 30000 > /mnt/nvme_raid0/gi
troot/output.log 2>&1
