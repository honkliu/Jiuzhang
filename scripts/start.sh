node1: python3 -m sglang.launch_server --model-path /mnt/nvme_raid0/gitroot/DeepSeek-R1-0528-BF16 --tp 32 --dist-init-addr 10.0.0.4:20000 --nnodes 4 --node-rank 0 --trust-remote-code --host 0.0.0.0 --port 30000 -api-key=123 
node2: python3 -m sglang.launch_server --model-path /mnt/nvme_raid0/gitroot/DeepSeek-R1-0528-BF16 --tp 32 --dist-init-addr 10.0.0.4:20000 --nnodes 4 --node-rank 1 --trust-remote-code
node3: python3 -m sglang.launch_server --model-path /mnt/nvme_raid0/gitroot/DeepSeek-R1-0528-BF16 --tp 32 --dist-init-addr 10.0.0.4:20000 --nnodes 4 --node-rank 2 --trust-remote-code
node4: python3 -m sglang.launch_server --model-path /mnt/nvme_raid0/gitroot/DeepSeek-R1-0528-BF16 --tp 32 --dist-init-addr 10.0.0.4:20000 --nnodes 4 --node-rank 3 --trust-remote-code
