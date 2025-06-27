node1: 

  docker run --gpus all -itd --shm-size 1000g -p 30000:8000 -p 20000:20000  -v ~/gitroot:/root/gitroot -v /mnt:/mnt --ipc=host --privileged  -it  --name dskf_ lmsysorg/sglang:latest  bash

  python3 -m sglang.launch_server --model-path /mnt/nvme_raid0/gitroot/DeepSeek-R1-0528-BF16 --tp 32 --dist-init-addr 10.0.0.4:20000 --nnodes 4 --node-rank 0 --trust-remote-code --host 0.0.0.0 --port 8000 --api-key=123 > /mnt/nvme_raid0/gitroot/output.log 2>&1 

node2: 
  python3 -m sglang.launch_server --model-path /mnt/nvme_raid0/gitroot/DeepSeek-R1-0528-BF16 --tp 32 --dist-init-addr 10.0.0.4:20000 --nnodes 4 --node-rank 1 --trust-remote-code > /mnt/nvme_raid0/gitroot/output.log 2>&1


node3: 
  python3 -m sglang.launch_server --model-path /mnt/nvme_raid0/gitroot/DeepSeek-R1-0528-BF16 --tp 32 --dist-init-addr 10.0.0.4:20000 --nnodes 4 --node-rank 2 --trust-remote-code > /mnt/nvme_raid0/gitroot/output.log 2>&1

node4: 
  python3 -m sglang.launch_server --model-path /mnt/nvme_raid0/gitroot/DeepSeek-R1-0528-BF16 --tp 32 --dist-init-addr 10.0.0.4:20000 --nnodes 4 --node-rank 3 --trust-remote-code > /mnt/nvme_raid0/gitroot/output.log 2>&1
